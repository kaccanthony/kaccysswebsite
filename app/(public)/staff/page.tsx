import { getPublicStaff } from '@/lib/staff';
import StaffGrid from './StaffGrid';

export const metadata = { title: 'Staff Overview' };

export default async function StaffPage() {
  const { current, archived } = await getPublicStaff();
  return (
    <div className="staff-public-page">
      <header className="staff-public-header">
        <div className="section-label">Staff Overview</div>
        <p className="section-sub">Meet the current team. Select a card for the full Operations and Community stats.</p>
      </header>
      <StaffGrid current={current} archived={archived} />
    </div>
  );
}
