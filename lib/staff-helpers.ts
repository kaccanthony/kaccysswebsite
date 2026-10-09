export const RANK_ORDER = [
  'Operations Manager', 'Community Manager', 'Head Staff',
  'Co-Host Authorized', 'Event Authorized', 'Assistant Authorized',
] as const;
export type RankKey = (typeof RANK_ORDER)[number];
export type Department = 'operations' | 'community';

export interface StaffMember {
  id: string;
  name: string;
  rank: string;
  avatarUrl: string | null;
  robloxProfileUrl: string | null;
  archived: boolean;
  joined: string | null;
  daysAsStaff: number | null;
  sessionsAttended: number | null;
  nationality: string | null;
  hideStats: boolean;
  stats: Partial<Record<Department, Record<string, number>>>;
  statsAsOf: string | null;
}

export const RANK_CONFIG: Record<RankKey, { label: string; perRow: number; colors: [string, string] }> = {
  'Operations Manager': { label: 'Operations Manager', perRow: 0, colors: ['#c631eb', '#cf8af6'] },
  'Community Manager': { label: 'Community Manager', perRow: 0, colors: ['#c631eb', '#cf8af6'] },
  'Head Staff': { label: 'Head Staff', perRow: 3, colors: ['#3e89eb', '#6abfe4'] },
  'Co-Host Authorized': { label: 'Co-Host Authorized', perRow: 4, colors: ['#FFDE34', '#FFF0A0'] },
  'Event Authorized': { label: 'Event Authorized', perRow: 3, colors: ['#5DADEC', '#A8D4F5'] },
  'Assistant Authorized': { label: 'Assistant Authorized', perRow: 4, colors: ['#FF7F52', '#FFB199'] },
};

export function colorsForStaffRank(rank: string): [string, string] {
  const normalized = rank === 'Host Authorized' ? 'Head Staff' : rank;
  return RANK_CONFIG[normalized as RankKey]?.colors ?? ['#6d86a0', '#a6bacb'];
}

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

export function staffSort(a: StaffMember & { opDept?: boolean; commDept?: boolean }, b: StaffMember & { opDept?: boolean; commDept?: boolean }): number {
  const rank = (value: string) => {
    const normalized = value === 'Host Authorized' ? 'Head Staff' : value;
    const index = RANK_ORDER.indexOf(normalized as RankKey);
    return index < 0 ? RANK_ORDER.length : index;
  };
  const rankDiff = rank(a.rank) - rank(b.rank);
  if (rankDiff) return rankDiff;
  if (a.rank === 'Head Staff' && b.rank === 'Head Staff') {
    const priority = (member: typeof a) => member.opDept && member.commDept ? 0 : member.opDept ? 1 : member.commDept ? 2 : 3;
    const deptDiff = priority(a) - priority(b);
    if (deptDiff) return deptDiff;
  }
  return a.name.localeCompare(b.name);
}
