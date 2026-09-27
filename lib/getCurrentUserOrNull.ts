import { cache } from 'react';
import { createClient } from '@/utils/supabase/server';
import type { CurrentUser } from './getCurrentUser';
import { DEFAULT_VIEW_AS_AUTHS } from '@/lib/viewAs/rankMap';

// Same lookup as getCurrentUser(), minus every redirect() call (including the
// Roblox-is-mandatory one) — this is only for pages that must render *something* for both
// signed-in and signed-out visitors (right now: /terms, /privacy, /cookies).
//
// Deliberately does NOT check for an active View As session — these are static legal
// pages with nothing role-gated on them, so there's no "effective" view worth simulating
// here. effective*/viewingAs below are just pass-throughs of the real values so this still
// satisfies the CurrentUser shape; if that ever changes (some role-gated content lands on
// a legal page), this needs the same viewingAs-cookie logic as getCurrentUser() added.
export const getCurrentUserOrNull = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) return null;

  const [{ data: profile }, { data: staffProfile }, { data: adminRow }] = await Promise.all([
    supabase
      .from('profiles')
      .select('discord_username, discord_server_name, discord_avatar_url, roblox_username, roblox_avatar_url')
      .eq('id', authUser.id)
      .single(),
    supabase.from('staff_profiles')
      .select('staff_rank, staff_perm_level, op_dept, host_auth, cohost_auth, asst_auth, comm_dept, eventh_auth, eventch_auth, ih_auth')
      .eq('id', authUser.id)
      .maybeSingle(),
    supabase.from('site_admins').select('admin_role').eq('id', authUser.id).maybeSingle(),
  ]);

  const isStaff = !!staffProfile;
  const isAdmin = !!adminRow;
  const rawRole = staffProfile?.staff_rank ?? '';
  const permLevel = staffProfile?.staff_perm_level ?? (isAdmin ? 20 : 0);
  const username = profile?.discord_server_name || profile?.discord_username || authUser.user_metadata?.user_name || 'Member';

  const realAuths = {
    op_dept: staffProfile?.op_dept ?? false,
    host_auth: staffProfile?.host_auth ?? false,
    cohost_auth: staffProfile?.cohost_auth ?? false,
    asst_auth: staffProfile?.asst_auth ?? false,
    comm_dept: staffProfile?.comm_dept ?? false,
    eventh_auth: staffProfile?.eventh_auth ?? false,
    eventch_auth: staffProfile?.eventch_auth ?? false,
    ih_auth: staffProfile?.ih_auth ?? false,
  };

  return {
    id: authUser.id,
    username,
    discordUsername: profile?.discord_username ?? null,
    avatarUrl: profile?.discord_avatar_url ?? null,
    robloxUsername: profile?.roblox_username ?? null,
    robloxAvatarUrl: profile?.roblox_avatar_url ?? null,
    rawRole,
    permLevel,
    isStaff,
    isAdmin,
    adminRole: adminRow?.admin_role ?? null,
    viewingAs: null,
    effectiveRole: rawRole,
    effectivePermLevel: permLevel,
    effectiveAuths: realAuths,
    effectiveIsStaff: isStaff,
    effectiveIsAdmin: isAdmin,
    effectiveUsername: username,
  };
});
