// FILE: lib/apiAuth.ts
import { createClient } from '@/utils/supabase/server';

export interface ApiUser {
  id: string;
  permLevel: number;
  isAdmin: boolean;
}

/**
 * Same permission logic as getCurrentUser(), minus the redirect() call — getCurrentUser()
 * is meant for Server Components/layouts; API routes need a plain null on failure so the
 * route can return a proper 401/403 JSON response instead of throwing NEXT_REDIRECT.
 */
export async function getApiUser(): Promise<ApiUser | null> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) return null;

  const [{ data: staffProfile }, { data: adminRow }] = await Promise.all([
    supabase.from('staff_profiles').select('staff_perm_level').eq('id', authUser.id).maybeSingle(),
    supabase.from('site_admins').select('admin_role').eq('id', authUser.id).maybeSingle(),
  ]);

  const isAdmin = !!adminRow;
  const permLevel = staffProfile?.staff_perm_level ?? (isAdmin ? 20 : 0);

  return { id: authUser.id, permLevel, isAdmin };
}