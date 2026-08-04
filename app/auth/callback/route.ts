import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // Supabase Auth already created the auth.users row — this mirrors the
      // Discord identity into our own `profiles` table so staff_profiles/
      // site_admins have something to join against (see database/profiles.sql).
      const identity = data.user.identities?.find((i) => i.provider === 'discord');
      const meta = data.user.user_metadata;

      await supabase.from('profiles').upsert({
        id: data.user.id,
        discord_id: identity?.id ?? null,
        discord_username: meta.full_name ?? meta.name ?? meta.user_name ?? '',
        discord_avatar_url: meta.avatar_url ?? null,
        updated_at: new Date().toISOString(),
      });

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}