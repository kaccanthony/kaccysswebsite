// FILE: lib/staff.ts
// Server-only data access. Do NOT import this from a Client Component —
// it pulls in utils/supabase/server.ts (next/headers). Client Components
// (like StaffGrid.tsx) should import from '@/lib/staff-helpers' instead.

import { createClient } from '@/utils/supabase/server';
import { RANK_ORDER, type RankKey, type StaffMember } from './staff-helpers';

export { RANK_ORDER, RANK_CONFIG, headStaffSuffix, aosForPosition } from './staff-helpers';
export type { RankKey, StaffMember, RankConfig } from './staff-helpers';

// Raw shape returned by the Supabase query below.
interface StaffRow {
  id: string;
  discord_username: string | null;
  discord_avatar_url: string | null;
  num_sessions_attended: number | null;
  hide_stats: boolean | null;
  staff_profiles: { staff_rank: string; staff_joined: string } | { staff_rank: string; staff_joined: string }[] | null;
  staff_timeline:
    | { days_as_staff: number | null; host_auth_start: string | null; host_auth_end: string | null }
    | { days_as_staff: number | null; host_auth_start: string | null; host_auth_end: string | null }[]
    | null;
}

function firstOf<T>(v: T | T[] | null): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function toStaffMember(row: StaffRow): StaffMember | null {
  const sp = firstOf(row.staff_profiles);
  if (!sp) return null; // not actually a staff member

  const tl = firstOf(row.staff_timeline);
  const today = new Date().toISOString().slice(0, 10);
  const hostAuthorized = !!tl?.host_auth_start && (!tl.host_auth_end || tl.host_auth_end >= today);

  return {
    id: row.id,
    name: row.discord_username || 'Unknown',
    rank: sp.staff_rank as RankKey,
    avatarUrl: row.discord_avatar_url,
    hostAuthorized,
    eventAuthorized: false,
    daysAsStaff: tl?.days_as_staff ?? null,
    sessionsAttended: row.num_sessions_attended ?? 0,
    joined: sp.staff_joined,
    hideStats: !!row.hide_stats,
  };
}

/** Fetches every current staff member, grouped by rank (matching RANK_ORDER). */
export async function getStaffByRank(): Promise<Record<RankKey, StaffMember[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('profiles')
    .select(
      `id, discord_username, discord_avatar_url, num_sessions_attended, hide_stats,
       staff_profiles!inner ( staff_rank, staff_joined ),
       staff_timeline ( days_as_staff, host_auth_start, host_auth_end )`
    )
    .order('discord_username', { ascending: true });

  if (error) throw error;

  const byRank = Object.fromEntries(RANK_ORDER.map((r) => [r, [] as StaffMember[]])) as Record<RankKey, StaffMember[]>;

  for (const row of (data ?? []) as unknown as StaffRow[]) {
    const member = toStaffMember(row);
    if (member && RANK_ORDER.includes(member.rank)) {
      byRank[member.rank].push(member);
    }
  }

  return byRank;
}

/** Looks up a single staff member by discord_username (case/whitespace-insensitive), for the /staff/[member] permalink. */
export async function getStaffMemberByName(name: string): Promise<StaffMember | null> {
  const supabase = await createClient();
  const wanted = name.trim();

  const { data, error } = await supabase
    .from('profiles')
    .select(
      `id, discord_username, discord_avatar_url, num_sessions_attended, hide_stats,
       staff_profiles!inner ( staff_rank, staff_joined ),
       staff_timeline ( days_as_staff, host_auth_start, host_auth_end )`
    )
    .ilike('discord_username', wanted)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return toStaffMember(data as unknown as StaffRow);
}