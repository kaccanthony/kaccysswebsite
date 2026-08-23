// FILE: app/(app)/layout.tsx
import { getCurrentUser } from '@/lib/getCurrentUser';
import { formatNameWithPrefix, getRoleLabel } from '@/lib/roles';
import AppShell, { type AssignedSession } from './AppShell';
import { createClient } from '@/utils/supabase/server';

const STAFF_COLUMNS =
  'host, co_host1, co_host2, co_host3, co_host4_supervisor, assistant_1, assistant_2, assistant_3, assistant_4, additional_staff';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser(); // redirects to /login internally if not signed in
  const supabase = await createClient();

  const roleInfo = { rawRole: user.effectiveRole, isStaff: user.viewingAs ? user.effectivePermLevel > 0 : user.isStaff, isAdmin: user.viewingAs ? false : user.isAdmin };
  const displayName = formatNameWithPrefix(user.effectiveUsername, roleInfo);
  const roleLabel = getRoleLabel(roleInfo);

  // ── Assigned upcoming sessions (host / co-host / assistant / additional) ──
  // effectiveUsername, not user.username — same View As identity fix as
  // /setup, sessionongoing, and the dashboard's my_session card.
  const assignedSessions: AssignedSession[] = [];
  const myDisplayName = user.effectiveUsername;

  if (myDisplayName) {
    const nowBST = new Date();
    const todayBST = nowBST.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
    const nowTimeBST = nowBST.toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour12: false });

    const orClause = [
      `host.eq.${myDisplayName}`,
      `co_host1.eq.${myDisplayName}`,
      `co_host2.eq.${myDisplayName}`,
      `co_host3.eq.${myDisplayName}`,
      `co_host4_supervisor.eq.${myDisplayName}`,
      `assistant_1.eq.${myDisplayName}`,
      `assistant_2.eq.${myDisplayName}`,
      `assistant_3.eq.${myDisplayName}`,
      `assistant_4.eq.${myDisplayName}`,
      `additional_staff.ilike.%${myDisplayName}%`,
    ].join(',');

    const { data: sessions } = await supabase
      .from('session_upcoming')
      .select(`session_id, session_date, session_time, ${STAFF_COLUMNS}`)
      .in('session_status', ['Booked', 'Scheduled'])
      .eq('session_booked', true)
      .or(`session_date.gt.${todayBST},and(session_date.eq.${todayBST},session_time.gte.${nowTimeBST})`)
      .or(orClause)
      .order('session_date', { ascending: true })
      .order('session_time', { ascending: true })
      .limit(8);

    for (const row of sessions ?? []) {
      let sessionRoleLabel = 'Additional Staff';
      if (row.host === myDisplayName) sessionRoleLabel = 'Host';
      else if (row.co_host1 === myDisplayName) sessionRoleLabel = 'CH 1';
      else if (row.co_host2 === myDisplayName) sessionRoleLabel = 'CH 2';
      else if (row.co_host3 === myDisplayName) sessionRoleLabel = 'CH 3';
      else if (row.co_host4_supervisor === myDisplayName) sessionRoleLabel = 'CH 4 / SV';
      else if (row.assistant_1 === myDisplayName) sessionRoleLabel = 'AST 1';
      else if (row.assistant_2 === myDisplayName) sessionRoleLabel = 'AST 2';
      else if (row.assistant_3 === myDisplayName) sessionRoleLabel = 'AST 3';
      else if (row.assistant_4 === myDisplayName) sessionRoleLabel = 'AST 4';

      const dt = new Date(`${row.session_date}T${row.session_time}`);
      const label = `${dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Europe/London' })}, ${dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })} BST — ${sessionRoleLabel}`;

      assignedSessions.push({ sessionId: row.session_id, label });
    }
  }

  const [{ data: recipientRows }, { data: readRows }] = await Promise.all([
  supabase.from('notification_recipients').select('notif_id').eq('profile_id', user.id),
  supabase.from('notification_reads').select('notif_id').eq('profile_id', user.id),
  ]);
  const readSet = new Set((readRows ?? []).map((r) => r.notif_id));
  const unreadCount = (recipientRows ?? []).filter((r) => !readSet.has(r.notif_id)).length;

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
      >
      {children}
    </AppShell>
  );
}