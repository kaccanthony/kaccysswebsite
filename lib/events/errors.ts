// Exact codes and meanings from the workbook's Backend!K5:L15.
// Sheet-only codes remain documented here for future import/export work.
export const EVENT_ERROR_CODES = {
  ERR_001: 'Dashboard or Game Data sheet missing.',
  ERR_002: 'Date, tag, game, or host is missing.',
  ERR_003: 'Appending to Game Data failed.',
  ERR_004: 'Multiplier is not in the expected x1.09 format.',
  'DAB-01': 'Other required fields are missing.',
  'PERR-01': 'Player Data or Dashboard sheet missing.',
  'PERR-02': 'Event date or time is missing.',
  'PERR-03': 'Appending to Player Data failed.',
  'PERR-04': 'No player rows are filled in.',
  'PERR-05': 'A player row has a name without points, or points without a name.',
} as const;

export type EventErrorCode = keyof typeof EVENT_ERROR_CODES;

export function eventError(code: EventErrorCode, detail?: string): string {
  return `${code}: ${detail || EVENT_ERROR_CODES[code]}`;
}
