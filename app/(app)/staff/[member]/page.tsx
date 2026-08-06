// FILE: app/(app)/staff/[member]/page.tsx
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faUser, faEyeSlash } from '@fortawesome/free-solid-svg-icons';
import { getStaffMemberByName } from '@/lib/staff';
import { RANK_CONFIG } from '@/lib/staff-helpers';
import { getCurrentUser } from '@/lib/getCurrentUser';
import '../staff.css';

export default async function StaffMemberPage({ params }: { params: Promise<{ member: string }> }) {
  const { member } = await params;
  const decoded = decodeURIComponent(member);

  const [staffMember, currentUser] = await Promise.all([
    getStaffMemberByName(decoded),
    getCurrentUser(), // redirects to /login internally if not signed in
  ]);

  if (!staffMember) notFound();

  // NOTE: assumes getCurrentUser() exposes an `id` (profiles.id) field — adjust
  // this comparison if your user object uses a different key.
  const isOwnProfile = currentUser.id === staffMember.id;
  const statsHidden = staffMember.hideStats && !isOwnProfile;
  const cfg = RANK_CONFIG[staffMember.rank];

  return (
    <>
      <Link href="/staff" className="back-btn" style={{ marginBottom: 24, display: 'inline-flex' }}>
        <FontAwesomeIcon icon={faArrowLeft} /> Back to Staff Overview
      </Link>

      <div className="member-detail-card">
        <div className="member-detail-avatar">
          {staffMember.avatarUrl ? (
            <img src={staffMember.avatarUrl} alt="" />
          ) : (
            <FontAwesomeIcon icon={faUser} />
          )}
        </div>
        <div className="member-detail-name">{staffMember.name}</div>
        <div className="member-detail-rank">{cfg?.label ?? staffMember.rank}</div>

        {statsHidden ? (
          <div className="member-detail-soon">
            <FontAwesomeIcon icon={faEyeSlash} /> This member has hidden their stats.
          </div>
        ) : (
          <div className="member-detail-stats">
            <div className="member-stat">
              <div className="member-stat-value">{staffMember.daysAsStaff ?? '—'}</div>
              <div className="member-stat-label">Days as Staff</div>
            </div>
            <div className="member-stat">
              <div className="member-stat-value">{staffMember.sessionsAttended}</div>
              <div className="member-stat-label">Sessions Attended</div>
            </div>
            <div className="member-stat">
              <div className="member-stat-value">
                {staffMember.joined
                  ? new Date(staffMember.joined).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : '—'}
              </div>
              <div className="member-stat-label">Joined</div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}