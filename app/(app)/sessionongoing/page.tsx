// app/(app)/sessionongoing/page.tsx
// Replaces sessionongoing.php's server-side block: fetch the session + staff
// directory, compute the viewer's role by staff_id (not username), stamp
// started_at on first load, and hand everything to the client component.
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getCurrentUser } from '@/lib/getCurrentUser';
import { formatRoleDisplay } from '@/lib/roles';
import { isInternalHelperRole } from '@/lib/sessionStaffTrainees';
import { getSiteTimezoneMode, siteWallTimeToISOString } from '@/lib/siteTimezone';
import { mergePrefs, parseStaffTraineeWarningTimes } from '@/lib/settings';
import SessionOngoingClient from './SessionOngoingClient';
import type { LiveState, SessionOngoingRow, StaffShiftRow, ViewerRole } from '@/types/session';
import { SESSION_ONGOING_COLUMNS } from '@/lib/supabase/columns';

export default async function SessionOngoingPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const sessionId = Number((await searchParams).session_id ?? 0);
  if (!sessionId) redirect('/setupsesh');

  const supabase = await createClient();
  const user = await getCurrentUser();
  const admin = createAdminClient();
  const timezoneMode = await getSiteTimezoneMode(supabase);

  const { data: sessionRow } = await supabase
    .from('session_ongoing')
    .select(SESSION_ONGOING_COLUMNS)
    .eq('session_id', sessionId)
    .single();
  if (!sessionRow) redirect('/setupsesh');

  // Stamp started_at exactly once, first time anyone opens the session — same as
  // sessionongoing.php's `if (empty($sessionRow['started_at']))` block.
  let startedAt = sessionRow.started_at as string | null;
  if (!startedAt) {
    startedAt = new Date().toISOString();
    await admin.from('session_ongoing').update({ started_at: startedAt }).eq('session_id', sessionId);
  }

  // Overtime uses selected site mode while Supabase timestamps remain UTC.
  const scheduledStartIso = sessionRow.session_date && sessionRow.session_time
    ? siteWallTimeToISOString(sessionRow.session_date, sessionRow.session_time, timezoneMode)
    : null;

  // profiles only permits users to select their own row. This server-only,
  // field-limited directory query therefore uses the service role after the
  // page has authenticated the viewer above.
  // session_ongoing has NO host/co_host1-4/assistant_1-4 columns — those live
  // as rows in session_staff (role + staff_name), see db.txt. Pull this
  // session's assignments from there instead of the old flat-column read.
  //
  // IMPORTANT: role codes are 'HOST' / 'CH_1'-'CH_4' / 'AST_1'-'AST_4', optionally
  // suffixed ", IH" (see managesession/actions.ts PRIMARY_ROLES) — NOT the human
  // labels 'Host'/'Co-Host'/'Assistant'. Matching against those human labels (the
  // previous version of this query) always returned zero rows, which is why the
  // host dropdown showed None and why every viewer fell through to the default
  // 'Assistant' role regardless of who they actually were on the session.
  const [
    { data: staffDirectoryRows },
    { data: staffRows },
    { data: traineeRows },
    { data: driverRows },
    { data: viewerProfile },
  ] = await Promise.all([
    admin.from('staff_profiles').select('id, staff_rank, profiles!inner(discord_username, discord_id)'),
    supabase.from('session_staff').select('staff_row_id, role, staff_name, attended, notes').eq('session_id', sessionId),
    supabase
      .from('session_trainees')
      .select('trainee_row_id, slot_number, is_standby, trainee_roblox_username, trainee_discord, trainee_discord_id, zone, note, trainer_name, attended')
      .eq('session_id', sessionId)
      .order('slot_number', { ascending: true }),
    supabase
      .from('session_drivers')
      .select('driver_row_id, discord_username, roblox_username, attended')
      .eq('session_id', sessionId)
      .order('driver_row_id', { ascending: true }),
    supabase.from('profiles').select('notif_prefs').eq('id', user.id).maybeSingle(),
  ]);

  const viewerNotifPrefs = mergePrefs(viewerProfile?.notif_prefs as Record<string, string> | null);
  const prefTraineeWarning = viewerNotifPrefs.staff_trainee_warning !== '0';
  const prefTraineeWarningTimes = parseStaffTraineeWarningTimes(viewerNotifPrefs.staff_trainee_warning_time);
  const prefTraineeSound = viewerNotifPrefs.staff_trainee_sound !== '0';
  const prefAnnouncementDisplay = ['toast', 'banner', 'fullscreen'].includes(viewerNotifPrefs.staff_announcement_display)
    ? viewerNotifPrefs.staff_announcement_display as 'toast' | 'banner' | 'fullscreen'
    : 'toast';
  const prefAnnouncementEnabled = viewerNotifPrefs.staff_announcement_enabled !== '0';

  function findRole(code: string): string | null {
    return (staffRows ?? []).find((r) => r.role === code || r.role.startsWith(`${code},`))?.staff_name ?? null;
  }

  // Staff assignments stay in session_staff throughout the session. These
  // virtual fields are added to initialSession for the controller UI only.
  const hostName = findRole('HOST');
  const cohostSlots = [
    findRole('CH_1'),
    findRole('CH_2'),
    findRole('CH_3'),
    findRole('CH_4'),
  ];
  const cohostNames = cohostSlots.filter((n): n is string => !!n);
  const assistantSlots = [
    findRole('AST_1'),
    findRole('AST_2'),
    findRole('AST_3'),
    findRole('AST_4'),
  ];
  const assistantNames = assistantSlots.filter((n): n is string => !!n);

  // staffDirectory maps discord_username -> real Discord snowflake ID — NOT the
  // Supabase auth uuid (row.id). The "Discord ID" field next to Session Host/
  // Trainer needs their actual Discord ID; using the internal auth id there was
  // wrong regardless of the roster issue below.
  const HOST_ELIGIBLE_RANKS = ['Operations Manager', 'Community Manager', 'Head Staff', 'Host Authorized'];
  const cohostEligibleRanks = ['Community Manager', 'Operations Manager', 'Head Staff', 'Co-Host Authorized'];
  const assistantEligibleRanks = [...cohostEligibleRanks, 'Assistant Authorized'];

  const staffDirectory: Record<string, string> = {};
  const eligibleHost = new Set<string>();
  const eligibleCohost = new Set<string>();
  const eligibleAssistant = new Set<string>();

  for (const row of staffDirectoryRows ?? []) {
    const p = row.profiles as unknown as { discord_username: string | null; discord_id: string | null } | null;
    const name = p?.discord_username ?? '';
    if (!name) continue;
    staffDirectory[name] = p?.discord_id ?? '';
    if (HOST_ELIGIBLE_RANKS.includes(row.staff_rank)) eligibleHost.add(name);
    if (cohostEligibleRanks.includes(row.staff_rank)) eligibleCohost.add(name);
    if (assistantEligibleRanks.includes(row.staff_rank)) eligibleAssistant.add(name);
  }

  // staff_profiles only covers people who've actually logged in at least once.
  // Anyone pre-registered but not yet claimed lives in staff_roster instead — same
  // fallback pattern managesession/page.tsx and setup/page.tsx already use. Unlike
  // the previous version of this fix, roster rows ARE added to staffDirectory now
  // too (roster already has a real discord_id, no auth uid required for that) —
  // otherwise a not-yet-logged-in host/trainer would show a correct name but a
  // permanently blank Discord ID field, and would never appear in the host
  // dropdown's option list at all.
  const { data: rosterRows } = await admin
    .from('staff_roster')
    .select('discord_id, discord_username, staff_rank');

  for (const row of rosterRows ?? []) {
    if (staffDirectory[row.discord_username]) continue;
    staffDirectory[row.discord_username] = row.discord_id ?? '';
    if (HOST_ELIGIBLE_RANKS.includes(row.staff_rank)) eligibleHost.add(row.discord_username);
    if (cohostEligibleRanks.includes(row.staff_rank)) eligibleCohost.add(row.discord_username);
    if (assistantEligibleRanks.includes(row.staff_rank)) eligibleAssistant.add(row.discord_username);
  }

  // Whoever is CURRENTLY assigned always appears in their own dropdown, even if
  // their rank wouldn't normally qualify them going forward — same defensive
  // pattern the co-host list already used below.
  if (hostName) eligibleHost.add(hostName);
  for (const c of cohostNames) {
    if (c) eligibleCohost.add(c);
  }

  // 'person' mode View As needs this page to resolve identity as the
  // impersonated staff member, not the real signed-in dev — same fix as
  // /setup/page.tsx's mySessions filter. 'rank' mode has no personLabel, so
  // this falls back to the real id-based lookup exactly as before.
  // effectiveUsername is already the Discord username for the real user, or
  // the impersonated username in person-mode View As. Do not compare the
  // Supabase auth UUID (user.id) to staffDirectory's Discord snowflake IDs.
  const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();
  // Session assignments use discord_username, while the header may display
  // discord_server_name. Match both for real users; person-mode View As only
  // matches the impersonated identity. Rank-only View As keeps real identity.
  const viewerIdentities = new Set(
    [user.effectiveUsername, ...(user.viewingAs?.personLabel ? [] : [user.discordUsername ?? ''])]
      .map(norm)
      .filter(Boolean)
  );
  const isHost = !!hostName && viewerIdentities.has(norm(hostName));
  const isCohost = cohostNames.some((name) => viewerIdentities.has(norm(name)));
  const isAssistant = assistantNames.some((name) => viewerIdentities.has(norm(name)));
  const matchedStaffName = isHost
    ? hostName
    : cohostNames.find((name) => viewerIdentities.has(norm(name)))
      ?? assistantNames.find((name) => viewerIdentities.has(norm(name)));
  const myDisplayName = user.viewingAs?.personLabel ?? matchedStaffName ?? user.effectiveUsername;

  let viewerRole: ViewerRole = 'Assistant';
  if (isHost) viewerRole = 'Host';
  else if (isCohost) viewerRole = 'Co-Host';
  else if (!isAssistant) viewerRole = 'Assistant';

  // ── SECURITY: only host/co-hosts/assistants on THIS session (or the real
  // signed-in admin, for support access) may view or edit the panel. Without
  // this, anyone signed in could open /sessionongoing?session_id=X for any
  // session and both view and — via the sync API, which has no authorization
  // check of its own — write to it. This deliberately checks the EFFECTIVE
  // identity, not the real one: while impersonating a specific person via View
  // As, access should reflect what THAT person can actually see, which is the
  // whole point of person-mode impersonation. `user.isAdmin` (real, not
  // effective) is the one exception — a genuine admin/dev keeps support access
  // even while impersonating a non-assigned person, since that's a deliberate
  // "check what this session looks like to nobody in particular" case.
  const assignedNames = [hostName, ...cohostNames, ...assistantNames].filter((n): n is string => !!n);
  const isAssigned = assignedNames.some((name) => viewerIdentities.has(norm(name)));
  if (!isAssigned && !user.isAdmin) {
    redirect('/dashboard?error=' + encodeURIComponent('You are not assigned to this session.'));
  }

  // Hydrate the controller's legacy flat UI shape from the normalized tables
  // that current_db.sql actually contains. live_state remains the realtime
  // transport for transient controller state, while these child tables remain
  // the durable source used by conclude_session().
  const traineeFields: Record<string, unknown> = {};
  const liveTrainees: NonNullable<LiveState['trainees']> = {};
  const attendanceBySlot = Array.from({ length: sessionRow.num_slots }, () => '0');
  const standbySlots: number[] = [];
  for (const trainee of traineeRows ?? []) {
    const slot = Number(trainee.slot_number);
    if (!Number.isInteger(slot) || slot < 1) continue;
    if (!trainee.is_standby && slot > sessionRow.num_slots) continue;
    if (trainee.is_standby) standbySlots.push(slot);
    const rowKey = String(slot - 1);
    const zone = trainee.zone == null ? '' : `Zone ${trainee.zone}`;
    traineeFields[`trainee_${slot}_name`] = trainee.trainee_roblox_username;
    traineeFields[`trainee_${slot}_discord`] = trainee.trainee_discord;
    traineeFields[`trainee_${slot}_discord_id`] = trainee.trainee_discord_id == null ? null : String(trainee.trainee_discord_id);
    traineeFields[`trainee_${slot}_zone`] = trainee.zone;
    traineeFields[`trainee_${slot}_note`] = trainee.note;
    traineeFields[`trainee_${slot}_trainer_name`] = trainee.trainer_name;
    if (!trainee.is_standby) attendanceBySlot[slot - 1] = trainee.attended ? '1' : '0';
    liveTrainees[rowKey] = {
      discord: trainee.trainee_discord ?? '',
      discordId: trainee.trainee_discord_id == null ? '' : String(trainee.trainee_discord_id),
      roblox: trainee.trainee_roblox_username ?? '',
      zone,
      notes: trainee.note ?? '',
      trainerName: trainee.trainer_name ?? '',
      attended: Boolean(trainee.attended),
    };
  }

  function shiftRole(role: string): StaffShiftRow['role'] {
    if (isInternalHelperRole(role)) return 'Internal Helper';
    if (role.startsWith('CH_')) return 'Co-Host';
    if (role.startsWith('AST_1')) return 'Main AST';
    return 'Assistant';
  }

  const durableStaffShift: StaffShiftRow[] = (staffRows ?? [])
    .filter((row) => !(row.role === 'HOST' || row.role.startsWith('HOST,')))
    .map((row) => ({
      sourceRowId: row.staff_row_id,
      role: shiftRole(row.role),
      discord: row.staff_name,
      notes: row.notes ?? '',
      attended: Boolean(row.attended),
    }));

  const durableDrivers = (driverRows ?? []).map((row) => ({
    sourceRowId: row.driver_row_id,
    discord: row.discord_username ?? '',
    roblox: row.roblox_username ?? '',
    attended: Boolean(row.attended),
  }));

  const initialLiveState: LiveState = {
    ...((sessionRow.live_state as LiveState | null) ?? {}),
    sessionHost: hostName,
    trainees: liveTrainees,
    staffShift: durableStaffShift,
    drivers: durableDrivers,
  };

  return (
    <SessionOngoingClient
      initialSession={{
        ...sessionRow,
        ...traineeFields,
        started_at: startedAt,
        live_state: initialLiveState,
        trainee_attendance: attendanceBySlot.join(','),
        host: hostName ?? '',
        co_host1: cohostSlots[0] || null,
        co_host2: cohostSlots[1] || null,
        co_host3: cohostSlots[2] || null,
        co_host4_supervisor: cohostSlots[3] || null,
        assistant_1: assistantSlots[0] || null,
        assistant_2: assistantSlots[1] || null,
        assistant_3: assistantSlots[2] || null,
        assistant_4: assistantSlots[3] || null,
      } as SessionOngoingRow}
      staffDirectory={staffDirectory}
      eligibleHosts={[...eligibleHost]}
      eligibleStaff={{ 'Co-Host': [...eligibleCohost], Assistant: [...eligibleAssistant] }}
      scheduledStartIso={scheduledStartIso}
      standbySlots={standbySlots}
      timezoneMode={timezoneMode}
      viewerRole={viewerRole}
      myDisplayName={myDisplayName}
      username={myDisplayName}
      roleDisplay={formatRoleDisplay(user.effectiveRole, user.effectivePermLevel)}
      avatarUrl={user.avatarUrl}
      staffId={user.id}
      prefTraineeWarning={prefTraineeWarning}
      prefTraineeWarningTimes={prefTraineeWarningTimes}
      prefTraineeSound={prefTraineeSound}
      prefAnnouncementDisplay={prefAnnouncementDisplay}
      prefAnnouncementEnabled={prefAnnouncementEnabled}
    />
  );
}
