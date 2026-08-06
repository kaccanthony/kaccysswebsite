// FILE: lib/staff-helpers.ts
// Pure config/types/helpers — no server-only imports (safe for Client Components).

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
  eventAuthorized: boolean; // no "event auth" column exists yet — always false for now
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