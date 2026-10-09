import Link from 'next/link';
import Image from 'next/image';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown, faUser } from '@fortawesome/free-solid-svg-icons';
import AppShell, { type AssignedSession } from '@/app/(app)/AppShell';
import OngoingActivityPill from '@/app/(app)/OngoingActivityPill';
import { getCurrentUserOrNull } from '@/lib/getCurrentUserOrNull';
import { formatNameWithPrefix, getRoleLabel } from '@/lib/roles';
import { getOngoingActivity } from '@/lib/ongoingActivity';
import { currentSiteTimeParts, getSiteTimezoneMode } from '@/lib/siteTimezone';
import { createAdminClient } from '@/utils/supabase/admin';
import { createClient } from '@/utils/supabase/server';
import StaffHeaderBackLink from './StaffHeaderBackLink';
import './staff.css';

function serverRenderTime(): number { return Date.now(); }
const assignmentLabels: Record<string, string> = {
  HOST: 'Host', CH_1: 'CH 1', CH_2: 'CH 2', CH_3: 'CH 3', CH_4: 'CH 4 / SV',
  AST_1: 'AST 1', AST_2: 'AST 2', AST_3: 'AST 3', AST_4: 'AST 4',
};
function assignmentLabel(role: string | undefined): string {
  return role ? assignmentLabels[role] ?? 'Additional Staff' : 'Additional Staff';
}

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const [user, ongoingActivity] = await Promise.all([
    getCurrentUserOrNull(),
    getOngoingActivity(createAdminClient()),
  ]);

  if (user) {
    const db = await createClient();
    const [{ data: recipients }, { data: reads }, { data: assignments }, timezoneMode] = await Promise.all([
      db.from('notification_recipients').select('notif_id').eq('profile_id', user.id),
      db.from('notification_reads').select('notif_id').eq('profile_id', user.id),
      db.from('session_staff').select('session_id, role').eq('staff_name', user.effectiveUsername),
      getSiteTimezoneMode(db),
    ]);
    const readIds = new Set((reads ?? []).map(row => row.notif_id));
    const unreadCount = (recipients ?? []).filter(row => !readIds.has(row.notif_id)).length;
    const sessionIds = [...new Set((assignments ?? []).map(row => row.session_id))];
    const assignedSessions: AssignedSession[] = [];
    let hasLiveSession = false;
    let liveSessionLastChangeAt: number | null = null;
    if (sessionIds.length) {
      const { date, time } = currentSiteTimeParts(timezoneMode);
      const [{ data: live }, { data: upcoming }] = await Promise.all([
        db.from('session_ongoing').select('session_id, last_updated, started_at').in('session_id', sessionIds).order('started_at', { ascending: false, nullsFirst: false }).limit(8),
        db.from('session_upcoming').select('session_id, session_date, session_time').in('session_id', sessionIds)
          .in('session_status', ['Booked', 'Scheduled']).eq('session_booked', true)
          .or(`session_date.gt.${date},and(session_date.eq.${date},session_time.gte.${time})`)
          .order('session_date', { ascending: true }).order('session_time', { ascending: true }).limit(8),
      ]);
      const roleBySession = new Map((assignments ?? []).map(row => [row.session_id, row.role.split(',')[0].trim()]));
      const liveIds = new Set((live ?? []).map(row => row.session_id));
      hasLiveSession = liveIds.size > 0;
      for (const row of live ?? []) {
        assignedSessions.push({ sessionId: row.session_id, label: `LIVE NOW — ${assignmentLabel(roleBySession.get(row.session_id))}` });
      }
      const lastChange = live?.[0]?.last_updated ?? live?.[0]?.started_at;
      if (lastChange) liveSessionLastChangeAt = new Date(lastChange).getTime();
      for (const row of upcoming ?? []) {
        if (liveIds.has(row.session_id) || assignedSessions.length >= 8) continue;
        const dateLabel = new Date(`${row.session_date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
        assignedSessions.push({ sessionId: row.session_id, label: `${dateLabel}, ${row.session_time.slice(0, 5)} ${timezoneMode} — ${assignmentLabel(roleBySession.get(row.session_id))}` });
      }
    }
    const roleInfo = { rawRole: user.effectiveRole, isStaff: user.effectiveIsStaff, isAdmin: user.effectiveIsAdmin };
    return (
      <AppShell
        serverNow={serverRenderTime()}
        user={{
          username: formatNameWithPrefix(user.effectiveUsername, roleInfo),
          role: getRoleLabel(roleInfo),
          avatarUrl: user.robloxAvatarUrl ?? user.avatarUrl,
          rawRole: user.effectiveRole,
          isAdmin: user.effectiveIsAdmin,
          adminRole: user.adminRole,
        }}
        assignedSessions={assignedSessions}
        unreadCount={unreadCount}
        ongoingActivity={ongoingActivity}
        hasLiveSession={hasLiveSession}
        liveSessionLastChangeAt={liveSessionLastChangeAt}
        headerLeading={<StaffHeaderBackLink />}
      >{children}</AppShell>
    );
  }

  return (
    <>
      <div className="bg-app" />
      <header className="guest-topbar">
        <div className="guest-topbar-left">
          <Link href="/staff" className="guest-brand">
            <Image src="/images/YSSLogo.png" alt="" width={36} height={36} />
            <span>YSS Central</span>
          </Link>
          <StaffHeaderBackLink />
        </div>
        <div className="guest-topbar-right">
          <Link className="staff-guest-nav" href="/active">Active session</Link>
          <OngoingActivityPill initialActivity={ongoingActivity} publicView />
          <details className="guest-profile">
            <summary aria-label="Guest profile and sign-in options">
              <span className="guest-avatar"><FontAwesomeIcon icon={faUser} /></span>
              <span className="guest-profile-meta"><strong>Guest viewer</strong><small>Public access</small></span>
              <FontAwesomeIcon icon={faChevronDown} className="guest-chevron" />
            </summary>
            <div className="guest-profile-menu">
              <strong>Welcome to YSS Central</strong>
              <p>View staff profiles and department stats without an account.</p>
              <Link href="/login">Sign in or create a profile</Link>
            </div>
          </details>
        </div>
      </header>
      <main className="main">{children}</main>
    </>
  );
}
