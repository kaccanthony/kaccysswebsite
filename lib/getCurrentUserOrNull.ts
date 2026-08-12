import { cache } from 'react';
import { createClient } from '@/utils/supabase/server';
import type { CurrentUser } from './getCurrentUser';

// Same lookup as getCurrentUser(), minus every redirect() call (including the
// Roblox-is-mandatory one) — this is only for pages that must render *something* for both
// signed-in and signed-out visitors (right now: /terms, /privacy, /cookies).
export const getCurrentUserOrNull = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) return null;

  const [{ data: profile }, { data: staffProfile }, { data: adminRow }] = await Promise.all([
    supabase
      .from('profiles')
      .select('discord_username, discord_avatar_url, roblox_username, roblox_avatar_url')
      .eq('id', authUser.id)
      .single(),
    supabase.from('staff_profiles').select('staff_rank, staff_perm_level').eq('id', authUser.id).maybeSingle(),
    supabase.from('site_admins').select('admin_role').eq('id', authUser.id).maybeSingle(),
  ]);

  const isStaff = !!staffProfile;
  const isAdmin = !!adminRow;
  const rawRole = staffProfile?.staff_rank ?? '';
  const permLevel = staffProfile?.staff_perm_level ?? (isAdmin ? 20 : 0);

  return {
    id: authUser.id,
    username: profile?.discord_username || authUser.user_metadata?.user_name || 'Member',
    avatarUrl: profile?.discord_avatar_url ?? null,
    robloxUsername: profile?.roblox_username ?? null,
    robloxAvatarUrl: profile?.roblox_avatar_url ?? null,
    rawRole,
    permLevel,
    isStaff,
    isAdmin,
    adminRole: adminRow?.admin_role ?? null,
  };
});