// FILE: app/(app)/staff/page.tsx
import { getStaffByRank } from '@/lib/staff';
import StaffGrid from './StaffGrid';
import './staff.css';

export const metadata = { title: 'Staff Overview' };

export default async function StaffPage() {
  const staffByRank = await getStaffByRank();

  return (
    <>
      <div className="section-label">Staff Overview</div>
      <p className="section-sub">Everyone currently on the roster — tap a card to view their profile.</p>
      <StaffGrid staffByRank={staffByRank} />
    </>
  );
}