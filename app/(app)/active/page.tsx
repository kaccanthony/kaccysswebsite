// FILE: app/active/page.tsx
// Replaces active.php
import { getCurrentUser } from '@/lib/getCurrentUser';
import { formatNameWithPrefix, getRoleLabel } from '@/lib/roles';
import { createClient } from '@/utils/supabase/server';
import { fetchSession, buildRowsFromSession } from '@/lib/activeSession';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faCirclePause } from '@fortawesome/free-solid-svg-icons';
import PublicRowsTable from './PublicRowsTable';
import './active.css';

export const metadata = {
  title: 'Active Session',
};

export default async function ActiveSessionPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;

  const user = await getCurrentUser(); // redirects to /login internally if not signed in
  const supabase = await createClient();

  const sessionIdNum = session_id ? parseInt(session_id, 10) : undefined;
  const session = await fetchSession(supabase, sessionIdNum);
  const rows = session ? buildRowsFromSession(session) : [];

  const roleInfo = { rawRole: user.rawRole, isStaff: user.isStaff, isAdmin: user.isAdmin };
  const displayName = formatNameWithPrefix(user.username, roleInfo);
  const roleLabel = getRoleLabel(roleInfo);

  return (
    <>
      <div id="bg" />

      <header className="topbar">
        <div className="logo-wrap">
          <div className="pulse-ring" />
          <div className="pulse-ring ring2" />
          <img src="/images/YSSLogo.png" alt="YSS Logo" className="logo-img" draggable={false} />
        </div>
        <span className="app-name">YSS Session Manager</span>
        <div className="live-pill">
          <span className="live-dot" /> LIVE SESSION
        </div>
        <span className="sync-note" id="sync-note">
          synced 2s ago
        </span>
        <a href="/dashboard" className="back-btn">
          <FontAwesomeIcon icon={faArrowLeft} /> Dashboard
        </a>

        <ActiveTopbar username={displayName} role={roleLabel} avatarUrl={user.avatarUrl} />
      </header>

      <main>
        <div className="session-head">
          <div>
            <div className="session-title">
              Session #{session ? session.session_id : '—'} — {session?.host ?? ''}
            </div>
            <div className="session-sub">Public view · read-only — trainee progress only</div>
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
                <PublicRowsTable sessionId={session.session_id} initialRows={rows} />
              </table>
            </div>
          </section>
        )}
      </main>
    </>
  );
}