import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { buildRowsFromSession, fetchSession } from '@/lib/activeSession';

export async function GET(req: NextRequest) {
  const sessionId = Number(req.nextUrl.searchParams.get('session_id'));
  if (!Number.isSafeInteger(sessionId) || sessionId <= 0) {
    return NextResponse.json({ rows: [], message: 'Invalid session id.' }, { status: 400 });
  }

  // This endpoint exposes only the same read-only fields rendered by /active.
  // Use the service client because session tables are otherwise authenticated-only.
  const session = await fetchSession(createAdminClient(), sessionId);
  if (!session) return NextResponse.json({ rows: [] }, { status: 404 });

  const persistedChange = session.last_updated ?? session.started_at;
  const lastChangeAt = persistedChange ? new Date(String(persistedChange)).getTime() : null;
  return NextResponse.json({
    rows: buildRowsFromSession(session),
    lastChangeAt: Number.isFinite(lastChangeAt) ? lastChangeAt : null,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
