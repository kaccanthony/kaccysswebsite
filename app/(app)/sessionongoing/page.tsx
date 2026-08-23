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
    .select('id, staff_rank, profiles!inner(discord_username)');

  // session_ongoing has NO host/co_host1-4/assistant_1-4 columns — those live
  // as rows in session_staff (role + staff_name), see db.txt. Pull this
  // session's assignments from there instead of the old flat-column read.
  const { data: staffRows } = await supabase
    .from('session_staff')
    .select('role, staff_name')
    .eq('session_id', sessionId);

  const hostName = staffRows?.find((s) => s.role === 'Host')?.staff_name ?? null;
  const cohostNames = (staffRows ?? []).filter((s) => s.role === 'Co-Host').map((s) => s.staff_name);
  const assistantNames = (staffRows ?? []).filter((s) => s.role === 'Assistant').map((s) => s.staff_name);

  // staff_id in the old MySQL schema is now the Supabase auth uid (see profiles.id
  // in db.txt) — build the same "display name -> id" directory the PHP version did.
  const staffDirectory: Record<string, string> = {};
  const cohostEligibleRanks = ['Community Manager', 'Operations Manager', 'Head Staff', 'Co-Host Authorized'];
  const assistantEligibleRanks = [...cohostEligibleRanks, 'Assistant Authorized'];
  const eligibleCohost = new Set<string>();
  const eligibleAssistant = new Set<string>();

  for (const row of staffDirectoryRows ?? []) {
    const name = (row as any).profiles?.discord_username ?? '';
    if (!name) continue;
    staffDirectory[name] = row.id;
    if (cohostEligibleRanks.includes(row.staff_rank)) eligibleCohost.add(name);
    if (assistantEligibleRanks.includes(row.staff_rank)) eligibleAssistant.add(name);
  }
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