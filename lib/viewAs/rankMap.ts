// lib/viewAs/rankMap.ts
// "View as role" simulates a *typical* holder of a rank, not any specific real
// staff member — staff_profiles.staff_perm_level is per-user, not per-rank, so
// there's no single source of truth to read this from. Adjust these numbers to
// match what a normal member of each rank actually has in staff_perm_level today
// (the >=15 / >=20 thresholds are the ones getVisibleCards() checks in roles.ts).
export const RANK_SIMULATED_PERM_LEVEL: Record<string, number> = {
  'Operations Manager': 15,
  'Community Manager': 15,
  'Head Staff': 10,
  'Co-Host Authorized': 8,
  'Assistant Authorized': 5,
  '': 0, // simulates a regular, non-staff member
};

export const VIEWABLE_RANKS = Object.keys(RANK_SIMULATED_PERM_LEVEL);

export function labelForRank(rank: string): string {
  return rank || 'Regular Member (non-staff)';
}

// ── Auth flag simulation (independent of rank — for testing "what if this checkbox
//    were on" regardless of who normally has it) ──
export interface ViewAsAuthFlags {
  op_dept: boolean;
  host_auth: boolean;
  cohost_auth: boolean;
  asst_auth: boolean;
  comm_dept: boolean;
  eventh_auth: boolean;
  eventch_auth: boolean;
  ih_auth: boolean;
}

export const DEFAULT_VIEW_AS_AUTHS: ViewAsAuthFlags = {
  op_dept: false, host_auth: false, cohost_auth: false, asst_auth: false,
  comm_dept: false, eventh_auth: false, eventch_auth: false, ih_auth: false,
};

export const AUTH_FLAG_LABELS: Record<keyof ViewAsAuthFlags, string> = {
  op_dept: 'Operations Department',
  host_auth: 'Host Authorized',
  cohost_auth: 'Co-Host Authorized',
  asst_auth: 'Assistant Authorized',
  comm_dept: 'Community Department',
  eventh_auth: 'Event Host Authorized',
  eventch_auth: 'Event Co-Host Authorized',
  ih_auth: 'Internal Helper Authorized',
};