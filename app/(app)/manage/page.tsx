// FILE: app/(app)/manage/page.tsx
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/getCurrentUser';
import { visibleGroupsFor } from '@/lib/manageTables';
import ManageBoard from './ManageBoard';
import { createClient } from '@/utils/supabase/server';
import { canManageSiteTimezone, getSiteTimezoneMode } from '@/lib/siteTimezone';
import { canManageStaffStatsVisibility, getStaffStatsVisibility } from '@/lib/staffStatsVisibility';

export default async function ManagePage({
  searchParams,
}: {
  searchParams: Promise<{ panel?: string; success?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (user.permLevel < 15) redirect('/dashboard');
  const params = await searchParams;

  const groups = visibleGroupsFor(user.effectivePermLevel);
  const supabase = await createClient();
  const [timezoneMode, staffStatsVisibility] = await Promise.all([
    getSiteTimezoneMode(supabase),
    getStaffStatsVisibility(supabase),
  ]);
  // Admin Only + Content stay exclusive to /adminpanel — Announcements is now shared.
  delete groups['Admin Only'];
  delete groups['Content'];

  return (
    <ManageBoard
      permLevel={user.permLevel}
      groups={groups}
      timezoneMode={timezoneMode}
      canManageTimezone={canManageSiteTimezone(user)}
      staffStatsVisibility={staffStatsVisibility}
      canManageStaffStatsVisibility={canManageStaffStatsVisibility(user)}
      initialTimezonePanel={params.panel === 'timezone'}
      initialStaffStatsPanel={params.panel === 'staff-stats'}
      timezoneFeedback={params.error ? { type: 'error', message: params.error } : params.success ? { type: 'success', message: params.success } : null}
    />
  );
}
