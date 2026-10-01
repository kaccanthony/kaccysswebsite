import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getApiUser } from '@/lib/apiAuth';
import { deleteFromR2 } from '@/lib/r2';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessionId = Number((await params).id);
  if (!Number.isSafeInteger(sessionId) || sessionId <= 0) {
    return NextResponse.json({ success: false, message: 'Invalid session ID.' }, { status: 400 });
  }

  const user = await getApiUser();
  if (!user) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (Number(body.session_id) !== sessionId) {
    return NextResponse.json({ success: false, message: 'Missing session_id.' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('discord_id, discord_username')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) {
    return NextResponse.json({ success: false, message: profileError.message }, { status: 500 });
  }

  // Managers may force-conclude from /manage; everyone else must be this
  // session's assigned Host. The service-role RPC is never exposed directly.
  if (user.permLevel < 15 && !user.isAdmin) {
    const { data: staff, error: staffError } = await supabase
      .from('session_staff')
      .select('role, staff_name')
      .eq('session_id', sessionId);
    if (staffError) {
      return NextResponse.json({ success: false, message: staffError.message }, { status: 500 });
    }
    const username = profile?.discord_username?.trim().toLowerCase();
    const isHost = username && staff?.some((row) =>
      (row.role === 'HOST' || row.role.startsWith('HOST,'))
      && row.staff_name.trim().toLowerCase() === username
    );
    if (!isHost) return NextResponse.json({ success: false, message: 'Only the Host or a manager can conclude this session.' }, { status: 403 });
  }

  const actorDiscordId = profile?.discord_id && /^\d{1,19}$/.test(profile.discord_id)
    && BigInt(profile.discord_id) <= BigInt('9223372036854775807')
    ? profile.discord_id
    : null;
  const admin = createAdminClient();
  const { error } = await admin.rpc('archive_session_conclusion', {
    p_session_id: sessionId,
    p_actor_discord_id: actorDiscordId,
  });
  if (error) {
    const message = error.code === 'PGRST202'
      ? 'Archive migration is not installed. Run database/archive_session_conclusion.sql before concluding sessions.'
      : error.message;
    return NextResponse.json({ success: false, message }, { status: 500 });
  }

  // A tab closed during upload can leave a pending reservation after the live
  // session has been archived. Ready images are linked to feedback log IDs by
  // the archive migration before the live trainee rows are deleted.
  const { data: pending } = await admin.from('feedback_images').select('id, object_key')
    .eq('session_id', sessionId).eq('status', 'pending');
  for (const image of pending ?? []) {
    try {
      await deleteFromR2(image.object_key);
      await admin.from('feedback_images').delete().eq('id', image.id).eq('status', 'pending');
    } catch { /* Do not undo a successful session archive for cleanup failure. */ }
  }

  return NextResponse.json({ success: true });
}
