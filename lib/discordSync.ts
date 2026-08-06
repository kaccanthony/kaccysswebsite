// FILE: lib/discordSync.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { DISCORD_ROLE_MAP } from './roles';

// Set this once you know your server's ID (Discord: enable Developer Mode,
// right-click your server icon → Copy Server ID).
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID;

// The real Discord role ID for your "Developer" role (right-click the role
// in Server Settings → Roles → Copy Role ID). Separate from DISCORD_ROLE_MAP
// since this one grants site admin, not a staff_rank.
const DISCORD_DEV_ROLE_ID = process.env.DISCORD_DEV_ROLE_ID;

/**
 * Called once per login, right after the Supabase session exists. Uses the
 * user's OWN Discord access token (session.provider_token) — requires the
 * guilds.members.read scope, which is already being requested. No bot needed.
 *
 * Safe by design: only ever INSERTs/UPDATEs staff_profiles or site_admins
 * when a matching role is found. Never deletes — losing a Discord role, or
 * this call failing/guild not configured, never silently strips access.
 */
export async function syncDiscordRoles(
  supabase: SupabaseClient,
  providerToken: string | null | undefined,
  profileId: string
): Promise<void> {
  if (!providerToken) {
    console.error('Discord role sync skipped: no provider_token on this session.');
    return;
  }
  if (!DISCORD_GUILD_ID) {
    console.error('Discord role sync skipped: DISCORD_GUILD_ID is not set.');
    return;
  }

  const res = await fetch(`https://discord.com/api/users/@me/guilds/${DISCORD_GUILD_ID}/member`, {
    headers: { Authorization: `Bearer ${providerToken}` },
  });

  if (!res.ok) {
    console.error(`Discord guild member lookup failed: ${res.status} ${await res.text()}`);
    return;
  }
  const member = await res.json();
  const roleIds: string[] = member.roles ?? [];
  console.log('Discord role sync — roles found:', roleIds);

  // ── Staff rank ──
  for (const roleId of roleIds) {
    const rank = DISCORD_ROLE_MAP[roleId];
    if (rank) {
      const { error } = await supabase
        .from('staff_profiles')
        .upsert({ id: profileId, staff_rank: rank, staff_joined: new Date().toISOString().slice(0, 10) }, { onConflict: 'id', ignoreDuplicates: false });
      if (error) console.error('staff_profiles upsert failed:', error.message);
      break; // first match wins — adjust if you want multi-rank support later
    }
  }

  // ── Dev/admin auto-grant ──
  if (DISCORD_DEV_ROLE_ID && roleIds.includes(DISCORD_DEV_ROLE_ID)) {
    const { error } = await supabase
      .from('site_admins')
      .upsert({ id: profileId, admin_role: 'developer' }, { onConflict: 'id', ignoreDuplicates: true }); // ignoreDuplicates: don't overwrite an existing 'owner' grant
    if (error) console.error('site_admins upsert failed:', error.message);
  } else if (!DISCORD_DEV_ROLE_ID) {
    console.error('DISCORD_DEV_ROLE_ID is not set — dev role auto-grant is disabled.');
  }
}