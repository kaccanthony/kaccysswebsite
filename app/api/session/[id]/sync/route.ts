// app/api/session/[id]/sync/route.ts
// Replaces sync_session.php. Realtime pushes the resulting row to every client
// automatically (see useSessionRealtime) — this route's only job is the same one
// sync_session.php had: whitelist which columns are writable, and deep-merge
// live_state so one tab's timer tick can't stomp another tab's bell/staff edit
// that landed a moment earlier.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import type { LiveState, SessionOngoingRow } from '@/types/session';

const CORE_COLUMNS = new Set([
  'session_status', 'host', 'co_host1', 'co_host2', 'co_host3', 'co_host4/supervisor',
  'assistant_1', 'assistant_2', 'assistant_3', 'assistant_4',
  'staff_attendance', 'trainee_attendance', 'additional_notes',
  // session_date / session_time / trainee_timer are real session_ongoing columns
  // (see db.txt) that the Session Details panel edits — previously missing here,
  // which meant those edits were silently accepted client-side but never
  // actually written to the database.
  'session_date', 'session_time', 'trainee_timer',
  ...Array.from({ length: 10 }, (_, i) => i + 1).flatMap((t) => [
    `trainee_${t}_name`, `trainee_${t}_discord`, `trainee_${t}_discord_id`,
    `trainee_${t}_zone`, `trainee_${t}_note`, `trainee_${t}_trainer_name`,
  ]),
]);

const KEYED_MERGE_FIELDS = ['timers', 'completedRows', 'timeTracker'] as const;

function mergeLiveState(existing: LiveState, incoming: Partial<LiveState>): LiveState {
  const merged: LiveState = { ...existing, ...incoming };

  for (const field of KEYED_MERGE_FIELDS) {
    if (incoming[field]) {
      (merged as any)[field] = { ...(existing as any)[field], ...(incoming as any)[field] };
    }
  }

  if (incoming.unallocatedTrainees) {
    const byUid = new Map((existing.unallocatedTrainees ?? []).map((u) => [u.uid, u]));
    for (const u of incoming.unallocatedTrainees) byUid.set(u.uid, u);
    const incomingUids = new Set(incoming.unallocatedTrainees.map((u) => u.uid));
    merged.unallocatedTrainees = [...byUid.values()].filter((u) => incomingUids.has(u.uid));
  }

  return merged;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessionId = Number((await params).id);
  const supabase = await createClient();
  const { data: session, error } = await supabase
    .from('session_ongoing')
    .select('*')
    .eq('session_id', sessionId)
    .single();

  if (error || !session) return NextResponse.json({ success: false, message: 'Session not found.' }, { status: 404 });

  return NextResponse.json({
    success: true,
    session,
    live_state: (session as SessionOngoingRow).live_state ?? {},
    last_updated: session.last_updated,
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessionId = Number((await params).id);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ success: false, message: 'Invalid payload.' }, { status: 400 });

  const patch: Record<string, unknown> = {};

  if (body.updates && typeof body.updates === 'object') {
    for (const [col, val] of Object.entries(body.updates)) {
      if (CORE_COLUMNS.has(col)) patch[col] = val;
    }
  }

  if (body.live_state && typeof body.live_state === 'object') {
    const { data: current } = await supabase
      .from('session_ongoing')
      .select('live_state')
      .eq('session_id', sessionId)
      .single();
    patch.live_state = mergeLiveState((current?.live_state as LiveState) ?? {}, body.live_state);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ success: false, message: 'Nothing to update.' }, { status: 400 });
  }

  patch.last_updated = new Date().toISOString();

  const { data: fresh, error } = await supabase
    .from('session_ongoing')
    .update(patch)
    .eq('session_id', sessionId)
    .select('*')
    .single();

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

  // No need to broadcast manually — the UPDATE above fires the postgres_changes
  // event every subscribed client (including this one) picks up via useSessionRealtime.
  return NextResponse.json({
    success: true,
    session: fresh,
    live_state: (fresh as SessionOngoingRow).live_state ?? {},
    last_updated: fresh.last_updated,
  });
}