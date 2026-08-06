// FILE: app/(app)/managesession/page.tsx
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/getCurrentUser';
import { createClient } from '@/utils/supabase/server';
import ManageSessionInteractive, { type SessionRow, type StaffOption } from './ManageSessionInteractive';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMagnifyingGlass, faFilter, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import './managesession.css';

export const metadata = { title: 'Manage Sessions' };

export default async function ManageSessionPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; host?: string; success?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (user.permLevel < 10) redirect('/dashboard');

  const params = await searchParams;
  const search = params.search?.trim() ?? '';
  const status = params.status ?? '';
  const host = params.host?.trim() ?? '';

  const supabase = await createClient();

  let query = supabase.from('session_upcoming').select('*').order('session_date', { ascending: true }).order('session_time', { ascending: true });
  if (search) query = query.or(`session_id.eq.${parseInt(search, 10) || 0},host.ilike.%${search}%,session_name.ilike.%${search}%`);
  if (status) query = query.eq('session_status', status);
  if (host) query = query.ilike('host', `%${host}%`);

  const { data: sessions } = await query;

  // ── Staff eligibility now comes from real per-person auth booleans,
  // not rank tiers. Merges two sources: real staff (logged in at least
  // once, staff_profiles exists) + pre-registered staff_roster rows for
  // people who haven't logged in yet — see the staff_roster note in
  // database/profiles.sql for why that table exists.
  const AUTH_COLUMNS = 'staff_rank, op_dept, host_auth, cohost_auth, asst_auth, comm_dept, eventh_auth, eventch_auth, ih_auth';

  const [{ data: realStaffRows }, { data: rosterRows }] = await Promise.all([
    supabase.from('staff_profiles').select(`${AUTH_COLUMNS}, profiles(discord_username)`),
    supabase.from('staff_roster').select(`discord_username, ${AUTH_COLUMNS}`).eq('claimed', false),
  ]);

  const staff: StaffOption[] = [
    ...(realStaffRows ?? [])
      .map((row) => {
        const name = (row.profiles as unknown as { discord_username: string } | null)?.discord_username;
        return name ? { ...row, name } : null;
      })
      .filter((r): r is NonNullable<typeof r> => r !== null),
    ...(rosterRows ?? []).map((row) => ({ ...row, name: row.discord_username })),
  ].sort((a, b) => a.name.localeCompare(b.name));

//   const { data: rosterRows } = await supabase
//   .from('staff_roster')
//   .select(`discord_username, ${AUTH_COLUMNS}`)
//   .eq('claimed', false);

// const staff: StaffOption[] = (rosterRows ?? [])
//   .map((row) => ({
//     ...row,
//     name: row.discord_username,
//   }))
//   .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      {params.error && (
        <div className="error-banner">
          <FontAwesomeIcon icon={faTriangleExclamation} /> {params.error}
        </div>
      )}
      {params.success && <div className="success-banner">{params.success}</div>}

      <form className="filter-bar" method="GET">
        <div className="search-wrap">
          <FontAwesomeIcon icon={faMagnifyingGlass} className="search-icon" />
          <input type="text" name="search" className="search-input" placeholder="Search by ID, host, or session name…" defaultValue={search} autoComplete="off" />
        </div>
        <select name="status" className="filter-select" defaultValue={status}>
          <option value="">All Statuses</option>
          {['Requested', 'Scheduled', 'Booked', 'Cancelled', 'Postponed'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <input type="text" name="host" className="filter-input" placeholder="Filter by host…" defaultValue={host} />
        <button type="submit" className="btn-filter"><FontAwesomeIcon icon={faFilter} /> Filter</button>
        {(search || status || host) && <a href="/managesession" className="btn-clear-link">Clear</a>}
      </form>

      <ManageSessionInteractive
        sessions={(sessions ?? []) as SessionRow[]}
        staff={staff}
        rawRole={user.rawRole}
        permLevel={user.permLevel}
      />
    </>
  );
}