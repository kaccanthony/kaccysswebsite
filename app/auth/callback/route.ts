// FILE: app/auth/callback/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { syncDiscordRoles } from '@/lib/discordSync';
import { NOTIF_DEFAULTS } from '@/lib/settings';

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

      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('notif_prefs')
        .eq('id', data.user.id)
        .maybeSingle();
      const notifPrefs = {
        ...NOTIF_DEFAULTS,
        ...((existingProfile?.notif_prefs as Record<string, string> | null) ?? {}),
      };

      const { error: upsertError } = await supabase.from('profiles').upsert({
        id: data.user.id,
        discord_id: discordId,
        discord_username: meta.full_name ?? meta.name ?? meta.user_name ?? meta.preferred_username ?? '',
        discord_avatar_url: meta.avatar_url ?? meta.picture ?? null,
        notif_prefs: notifPrefs,
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
        const [{ data: existingStaffProfile }, { data: rosterRow }] = await Promise.all([
          admin.from('staff_profiles').select('id').eq('id', data.user.id).maybeSingle(),
          admin
            .from('staff_roster')
            .select('staff_rank, staff_joined, staff_perm_level, op_dept, host_auth, cohost_auth, asst_auth, comm_dept, eventh_auth, eventch_auth, ih_auth, claimed')
            .eq('discord_id', discordId)
            .maybeSingle(),
        ]);

        if (rosterRow) {
          let claimError: { message: string } | null = null;
          if (!existingStaffProfile || !rosterRow.claimed) {
            const result = await admin.from('staff_profiles').upsert({
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
            claimError = result.error;
          }

          if (claimError) {
            console.error('staff_profiles claim upsert failed:', claimError.message);
          } else if (!rosterRow.claimed) {
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
      // Fully onboarded accounts (Roblox already linked) honor `next` — e.g. the Settings
      // "Sync Discord Info" button. Anyone still mid-onboarding always goes through /login,
// since that page is what routes them to whichever step (Roblox linking, etc.) is left.
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('roblox_username')
        .eq('id', data.user.id)
        .maybeSingle();
      const alreadyOnboarded = !!profileRow?.roblox_username;

      return NextResponse.redirect(`${origin}${alreadyOnboarded ? next : '/login'}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
