'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/getCurrentUser';
import {
  canManageStaffStatsVisibility,
  parseStaffStatsVisibility,
  STAFF_STATS_VISIBILITY_SETTING_KEY,
} from '@/lib/staffStatsVisibility';
import { createClient } from '@/utils/supabase/server';

export async function updatePublicStaffStatsVisibility(formData: FormData) {
  const fail = (message: string): never => redirect(`/manage?panel=staff-stats&error=${encodeURIComponent(message)}`);
  const user = await getCurrentUser();
  if (!canManageStaffStatsVisibility(user)) fail('You do not have permission to change public staff stats visibility.');

  const requestedValue = formData.get('stats_visibility');
  if (requestedValue !== 'full' && requestedValue !== 'basic') fail('Invalid staff stats visibility mode.');
  const visibility = parseStaffStatsVisibility(requestedValue);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('site_settings')
    .update({
      setting_value: visibility,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq('setting_key', STAFF_STATS_VISIBILITY_SETTING_KEY)
    .select('setting_value')
    .single();

  if (error || !data) {
    fail(`Could not update public staff stats. Run database/public_staff_stats_visibility.sql first. ${error?.message ?? 'Setting row was not found.'}`);
  }

  revalidatePath('/staff');
  revalidatePath('/manage');
  redirect(`/manage?panel=staff-stats&success=${encodeURIComponent(
    visibility === 'full' ? 'Public department stats are now visible.' : 'Public staff profiles now show basic information only.'
  )}`);
}
