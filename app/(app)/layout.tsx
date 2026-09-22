// FILE: app/(app)/layout.tsx
import { getCurrentUser } from '@/lib/getCurrentUser';
import { formatNameWithPrefix, getRoleLabel } from '@/lib/roles';
import AppShell, { type AssignedSession } from './AppShell';
import { createClient } from '@/utils/supabase/server';
import { currentSiteTimeParts, getSiteTimezoneMode } from '@/lib/siteTimezone';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser(); // redirects to /login internally if not signed in
  const supabase = await createClient();
  const timezoneMode = await getSiteTimezoneMode(supabase);

  const roleInfo = { rawRole: user.effectiveRole, isStaff: user.viewingAs ? user.effectivePermLevel > 0 : user.isStaff, isAdmin: user.viewingAs ? false : user.isAdmin };
  const displayName = formatNameWithPrefix(user.effectiveUsername, roleInfo);
  const roleLabel = getRoleLabel(roleInfo);

  // ── Assigned upcoming sessions (host / co-host / assistant / additional) ──
  // session_upcoming has no host/co_host*/assistant* columns anymore — staff
  // assignment is session_staff only (role/staff_name rows). Look up this
  // person's session_staff rows first, then fetch the matching upcoming
  // sessions, deriving the role label straight from session_staff.role
  // instead of which column matched.
  const assignedSessions: AssignedSession[] = [];
  const myDisplayName = user.effectiveUsername;

  const ROLE_LABELS: Record<string, string> = {
    HOST: 'Host', CH_1: 'CH 1', CH_2: 'CH 2', CH_3: 'CH 3', CH_4: 'CH 4 / SV',
    AST_1: 'AST 1', AST_2: 'AST 2', AST_3: 'AST 3', AST_4: 'AST 4',
  };
  function labelForStaffRole(role: string): string {
    const base = role.split(',')[0].trim(); // strip ", IH" suffix before lookup
    return ROLE_LABELS[base] ?? 'Additional Staff';
  }

  if (myDisplayName) {
    const { date: todayBST, time: nowTimeBST } = currentSiteTimeParts(timezoneMode);

    const { data: staffRows, error: staffErr } = await supabase
      .from('session_staff')
      .select('session_id, role')
      .eq('staff_name', myDisplayName);

    if (staffErr) {
      console.error('session_staff lookup failed:', staffErr.message);
    } else if (staffRows && staffRows.length > 0) {
      const roleBySession = new Map(staffRows.map((r) => [r.session_id, r.role]));
      const sessionIds = staffRows.map((r) => r.session_id);

      const [{ data: liveSessions, error: liveErr }, { data: sessions, error: upcomingErr }] = await Promise.all([
        supabase
          .from('session_ongoing')
          .select('session_id, started_at')
          .in('session_id', sessionIds)
          .order('started_at', { ascending: false, nullsFirst: false })
          .limit(8),
        supabase
          .from('session_upcoming')
          .select('session_id, session_date, session_time')
          .in('session_id', sessionIds)
          .in('session_status', ['Booked', 'Scheduled'])
          .eq('session_booked', true)
          .or(`session_date.gt.${todayBST},and(session_date.eq.${todayBST},session_time.gte.${nowTimeBST})`)
          .order('session_date', { ascending: true })
          .order('session_time', { ascending: true })
          .limit(8),
      ]);

      if (liveErr) console.error('session_ongoing assignment lookup failed:', liveErr.message);
      if (upcomingErr) console.error('session_upcoming assignment lookup failed:', upcomingErr.message);

      const liveSessionIds = new Set((liveSessions ?? []).map((row) => row.session_id));
      for (const row of liveSessions ?? []) {
        const role = roleBySession.get(row.session_id) ?? '';
        assignedSessions.push({ sessionId: row.session_id, label: `LIVE NOW — ${labelForStaffRole(role)}` });
      }

      for (const row of sessions ?? []) {
        if (liveSessionIds.has(row.session_id) || assignedSessions.length >= 8) continue;
        const role = roleBySession.get(row.session_id) ?? '';
        const dateLabel = new Date(`${row.session_date}T00:00:00Z`).toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', timeZone: 'UTC',
        });
        const label = `${dateLabel}, ${row.session_time.slice(0, 5)} ${timezoneMode} — ${labelForStaffRole(role)}`;
        assignedSessions.push({ sessionId: row.session_id, label });
      }
    }
  }

  const [{ data: recipientRows }, { data: readRows }] = await Promise.all([
  supabase.from('notification_recipients').select('notif_id').eq('profile_id', user.id),
  supabase.from('notification_reads').select('notif_id').eq('profile_id', user.id),
  ]);
  const readSet = new Set((readRows ?? []).map((r) => r.notif_id));
  const unreadCount = (recipientRows ?? []).filter((r) => !readSet.has(r.notif_id)).length;

  // ── Does this person have a live session right now? (drives the topbar pill) ──
  // Same session_staff -> session_ongoing check as dashboard/page.tsx's my_session
  // card — kept here too (rather than passed down some other way) since layout.tsx
  // wraps EVERY page, and the pill needs to be correct on all of them, not just
  // wherever the dashboard's own query happens to run.
  let hasLiveSession = false;
  let liveSessionLastChangeAt: number | null = null;
  if (myDisplayName) {
    const { data: staffForLive } = await supabase
      .from('session_staff')
      .select('session_id')
      .eq('staff_name', myDisplayName);

    if (staffForLive && staffForLive.length > 0) {
      const { data: liveMatch } = await supabase
        .from('session_ongoing')
        .select('session_id, last_updated, started_at')
        .in('session_id', staffForLive.map((r) => r.session_id))
        .order('last_updated', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      hasLiveSession = !!liveMatch;
      const persistedChange = liveMatch?.last_updated ?? liveMatch?.started_at;
      if (persistedChange) {
        const timestamp = new Date(persistedChange).getTime();
        if (Number.isFinite(timestamp)) liveSessionLastChangeAt = timestamp;
      }
    }
  }

  return (
      <AppShell
        user={{
          username: displayName,
          role: roleLabel,
          avatarUrl: user.robloxAvatarUrl ?? user.avatarUrl,
          rawRole: user.effectiveRole,
          isAdmin: user.viewingAs ? false : user.isAdmin, 
          adminRole: user.adminRole,   // <-- add this line
        }}
        assignedSessions={assignedSessions}
        viewingAs={user.viewingAs}
        unreadCount={unreadCount}
        hasLiveSession={hasLiveSession}
        liveSessionLastChangeAt={liveSessionLastChangeAt}
      >
      {children}
    </AppShell>
  );
}
