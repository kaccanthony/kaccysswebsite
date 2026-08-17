// app/api/session/[id]/bell/route.ts
// Replaces bell_state.php. All the ack-timeout / cooldown / re-ring / max-rings
// logic now lives in the bell_ring / bell_ack Postgres functions (see
// supabase/sql/session_realtime_setup.sql) so it's atomic under concurrent
// requests without a lockfile — this route is just a thin RPC caller.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import type { BellRole } from '@/types/session';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessionId = Number((await params).id);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('session_bell_state')
    .select('*')
    .eq('session_id', sessionId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? { session_id: sessionId, active: false, acks: {} });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessionId = Number((await params).id);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const action: string = body?.action;
  const role: BellRole = body?.role;
  const clientId: string = body?.client_id ?? '';

  if (!['ring', 'ack'].includes(action)) {
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  }

  const rpcName = action === 'ring' ? 'bell_ring' : 'bell_ack';
  const rpcArgs =
    action === 'ring'
      ? { p_session_id: sessionId, p_role: role, p_client_id: clientId }
      : { p_session_id: sessionId, p_role: role };

  const { data, error } = await supabase.rpc(rpcName, rpcArgs);
  if (error) {
    // Map the RPC's raised exceptions to the same 403/409/429 the PHP version used —
    // the message text is what the SQL function raised, so match on substrings.
    const msg = error.message || 'Bell error';
    const status = /only|invalid/i.test(msg) ? 403 : /cooling|no active|no more/i.test(msg) ? 409 : /too fast/i.test(msg) ? 429 : 400;
    return NextResponse.json({ error: msg }, { status });
  }

  return NextResponse.json(data);
}
