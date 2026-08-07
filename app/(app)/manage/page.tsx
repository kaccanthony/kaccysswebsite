// FILE: app/(app)/manage/page.tsx
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/getCurrentUser';
import { visibleGroupsFor } from '@/lib/manageTables';
import ManageBoard from './ManageBoard';

// Combined admin.php + managestaff.php. Same page for everyone with perm >= 15 — a Manager
// (15) only sees the boards/columns their minLevel allows, an Admin/Dev/Owner (20) sees the
// full board list (matches "manager restricted, admin/dev/owner sees everything").
export default async function ManagePage() {
  const user = await getCurrentUser();

  if (user.permLevel < 15) {
    redirect('/dashboard');
  }

  const groups = visibleGroupsFor(user.permLevel);

  return <ManageBoard permLevel={user.permLevel} groups={groups} />;
}