export const MAX_SESSION_TRAINEES = 20;

export const SESSION_TRAINEE_LIMIT_MESSAGE =
  `A session can have at most ${MAX_SESSION_TRAINEES} trainee slots across allocated, standby/reserved, and unallocated trainees.`;

export function countSessionTraineeSlots(...groups: number[]): number {
  return groups.reduce((total, count) => total + Math.max(0, Number.isFinite(count) ? count : 0), 0);
}

export function isWithinSessionTraineeLimit(...groups: number[]): boolean {
  return countSessionTraineeSlots(...groups) <= MAX_SESSION_TRAINEES;
}
