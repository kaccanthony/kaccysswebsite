import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { buildRowsFromSession, fetchSession } from '@/lib/activeSession';

export async function GET(req: NextRequest) {
  const sessionId = Number(req.nextUrl.searchParams.get('session_id'));
  if (!Number.isSafeInteger(sessionId) || sessionId <= 0) {
    return NextResponse.json({ rows: [], message: 'Invalid session id.' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ rows: [] }, { status: 401 });

  const session = await fetchSession(supabase, sessionId);
  if (!session) return NextResponse.json({ rows: [] }, { status: 404 });

  const persistedChange = session.last_updated ?? session.started_at;
  const lastChangeAt = persistedChange ? new Date(String(persistedChange)).getTime() : null;
  return NextResponse.json({
    rows: buildRowsFromSession(session),
    lastChangeAt: Number.isFinite(lastChangeAt) ? lastChangeAt : null,
  });
}
