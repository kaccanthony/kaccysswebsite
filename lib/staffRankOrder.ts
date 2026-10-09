export const STAFF_RANK_ORDER = [
  'Operations Manager',
  'Community Manager',
  'Head Staff',
  'Co-Host Authorized',
  'Event Authorized',
  'Assistant Authorized',
] as const;

export function staffRankPosition(rank: unknown): number {
  if (rank === 'Host Authorized') return 2; // Historical name for the Head Staff tier.
  const position = STAFF_RANK_ORDER.indexOf(rank as (typeof STAFF_RANK_ORDER)[number]);
  return position === -1 ? STAFF_RANK_ORDER.length : position;
}

export function compareStaffRanks(a: unknown, b: unknown): number {
  return staffRankPosition(a) - staffRankPosition(b);
}

export function orderStaffRows<T>(rows: T[], rankFor: (row: T) => unknown): T[] {
  return [...rows].sort((a, b) => compareStaffRanks(rankFor(a), rankFor(b)));
}
