// FILE: app/(app)/active/page.tsx
// Replaces active.php
import { getCurrentUser } from '@/lib/getCurrentUser';
import { createClient } from '@/utils/supabase/server';
import { fetchSession, buildRowsFromSession } from '@/lib/activeSession';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCirclePause } from '@fortawesome/free-solid-svg-icons';
import PublicRowsTable from './PublicRowsTable';
import ReportNoSession from './ReportNoSession';
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

  await getCurrentUser(); // redirects to /login internally if not signed in
  const supabase = await createClient();

  const sessionIdNum = session_id ? parseInt(session_id, 10) : undefined;
  const session = await fetchSession(supabase, sessionIdNum);
  const rows = session ? buildRowsFromSession(session) : [];
  const persistedChange = session?.last_updated ?? session?.started_at;
  const initialLastChangeAt = persistedChange ? new Date(String(persistedChange)).getTime() : null;

  return (
    <main>
      <div className="session-topbar">
        <div className="session-head">
          <div className="session-title">
            Session #{session ? session.session_id : '—'} — {session?.host ?? ''}
          </div>
          <div className="session-sub">Public view · read-only — trainee progress only</div>
        </div>

        <div className="session-topbar-right">
          {!session && <ReportNoSession />}
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
  );
}
