// FILE: app/(app)/adminpanel/page.tsx
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/getCurrentUser';
import { visibleGroupsFor } from '@/lib/manageTables';
import ManageBoard from '../manage/ManageBoard';
import ViewAsPanel from './ViewAsPanel';
import './adminpanel.css';

export default async function AdminPanelPage() {
  const user = await getCurrentUser();
  if (user.effectivePermLevel < 20) redirect('/dashboard');

  const allGroups = visibleGroupsFor(user.effectivePermLevel);
  const adminGroups = {
    'Admin Only': allGroups['Admin Only'] ?? [],
    Content: allGroups['Content'] ?? [],
  };

  return (
    <div className="adminpanel-page">
      <ManageBoard permLevel={user.effectivePermLevel} groups={adminGroups} title="Admin Panel" viewingAs={user.viewingAs} />
    </div>
  );
}