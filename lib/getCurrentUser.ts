import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';

export interface CurrentUser {
  id: string;
  username: string;
  avatarUrl: string | null;
  rawRole: string; // '' if not staff — matches ROLE_CARDS[''] in lib/roles.ts
  permLevel: number;
  isStaff: boolean;
  isAdmin: boolean;
  adminRole: string | null;
}

// React's cache() dedupes this per-request — layout.tsx and page.tsx both
// calling getCurrentUser() only hits Supabase once, not twice.
export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    redirect('/login');
  }

  const [{ data: profile }, { data: staffProfile }, { data: adminRow }] = await Promise.all([
    supabase.from('profiles').select('discord_username, discord_avatar_url').eq('id', authUser.id).single(),
    supabase.from('staff_profiles').select('staff_rank, staff_perm_level').eq('id', authUser.id).maybeSingle(),
    supabase.from('site_admins').select('admin_role').eq('id', authUser.id).maybeSingle(),
  ]);

  const isStaff = !!staffProfile;
  const isAdmin = !!adminRow;
  const rawRole = staffProfile?.staff_rank ?? '';
  const permLevel = staffProfile?.staff_perm_level ?? (isAdmin ? 20 : 0);

  if (isStaff && !rawRole) {
    redirect('/login?error=no_role_assigned');
  }

  return {
    id: authUser.id,
    username: profile?.discord_username || authUser.user_metadata?.user_name || 'Member',
    avatarUrl: profile?.discord_avatar_url ?? null,
    rawRole,
    permLevel,
    isStaff,
    isAdmin,
    adminRole: adminRow?.admin_role ?? null,
  };
});