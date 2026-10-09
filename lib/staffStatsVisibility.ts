import type { SupabaseClient } from '@supabase/supabase-js';

export type StaffStatsVisibility = 'full' | 'basic';

export const DEFAULT_STAFF_STATS_VISIBILITY: StaffStatsVisibility = 'full';
export const STAFF_STATS_VISIBILITY_SETTING_KEY = 'public_staff_stats_visibility';

export function canManageStaffStatsVisibility(user: {
  isAdmin: boolean;
  adminRole: string | null;
  rawRole: string;
}): boolean {
  return (
    (user.isAdmin && ['owner', 'developer', 'moderator'].includes(user.adminRole ?? ''))
    || ['Operations Manager', 'Community Manager'].includes(user.rawRole)
  );
}

export function parseStaffStatsVisibility(value: unknown): StaffStatsVisibility {
  return value === 'basic' || value === 'full' ? value : DEFAULT_STAFF_STATS_VISIBILITY;
}

export async function getStaffStatsVisibility(supabase: SupabaseClient): Promise<StaffStatsVisibility> {
  const { data, error } = await supabase
    .from('site_settings')
    .select('setting_value')
    .eq('setting_key', STAFF_STATS_VISIBILITY_SETTING_KEY)
    .maybeSingle();

  // Existing deployments remain on the full view until the setting migration runs.
  if (error || !data) return DEFAULT_STAFF_STATS_VISIBILITY;
  return parseStaffStatsVisibility(data.setting_value);
}
