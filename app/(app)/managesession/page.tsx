// FILE: app/(app)/managesession/page.tsx
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/getCurrentUser';
import { createClient } from '@/utils/supabase/server';
import ManageSessionInteractive, { type SessionRow, type StaffOption } from './ManageSessionInteractive';
import { getSiteTimezoneMode } from '@/lib/siteTimezone';
import './managesession.css';
import { SESSION_UPCOMING_COLUMNS } from '@/lib/supabase/columns';

export const metadata = { title: 'Manage Sessions' };

interface StaffQueryRow {
  session_id: number;
  role: string;
  staff_name: string;
  attended: boolean;
  notes: string | null;
}

interface TraineeQueryRow {
  session_id: number;
  slot_number: number;
  is_standby: boolean;
  trainee_roblox_username: string | null;
  trainee_discord: string | null;
  trainee_discord_id: string | null;
  zone: number | null;
  note: string | null;
  trainer_name: string | null;
  attended: boolean;
}

export default async function ManageSessionPage() {
  const user = await getCurrentUser();
  if (user.effectivePermLevel < 10) redirect('/dashboard');

  const supabase = await createClient();
  const timezoneMode = await getSiteTimezoneMode(supabase);

  // No server-side search/filter params anymore — the full list loads once,
  // and ManageSessionInteractive filters it live in the browser as you type.
  const { data: sessions } = await supabase
    .from('session_upcoming')
    .select(SESSION_UPCOMING_COLUMNS)
    .order('session_date', { ascending: true })
    .order('session_time', { ascending: true });

  const sessionIds = (sessions ?? []).map((s) => s.session_id);

  const [{ data: staffRowsRaw }, { data: traineeRowsRaw }] = sessionIds.length
    ? await Promise.all([
        supabase.from('session_staff').select('staff_row_id, session_id, role, staff_name, attended, notes').in('session_id', sessionIds),
        supabase.from('session_trainees').select('trainee_row_id, session_id, slot_number, is_standby, trainee_roblox_username, trainee_discord, trainee_discord_id, zone, note, trainer_name, attended').in('session_id', sessionIds).order('slot_number', { ascending: true }),
      ])
    : [{ data: [] }, { data: [] }];

  // Cast explicitly instead of trusting Supabase's inferred type here — if
  // the client is using generated Database types from before these tables
  // existed, queries against them silently infer as `never`, which is what
  // was actually causing the "type never" build error.
  const staffRows = (staffRowsRaw ?? []) as unknown as StaffQueryRow[];
  const traineeRows = (traineeRowsRaw ?? []) as unknown as TraineeQueryRow[];

  const staffBySession = new Map<number, StaffQueryRow[]>();
  for (const row of staffRows) {
    if (!staffBySession.has(row.session_id)) staffBySession.set(row.session_id, []);
    staffBySession.get(row.session_id)!.push(row);
  }
  const traineesBySession = new Map<number, TraineeQueryRow[]>();
  for (const row of traineeRows ?? []) {
    if (!traineesBySession.has(row.session_id)) traineesBySession.set(row.session_id, []);
    traineesBySession.get(row.session_id)!.push(row);
  }

  const sessionsWithChildren = (sessions ?? []).map((s) => ({
    ...s,
    staffRows: staffBySession.get(s.session_id) ?? [],
    traineeRows: traineesBySession.get(s.session_id) ?? [],
  }));

  // ── Staff eligibility now comes from real per-person auth booleans,
  // not rank tiers. Merges two sources: real staff (logged in at least
  // once, staff_profiles exists) + pre-registered staff_roster rows for
  // people who haven't logged in yet — see the staff_roster note in
  // database/profiles.sql for why that table exists.
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
      <ManageSessionInteractive
        sessions={sessionsWithChildren as SessionRow[]}
        staff={staff}
        rawRole={user.effectiveRole}
        permLevel={user.effectivePermLevel}
        timezoneMode={timezoneMode}
      />
  );
}
