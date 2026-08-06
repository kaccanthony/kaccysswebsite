// FILE: lib/staff.ts
import { createClient } from '@/utils/supabase/server';

// ── Rank display order + per-row layout + gradient colors ──────────────────
// Ported 1:1 from staff.php's $groupConfig. Values in `staff_profiles.staff_rank`
// are assumed to match these keys exactly — adjust the keys below if your
// actual rank strings differ.
export const RANK_ORDER = [
  'Operations Manager',
  'Community Manager',
  'Head Staff',
  'Host Authorized',
  'Co-Host Authorized',
  'Assistant Authorized',
  'Event Authorized',
] as const;

export type RankKey = (typeof RANK_ORDER)[number];

export interface RankConfig {
  label: string;
  perRow: number; // 0 = single centered row, otherwise fixed CSS grid columns
  colors: [string, string];
  comingSoon?: boolean;
}

export const RANK_CONFIG: Record<RankKey, RankConfig> = {
  'Operations Manager':   { label: 'Operations Managers',  perRow: 0, colors: ['#c631eb', '#cf8af6'] },
  'Community Manager':    { label: 'Community Managers',   perRow: 0, colors: ['#c631eb', '#cf8af6'] },
  'Head Staff':           { label: 'Head Staff',           perRow: 3, colors: ['#3e89eb', '#6abfe4'] },
  'Host Authorized':      { label: 'Host Authorized',      perRow: 3, colors: ['#4CD964', '#8CE7A0'], comingSoon: true },
  'Co-Host Authorized':   { label: 'Co-Host Authorized',   perRow: 4, colors: ['#FFDE34', '#FFF0A0'] },
  'Assistant Authorized': { label: 'Assistant Authorized', perRow: 4, colors: ['#FF7F52', '#FFB199'] },
  'Event Authorized':     { label: 'Event Authorized',     perRow: 3, colors: ['#5DADEC', '#A8D4F5'], comingSoon: true },
};

export interface StaffMember {
  id: string; // profiles.id (uuid)
  name: string;
  rank: RankKey;
  avatarUrl: string | null;
  hostAuthorized: boolean;
  eventAuthorized: boolean; // NOTE: no "event auth" column exists yet in staff_timeline —
                            // this is always false for now, same as staff.php's defensive
                            // `?? 0` fallback for the not-yet-added columns. Wire this up
                            // once an equivalent to host_auth_start/end exists for events.
  daysAsStaff: number | null;
  sessionsAttended: number;
  joined: string | null; // ISO date
  hideStats: boolean;
}

/** Mirrors staff.php's headStaffSuffix() — appends " - H" / " - E" / " - B". */
export function headStaffSuffix(m: StaffMember): string {
  if (m.hostAuthorized && m.eventAuthorized) return ' - B';
  if (m.hostAuthorized) return ' - H';
  if (m.eventAuthorized) return ' - E';
  return '';
}

/**
 * Mirrors staff.php's aosForPosition(): decides the AOS animation for a card
 * based on where it sits in its own row.
 */
export function aosForPosition(pos: number, rowSize: number): string {
  if (rowSize <= 1) return 'fade-up';
  if (rowSize % 2 === 1) {
    const mid = Math.floor(rowSize / 2);
    if (pos < mid) return 'fade-right';
    if (pos > mid) return 'fade-left';
    return 'zoom-in';
  }
  return pos < rowSize / 2 ? 'fade-right' : 'fade-left';
}

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