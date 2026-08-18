// FILE: app/(app)/manage/page.tsx
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/getCurrentUser';
import { visibleGroupsFor } from '@/lib/manageTables';
import ManageBoard from './ManageBoard';

export default async function ManagePage() {
  const user = await getCurrentUser();
  if (user.permLevel < 15) redirect('/dashboard');

  const groups = visibleGroupsFor(user.effectivePermLevel);
  // Admin Only + Content stay exclusive to /adminpanel — Announcements is now shared.
  delete groups['Admin Only'];
  delete groups['Content'];

  return <ManageBoard permLevel={user.permLevel} groups={groups} />;
}