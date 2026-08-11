// FILE: app/auth/callback/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { syncDiscordRoles } from '@/lib/discordSync';

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
      const discordId = identity?.id ?? null;
      const meta = data.user.user_metadata;

      const { error: upsertError } = await supabase.from('profiles').upsert({
        id: data.user.id,
        discord_id: discordId,
        discord_username: meta.full_name ?? meta.name ?? meta.user_name ?? meta.preferred_username ?? '',
        discord_avatar_url: meta.avatar_url ?? meta.picture ?? null,
        updated_at: new Date().toISOString(),
      });

      if (upsertError) {
        console.error('profiles upsert failed:', upsertError.message);
      }

      // ── Claim a pre-registered staff_roster row, if one exists ──
      // Uses the admin client since this row isn't "owned" by the user
      // yet (no profiles/auth.users link existed when it was created) —
      // normal RLS wouldn't allow reading/updating it any other way.
      if (discordId) {
        const admin = createAdminClient();
        const { data: rosterRow } = await admin
          .from('staff_roster')
          .select('*')
          .eq('discord_id', discordId)
          .eq('claimed', false)
          .maybeSingle();

        if (rosterRow) {
          const { error: claimError } = await supabase.from('staff_profiles').upsert({
            id: data.user.id,
            staff_rank: rosterRow.staff_rank,
            staff_joined: rosterRow.staff_joined,
            staff_perm_level: rosterRow.staff_perm_level,
            op_dept: rosterRow.op_dept,
            host_auth: rosterRow.host_auth,
            cohost_auth: rosterRow.cohost_auth,
            asst_auth: rosterRow.asst_auth,
            comm_dept: rosterRow.comm_dept,
            eventh_auth: rosterRow.eventh_auth,
            eventch_auth: rosterRow.eventch_auth,
            ih_auth: rosterRow.ih_auth,
          });

          if (claimError) {
            console.error('staff_profiles claim upsert failed:', claimError.message);
          } else {
            await admin
              .from('staff_roster')
              .update({ claimed: true, claimed_at: new Date().toISOString() })
              .eq('discord_id', discordId);
          }
        }
      }

      // Reads real Discord server roles via the user's own OAuth token
      // (guilds.members.read) — no bot required. No-ops safely if
      // DISCORD_GUILD_ID isn't set yet, or the API call fails for any reason.
      await syncDiscordRoles(supabase, data.session?.provider_token, data.user.id);

      // Back to /login — it checks Roblox status itself and shows the
      // right step (or redirects to /dashboard if both are already done).
      return NextResponse.redirect(`${origin}/login`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}