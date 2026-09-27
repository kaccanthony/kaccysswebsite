// FILE: app/(app)/setup/page.tsx
import { getCurrentUser } from '@/lib/getCurrentUser';
import { createClient } from '@/utils/supabase/server';
import SetupSessionInteractive from './SetupSessionInteractive';
import type { SessionRow, StaffOption } from '../managesession/ManageSessionInteractive';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { currentSiteTimeParts, getSiteTimezoneMode } from '@/lib/siteTimezone';
import './setupsesh.css';
import { SESSION_UPCOMING_COLUMNS } from '@/lib/supabase/columns';

export const metadata = { title: 'Setup Session' };

export default async function SetupSessionPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  const params = await searchParams;
  const supabase = await createClient();
  const timezoneMode = await getSiteTimezoneMode(supabase);

  const { date: todayBST } = currentSiteTimeParts(timezoneMode);

  const { data: sessions } = await supabase
    .from('session_upcoming')
    .select(SESSION_UPCOMING_COLUMNS)
    .eq('session_date', todayBST)
    .eq('session_booked', true)
    .in('session_status', ['Booked', 'Scheduled'])
    .order('session_time', { ascending: true });

  const sessionIds = (sessions ?? []).map((s) => s.session_id);

  // .in('session_id', []) with an empty array is safe — returns no rows
  // rather than erroring, so no ternary fallback needed (that pattern is
  // what caused the never[] type error we already hit once in managesession).
  const [{ data: staffRows }, { data: traineeRows }] = await Promise.all([
    supabase.from('session_staff').select('staff_row_id, session_id, role, staff_name, attended, notes').in('session_id', sessionIds),
    supabase.from('session_trainees').select('trainee_row_id, session_id, slot_number, is_standby, trainee_roblox_username, trainee_discord, trainee_discord_id, zone, note, trainer_name, attended').in('session_id', sessionIds).order('slot_number', { ascending: true }),
  ]);

  const staffBySession = new Map<number, typeof staffRows>();
  for (const row of staffRows ?? []) {
    if (!staffBySession.has(row.session_id)) staffBySession.set(row.session_id, []);
    staffBySession.get(row.session_id)!.push(row);
  }
  const traineesBySession = new Map<number, typeof traineeRows>();
  for (const row of traineeRows ?? []) {
    if (!traineesBySession.has(row.session_id)) traineesBySession.set(row.session_id, []);
    traineesBySession.get(row.session_id)!.push(row);
  }

  const allSessionsToday = (sessions ?? []).map((s) => ({
    ...s,
    staffRows: staffBySession.get(s.session_id) ?? [],
    traineeRows: traineesBySession.get(s.session_id) ?? [],
  })) as SessionRow[];

  // Scoped to "assigned to you, today" — host now lives in session_staff,
  // not a column we could filter by at the query level, so this filter
  // happens after the join.
  // Uses effectiveUsername, not user.username — a 'person' mode View As session
  // (dev impersonating a specific staff member) needs this page to show THEIR
  // sessions, not the real signed-in dev's. 'rank' mode sessions have no
  // personLabel, so effectiveUsername just falls back to the real name and this
  // behaves exactly as before for that case.
  const mySessions = allSessionsToday.filter((s) =>
    s.staffRows.some((r) => (r.role === 'HOST' || r.role.startsWith('HOST,')) && r.staff_name === user.effectiveUsername)
  );

  // Same staff-eligibility merge as managesession/page.tsx — needed for the
  // modal's StaffSelect dropdowns if the host needs to fill in/adjust
  // co-hosts or assistants right before going live.
  const AUTH_COLUMNS = 'staff_rank, op_dept, host_auth, cohost_auth, asst_auth, comm_dept, eventh_auth, eventch_auth, ih_auth';

  const [{ data: realStaffRows }, { data: rosterRows }] = await Promise.all([
    supabase.from('staff_profiles').select(`${AUTH_COLUMNS}, profiles(discord_username, discord_id)`),
    supabase.from('staff_roster').select(`discord_id, discord_username, ${AUTH_COLUMNS}`),
  ]);

  const staffByIdentity = new Map<string, StaffOption>();
  for (const row of rosterRows ?? []) {
    staffByIdentity.set((row.discord_id || row.discord_username).toLowerCase(), {
      name: row.discord_username,
      staff_rank: row.staff_rank,
      op_dept: row.op_dept,
      host_auth: row.host_auth,
      cohost_auth: row.cohost_auth,
      asst_auth: row.asst_auth,
      comm_dept: row.comm_dept,
      eventh_auth: row.eventh_auth,
      eventch_auth: row.eventch_auth,
      ih_auth: row.ih_auth,
    });
  }
  for (const row of realStaffRows ?? []) {
    const profile = row.profiles as unknown as { discord_username: string | null; discord_id: string | null } | null;
    const name = profile?.discord_username;
    if (!name) continue;
    staffByIdentity.set((profile.discord_id || name).toLowerCase(), {
      name,
      staff_rank: row.staff_rank,
      op_dept: row.op_dept,
      host_auth: row.host_auth,
      cohost_auth: row.cohost_auth,
      asst_auth: row.asst_auth,
      comm_dept: row.comm_dept,
      eventh_auth: row.eventh_auth,
      eventch_auth: row.eventch_auth,
      ih_auth: row.ih_auth,
    });
  }
  const staff = [...staffByIdentity.values()].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      {params.error && (
        <div className="error-banner">
          <FontAwesomeIcon icon={faTriangleExclamation} /> {params.error}
        </div>
      )}

      <SetupSessionInteractive
        sessions={mySessions}
        staff={staff}
        timezoneMode={timezoneMode}
        initialSelectedId={params.session_id ? parseInt(params.session_id, 10) : undefined}
      />
    </>
  );
}
