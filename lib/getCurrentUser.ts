// FILE: lib/getCurrentUser.ts
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { decodeViewAsCookie, VIEW_AS_COOKIE_NAME } from '@/lib/viewAs/cookie';
import type { ViewAsAuthFlags } from '@/lib/viewAs/rankMap';

export interface ViewAsState {
  rank: string;
  permLevel: number;
  auths: ViewAsAuthFlags;
  personLabel?: string;
}

export interface CurrentUser {
  id: string;
  username: string;
  discordUsername: string | null;
  avatarUrl: string | null;
  robloxUsername: string | null;
  robloxAvatarUrl: string | null;
  rawRole: string; // '' if not staff
  permLevel: number;
  isStaff: boolean;
  isAdmin: boolean;
  adminRole: string | null;
  // Real identity above is NEVER overwritten by View As. viewingAs is a display-only
  // overlay — only effectiveRole/effectivePermLevel should ever be used to decide what's
  // *shown*. RLS, API routes, and server actions must keep using rawRole/permLevel.
  viewingAs: ViewAsState | null;
  effectiveRole: string;
  effectivePermLevel: number;
  effectiveAuths: ViewAsAuthFlags;
  effectiveIsStaff: boolean;
  effectiveIsAdmin: boolean;
  // Real display identity (server nickname, falling back to Discord username) unless
  // a 'person' mode View As session is active, in which case this becomes the
  // impersonated staff member's label. 'rank' mode
  // sessions have no personLabel, so this correctly falls back to the real name —
  // rank-only simulation was never meant to change *whose* sessions/data show up,
  // only what card-visibility tier is being previewed.
  effectiveUsername: string;
}

// React's cache() dedupes this per-request.
export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    redirect('/login');
  }

  const [{ data: profile }, { data: staffProfile }, { data: adminRow }] = await Promise.all([
    supabase
      .from('profiles')
      .select('discord_username, discord_server_name, discord_avatar_url, roblox_username, roblox_avatar_url')
      .eq('id', authUser.id)
      .single(),
    supabase.from('staff_profiles')
  .select('staff_rank, staff_perm_level, op_dept, host_auth, cohost_auth, asst_auth, comm_dept, eventh_auth, eventch_auth, ih_auth')
  .eq('id', authUser.id).maybeSingle(),
    supabase.from('site_admins').select('admin_role').eq('id', authUser.id).maybeSingle(),
  ]);

  // Roblox is mandatory — defense in depth. /login itself handles showing the right step,
  // so anyone missing it just gets bounced back there.
  if (!profile?.roblox_username) {
    redirect('/login');
  }

  const isStaff = !!staffProfile;
  const isAdmin = !!adminRow;
  const rawRole = staffProfile?.staff_rank ?? '';
  const permLevel = staffProfile?.staff_perm_level ?? (isAdmin ? 20 : 0);
  const realUsername = profile?.discord_server_name || profile?.discord_username || authUser.user_metadata?.user_name || 'Member';

  if (isStaff && !rawRole) {
    redirect('/login?error=no_role_assigned');
  }

    const realAuths: ViewAsAuthFlags = {
    op_dept: staffProfile?.op_dept ?? false,
    host_auth: staffProfile?.host_auth ?? false,
    cohost_auth: staffProfile?.cohost_auth ?? false,
    asst_auth: staffProfile?.asst_auth ?? false,
    comm_dept: staffProfile?.comm_dept ?? false,
    eventh_auth: staffProfile?.eventh_auth ?? false,
    eventch_auth: staffProfile?.eventch_auth ?? false,
    ih_auth: staffProfile?.ih_auth ?? false,
  };

  // Only Admin-level accounts (perm 20, either via staff_perm_level or site_admins) can ever
  // have an active View As session — decodeViewAsCookie also checks the signature + expiry +
  // that the cookie's adminId matches this user, so a non-admin can never end up with a
  // spoofed viewingAs even with a stale/forged cookie sitting in their browser.
  let viewingAs: ViewAsState | null = null;
  if (permLevel >= 20) {
    const raw = (await cookies()).get(VIEW_AS_COOKIE_NAME)?.value;
    const payload = decodeViewAsCookie(raw, authUser.id);
    if (payload) viewingAs = { rank: payload.rank, permLevel: payload.permLevel, auths: payload.auths, personLabel: payload.personLabel };
  }

  return {
    id: authUser.id,
    username: realUsername,
    discordUsername: profile?.discord_username ?? null,
    avatarUrl: profile?.discord_avatar_url ?? null,
    robloxUsername: profile?.roblox_username ?? null,
    robloxAvatarUrl: profile?.roblox_avatar_url ?? null,
    rawRole,
    permLevel,
    isStaff,
    isAdmin,
    adminRole: adminRow?.admin_role ?? null,
    viewingAs,
    effectiveRole: viewingAs?.rank ?? rawRole,
    effectivePermLevel: viewingAs?.permLevel ?? permLevel,
    effectiveAuths: viewingAs?.auths ?? realAuths,
    effectiveIsStaff: viewingAs ? viewingAs.permLevel > 0 : isStaff,
    effectiveIsAdmin: viewingAs ? false : isAdmin,
    effectiveUsername: viewingAs?.personLabel ?? realUsername,
  };
});
