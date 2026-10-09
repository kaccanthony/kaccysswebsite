import 'server-only';
import { createAdminClient } from '@/utils/supabase/admin';
import snapshotFallback from './staffPublicSnapshot.json';
import { staffSort, type StaffMember } from './staff-helpers';
import { getStaffStatsVisibility } from './staffStatsVisibility';

type RosterRow = {
  discord_id: string; discord_username: string; staff_rank: string; staff_joined: string;
  op_dept: boolean; comm_dept: boolean;
};
type ProfileRow = {
  discord_id: string | null; discord_server_name: string | null;
  roblox_id: number | null; roblox_avatar_url: string | null; nationality: string | null;
  num_sessions_attended: number | null; hide_stats: boolean | null;
};
type SnapshotRow = {
  discord_id: string; roblox_id: number | null;
  operations: Record<string, number>; community: Record<string, number>; source_as_of: string;
};
type ArchivedRow = {
  staff_id: number; staff_name: string; staff_display_name: string; staff_roblox_name: string;
  staff_roblox_id?: number | string | null; staff_rank: string; staff_days: number; hide_stats: boolean;
};
type SortableMember = StaffMember & { opDept: boolean; commDept: boolean };

function elapsedDays(joined: string): number | null {
  const start = Date.parse(`${joined}T00:00:00Z`);
  return Number.isFinite(start) ? Math.max(0, Math.floor((Date.now() - start) / 86400000)) : null;
}

async function robloxAvatars(ids: number[]): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  if (!ids.length) return result;
  try {
    const url = `https://thumbnails.roblox.com/v1/users/avatar-bust?userIds=${ids.join(',')}&size=420x420&format=Png&isCircular=false`;
    // Roblox may return Pending for a newly requested render; do not cache that state.
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return result;
    const body = await response.json() as { data?: { targetId: number; state: string; imageUrl: string }[] };
    for (const entry of body.data ?? []) {
      if (entry.state === 'Completed' && entry.imageUrl) result.set(entry.targetId, entry.imageUrl);
    }
  } catch { /* A missing thumbnail should not hide a staff member. */ }
  return result;
}

async function archivedRobloxIds(names: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (!names.length) return result;
  try {
    const response = await fetch('https://users.roblox.com/v1/usernames/users', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames: names, excludeBannedUsers: false }),
      next: { revalidate: 86400 },
    });
    if (!response.ok) return result;
    const body = await response.json() as { data?: { requestedUsername: string; id: number }[] };
    for (const entry of body.data ?? []) result.set(entry.requestedUsername.toLowerCase(), entry.id);
  } catch { /* Keep the fallback icon. */ }
  return result;
}

function numericRobloxId(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function archivedRobloxId(row: ArchivedRow, idsByUsername: Map<string, number>): number | null {
  return numericRobloxId(row.staff_roblox_id)
    ?? idsByUsername.get(row.staff_roblox_name.toLowerCase())
    ?? null;
}

function robloxProfileUrl(id: number | null | undefined): string | null {
  return id ? `https://www.roblox.com/users/${id}/profile` : null;
}

/** Public allowlisted staff data. No auth cookie, permissions, or boolean flags leave this layer. */
export async function getPublicStaff(): Promise<{ current: StaffMember[]; archived: StaffMember[] }> {
  const db = createAdminClient();
  const [rosterResult, archiveResult, statsVisibility] = await Promise.all([
    db.from('staff_roster').select('discord_id, discord_username, staff_rank, staff_joined, op_dept, comm_dept'),
    (async () => {
      const withRobloxId = await db.from('staff_archived')
        .select('staff_id, staff_name, staff_display_name, staff_roblox_name, staff_roblox_id, staff_rank, staff_days, hide_stats')
        .order('archived_at', { ascending: false });
      if (!withRobloxId.error || !['42703', 'PGRST204'].includes(withRobloxId.error.code)) return withRobloxId;
      return db.from('staff_archived')
        .select('staff_id, staff_name, staff_display_name, staff_roblox_name, staff_rank, staff_days, hide_stats')
        .order('archived_at', { ascending: false });
    })(),
    getStaffStatsVisibility(db),
  ]);
  if (rosterResult.error) throw rosterResult.error;
  if (archiveResult.error) throw archiveResult.error;
  const roster = (rosterResult.data ?? []) as RosterRow[];
  const archives = (archiveResult.data ?? []) as ArchivedRow[];
  const showDepartmentStats = statsVisibility === 'full';
  const discordIds = [...new Set(roster.map(row => row.discord_id).filter(Boolean))];
  const [profileResult, snapshotResult] = await Promise.all([
    discordIds.length ? db.from('profiles').select('discord_id, discord_server_name, roblox_id, roblox_avatar_url, nationality, num_sessions_attended, hide_stats').in('discord_id', discordIds) : Promise.resolve({ data: [], error: null }),
    showDepartmentStats && discordIds.length
      ? db.from('staff_public_data').select('discord_id, roblox_id, operations, community, source_as_of').in('discord_id', discordIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (profileResult.error) throw profileResult.error;
  if (snapshotResult.error && !['42P01', 'PGRST205'].includes(snapshotResult.error.code)) throw snapshotResult.error;
  const profiles = new Map(((profileResult.data ?? []) as ProfileRow[]).map(row => [row.discord_id, row]));
  const snapshots = new Map((Object.values(snapshotFallback) as SnapshotRow[]).map(row => [row.discord_id, row]));
  for (const row of (snapshotResult.data ?? []) as SnapshotRow[]) {
    const fallback = snapshots.get(row.discord_id);
    snapshots.set(row.discord_id, {
      ...row,
      operations: { ...fallback?.operations, ...row.operations },
      community: { ...fallback?.community, ...row.community },
    });
  }
  const archivedNames = archives
    .filter(row => !numericRobloxId(row.staff_roblox_id))
    .map(row => row.staff_roblox_name)
    .filter(name => name && !name.startsWith('['));
  const archivedIds = await archivedRobloxIds(archivedNames);
  const ids = [...new Set([
    ...roster.map(row => profiles.get(row.discord_id)?.roblox_id ?? snapshots.get(row.discord_id)?.roblox_id).filter((id): id is number => typeof id === 'number'),
    ...archives.map(row => numericRobloxId(row.staff_roblox_id)).filter((id): id is number => id !== null),
    ...archivedIds.values(),
  ])];
  const avatars = await robloxAvatars(ids);

  const current: SortableMember[] = roster.map(row => {
    const profile = profiles.get(row.discord_id);
    const snapshot = snapshots.get(row.discord_id);
    const robloxId = profile?.roblox_id ?? snapshot?.roblox_id;
    const hidden = !!profile?.hide_stats;
    const hasDepartmentStats = !!snapshot
      && (Object.keys(snapshot.operations ?? {}).length > 0 || Object.keys(snapshot.community ?? {}).length > 0);
    return {
      id: `roster:${row.discord_id}`,
      name: profile?.discord_server_name?.trim() || row.discord_username,
      rank: row.staff_rank === 'Host Authorized' ? 'Head Staff' : row.staff_rank,
      avatarUrl: profile?.roblox_avatar_url || (robloxId ? avatars.get(robloxId) : null) || null,
      robloxProfileUrl: robloxProfileUrl(robloxId),
      archived: false, joined: hidden ? null : row.staff_joined,
      daysAsStaff: hidden ? null : elapsedDays(row.staff_joined),
      sessionsAttended: hidden ? null : profile?.num_sessions_attended ?? snapshot?.operations?.sessions_attended ?? null,
      nationality: profile?.nationality ?? null, hideStats: hidden,
      stats: hidden || !showDepartmentStats ? {} : { operations: snapshot?.operations ?? {}, community: snapshot?.community ?? {} },
      statsAsOf: hidden || !showDepartmentStats || !hasDepartmentStats ? null : snapshot?.source_as_of ?? null,
      opDept: row.op_dept, commDept: row.comm_dept,
    };
  });
  current.sort(staffSort);
  const publicCurrent: StaffMember[] = current.map(member => ({
    id: member.id, name: member.name, rank: member.rank, avatarUrl: member.avatarUrl,
    robloxProfileUrl: member.robloxProfileUrl,
    archived: member.archived, joined: member.joined, daysAsStaff: member.daysAsStaff,
    sessionsAttended: member.sessionsAttended, nationality: member.nationality,
    hideStats: member.hideStats, stats: member.stats, statsAsOf: member.statsAsOf,
  }));

  const activeNames = new Set(current.map(row => row.name.toLowerCase()));
  const archived: StaffMember[] = archives
    .filter(row => !activeNames.has(row.staff_display_name.toLowerCase()))
    .map(row => {
      const robloxId = archivedRobloxId(row, archivedIds);
      return {
      id: `archived:${row.staff_id}`,
      name: row.staff_display_name || row.staff_name,
      rank: row.staff_rank,
      avatarUrl: avatars.get(robloxId ?? -1) ?? null,
      robloxProfileUrl: robloxProfileUrl(robloxId),
      archived: true, joined: null,
      daysAsStaff: row.hide_stats ? null : row.staff_days,
      sessionsAttended: null,
      nationality: null,
      hideStats: row.hide_stats, stats: {}, statsAsOf: null,
      };
    });
  return { current: publicCurrent, archived };
}

export async function getPublicStaffMember(id: string): Promise<StaffMember | null> {
  const { current, archived } = await getPublicStaff();
  return [...current, ...archived].find(member => member.id === id) ?? null;
}
