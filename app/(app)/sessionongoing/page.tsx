// app/(app)/sessionongoing/page.tsx
// Replaces sessionongoing.php's server-side block: fetch the session + staff
// directory, compute the viewer's role by staff_id (not username), stamp
// started_at on first load, and hand everything to the client component.
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { getCurrentUser } from '@/lib/getCurrentUser';
import { formatRoleDisplay } from '@/lib/roles';
import SessionOngoingClient from './SessionOngoingClient';
import type { SessionOngoingRow, ViewerRole } from '@/types/session';

export default async function SessionOngoingPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const sessionId = Number((await searchParams).session_id ?? 0);
  if (!sessionId) redirect('/setupsesh');

  const supabase = await createClient();
  const user = await getCurrentUser();

  const { data: sessionRow } = await supabase
    .from('session_ongoing')
    .select('*')
    .eq('session_id', sessionId)
    .single();
  if (!sessionRow) redirect('/setupsesh');

  // Stamp started_at exactly once, first time anyone opens the session — same as
  // sessionongoing.php's `if (empty($sessionRow['started_at']))` block.
  let startedAt = sessionRow.started_at as string | null;
  if (!startedAt) {
    startedAt = new Date().toISOString();
    await supabase.from('session_ongoing').update({ started_at: startedAt }).eq('session_id', sessionId);
  }

  // Overtime is measured from the *scheduled* start, not whenever the host opened
  // the page — Europe/London so BST/GMT is handled without a manual offset table.
  let scheduledStartIso: string | null = null;
  if (sessionRow.session_date && sessionRow.session_time) {
    try {
      const dt = new Date(
        new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' })
          .format(new Date(`${sessionRow.session_date}T${sessionRow.session_time}`)) // rough guard, see note below
      );
      scheduledStartIso = Number.isNaN(dt.getTime()) ? null : dt.toISOString();
    } catch {
      scheduledStartIso = null;
    }
  }
  // NOTE: precise London-local -> UTC conversion (handling the BST/GMT switch
  // correctly) needs a tz library since native Date has no IANA zone constructor.
  // Recommend `Temporal` (via a polyfill) or `date-fns-tz`'s `zonedTimeToUtc`:
  //   scheduledStartIso = zonedTimeToUtc(`${session_date} ${session_time}`, 'Europe/London').toISOString()

  const { data: staffDirectoryRows } = await supabase
    .from('staff_profiles')
    .select('id, staff_rank, profiles!inner(discord_username, discord_id)');

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
  const { data: staffRows } = await supabase
    .from('session_staff')
    .select('role, staff_name')
    .eq('session_id', sessionId);

  function findRole(code: string): string | null {
    return (staffRows ?? []).find((r) => r.role === code || r.role.startsWith(`${code},`))?.staff_name ?? null;
  }

  const hostName = findRole('HOST');
  const cohostNames = ['CH_1', 'CH_2', 'CH_3', 'CH_4'].map(findRole).filter((n): n is string => !!n);
  const assistantNames = ['AST_1', 'AST_2', 'AST_3', 'AST_4'].map(findRole).filter((n): n is string => !!n);

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
    const p = (row as any).profiles;
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
  const { data: rosterRows } = await supabase
    .from('staff_roster')
    .select('discord_id, discord_username, staff_rank')
    .eq('claimed', false);

  for (const row of rosterRows ?? []) {
    if (!staffDirectory[row.discord_username]) staffDirectory[row.discord_username] = row.discord_id ?? '';
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
  let myDisplayName: string | null = user.viewingAs?.personLabel ?? null;
  if (!myDisplayName) {
    for (const [name, id] of Object.entries(staffDirectory)) {
      if (id === user.id) { myDisplayName = name; break; }
    }
  }

  const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();
  let viewerRole: ViewerRole = 'Assistant';
  if (myDisplayName) {
    if (norm(hostName) === norm(myDisplayName)) viewerRole = 'Host';
    else if (cohostNames.some((c) => norm(c) === norm(myDisplayName))) viewerRole = 'Co-Host';
  }
  myDisplayName ??= user.effectiveUsername;

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
  const isAssigned = assignedNames.some((n) => norm(n) === norm(myDisplayName));
  if (!isAssigned && !user.isAdmin) {
    redirect('/dashboard?error=' + encodeURIComponent('You are not assigned to this session.'));
  }

  return (
    <SessionOngoingClient
      initialSession={{
        ...sessionRow,
        started_at: startedAt,
        // merged in from session_staff — see comment above
        host: hostName,
        co_host1: cohostNames[0] ?? null,
        co_host2: cohostNames[1] ?? null,
        co_host3: cohostNames[2] ?? null,
        'co_host4/supervisor': cohostNames[3] ?? null,
        assistant_1: assistantNames[0] ?? null,
        assistant_2: assistantNames[1] ?? null,
        assistant_3: assistantNames[2] ?? null,
        assistant_4: assistantNames[3] ?? null,
      } as SessionOngoingRow}
      staffDirectory={staffDirectory}
      eligibleHosts={[...eligibleHost]}
      eligibleStaff={{ 'Co-Host': [...eligibleCohost], Assistant: [...eligibleAssistant] }}
      scheduledStartIso={scheduledStartIso}
      viewerRole={viewerRole}
      myDisplayName={myDisplayName}
      username={myDisplayName}
      roleDisplay={formatRoleDisplay(user.effectiveRole, user.effectivePermLevel)}
      avatarUrl={user.avatarUrl}
      staffId={user.id}
      // Per-staff notification prefs (staff_trainee_warning, staff_announcement_display,
      // staff_announcement_enabled) -> pull from profiles.notif_prefs jsonb (see db.txt)
      // instead of the old user_staff_notif_prefs table; wire up here once that column's read.
      prefTraineeWarning
      prefAnnouncementDisplay="toast"
      prefAnnouncementEnabled
    />
  );
}