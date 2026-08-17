// app/api/session/[id]/conclude/route.ts
// Replaces conclude_session.php. The multi-table transaction (staff logs, post
// logs, per-trainee full/feedback logs, driver logs, quota bumps, then delete)
// lives in the conclude_session() Postgres function so it's atomic — this route
// just checks the caller is the host and invokes it.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessionId = Number((await params).id);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (Number(body.session_id) !== sessionId) {
    return NextResponse.json({ success: false, message: 'Missing session_id.' }, { status: 400 });
  }

  const { error } = await supabase.rpc('conclude_session', { p_session_id: sessionId });
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
