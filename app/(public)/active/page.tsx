// Public, read-only active-session view. Private controls remain under (app).
import Link from 'next/link';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown, faCirclePause, faUser } from '@fortawesome/free-solid-svg-icons';
import AppShell from '@/app/(app)/AppShell';
import { formatNameWithPrefix, getRoleLabel } from '@/lib/roles';
import { getCurrentUserOrNull } from '@/lib/getCurrentUserOrNull';
import { createAdminClient } from '@/utils/supabase/admin';
import { createClient } from '@/utils/supabase/server';
import { fetchSession, buildRowsFromSession } from '@/lib/activeSession';
import PublicRowsTable from '@/app/(app)/active/PublicRowsTable';
import ReportNoSession from '@/app/(app)/active/ReportNoSession';
import LiveStatus from '@/app/(app)/active/LiveStatus';
import '../../(app)/active/active.css';

export const metadata = {
  title: 'Active Session',
};

export default async function ActiveSessionPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;
  const sessionIdNum = session_id ? parseInt(session_id, 10) : undefined;
  const [session, user] = await Promise.all([
    fetchSession(createAdminClient(), sessionIdNum),
    getCurrentUserOrNull(),
  ]);

  const rows = session ? buildRowsFromSession(session) : [];
  const persistedChange = session?.last_updated ?? session?.started_at;
  const initialLastChangeAt = persistedChange ? new Date(String(persistedChange)).getTime() : null;

  let assignedSessions: { sessionId: number; label: string }[] = [];
  let unreadCount = 0;
  let hasAssignedLiveSession = false;
  if (user) {
    const supabase = await createClient();
    const [
      { data: assignment },
      { data: recipients },
      { data: reads },
    ] = await Promise.all([
      session
        ? supabase.from('session_staff').select('role').eq('session_id', session.session_id).eq('staff_name', user.effectiveUsername).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from('notification_recipients').select('notif_id').eq('profile_id', user.id),
      supabase.from('notification_reads').select('notif_id').eq('profile_id', user.id),
    ]);
    const readIds = new Set((reads ?? []).map((row) => row.notif_id));
    unreadCount = (recipients ?? []).filter((row) => !readIds.has(row.notif_id)).length;
    if (assignment && session) {
      const roleCode = assignment.role.split(',')[0].trim();
      const roleLabel = roleCode === 'HOST' ? 'Host'
        : roleCode.startsWith('CH_') ? `Co-Host ${roleCode.slice(3)}`
          : roleCode.startsWith('AST_') ? `Assistant ${roleCode.slice(4)}`
            : 'Additional Staff';
      assignedSessions = [{ sessionId: session.session_id, label: `LIVE NOW — ${roleLabel}` }];
      hasAssignedLiveSession = true;
    }
  }

  const content = (
    <>
      <main>
        <div className="session-topbar">
          <div className="session-head">
            <div className="session-title">
              Session #{session ? session.session_id : '—'} — {session?.host ?? ''}
            </div>
            <div className="session-sub">Public view · read-only — trainee progress only</div>
          </div>

          <div className="session-topbar-right">
            {session ? <LiveStatus sessionId={session.session_id} /> : <ReportNoSession />}
          </div>
        </div>

        {!session ? (
          <section className="panel">
            <div className="empty-state">
              <FontAwesomeIcon icon={faCirclePause} /> No session is currently active.
            </div>
          </section>
        ) : (
          <section className="panel">
            <div className="panel-title">Trainees Panel</div>
            <div className="table-wrap">
              <table className="public-table" id="public-table">
                <thead>
                  <tr>
                    <th>Slot</th>
                    <th>Trainee Discord</th>
                    <th>Roblox</th>
                    <th>Zone</th>
                    <th>Trainer</th>
                    <th>Completed</th>
                  </tr>
                </thead>
                <PublicRowsTable
                  sessionId={session.session_id}
                  initialRows={rows}
                  initialLastChangeAt={Number.isFinite(initialLastChangeAt) ? initialLastChangeAt : null}
                />
              </table>
            </div>
          </section>
        )}
      </main>
    </>
  );

  if (user) {
    const roleInfo = {
      rawRole: user.effectiveRole,
      isStaff: user.effectiveIsStaff,
      isAdmin: user.effectiveIsAdmin,
    };
    return (
      <AppShell
        serverNow={Date.now()}
        hasLiveSession={hasAssignedLiveSession}
        liveSessionLastChangeAt={hasAssignedLiveSession && Number.isFinite(initialLastChangeAt) ? initialLastChangeAt : null}
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
      >
        {content}
      </AppShell>
    );
  }

  return (
    <>
      <header className="guest-topbar">
        <Link href="/active" className="guest-brand">
          <img src="/images/YSSLogo.png" alt="" />
          <span>YSS Central</span>
        </Link>
        <details className="guest-profile">
          <summary aria-label="Guest profile and sign-in options">
            <span className="guest-avatar"><FontAwesomeIcon icon={faUser} /></span>
            <span className="guest-profile-meta"><strong>Guest viewer</strong><small>Public access</small></span>
            <FontAwesomeIcon icon={faChevronDown} className="guest-chevron" />
          </summary>
          <div className="guest-profile-menu">
            <strong>Welcome to YSS Central</strong>
            <p>You can view the active trainee panel without an account. Sign in to access your profile and the rest of the website.</p>
            <Link href="/login">Sign in or create a profile</Link>
          </div>
        </details>
      </header>
      <div className="bg-app" />
      {content}
    </>
  );
}
