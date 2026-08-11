// FILE: app/(app)/managesession/parseTraineePaste.ts

export interface ParsedTraineePaste {
  discordId: string;
  discordUsername: string;
  robloxUsername: string;
  host: string;
  dateTime: string;
  position: string;
  zone: string;
  notes: string;
}

const LABELS = ['host', 'date/time', 'position', 'zone', 'trainee notes'] as const;

/**
 * Format (backtick labels are optional — with or without both work):
 *   [Trainee discord ID]
 *   [Trainee discord username]
 *   [Trainee roblox username]
 *   `Host:` [HOST]
 *   `Date/Time:` DD/MM/YYYY HH:mm OR HH:MM GMT/BST
 *   `Position:` [SG/Staff Position]
 *   `Zone:` [Zone Number]
 *   `Trainee Notes:` [Train count, etc.]
 *
 * The first three non-labeled lines are read positionally as
 * discord ID / discord username / roblox username, in that order.
 */
export function parseTraineePaste(text: string): ParsedTraineePaste {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const labeled: Record<string, string> = {};
  const plainLines: string[] = [];

  for (const line of lines) {
    const m = line.match(/^`?([A-Za-z /]+):`?\s*(.*)$/);
    const key = m?.[1]?.trim().toLowerCase();
    if (m && key && (LABELS as readonly string[]).includes(key)) {
      labeled[key] = m[2].trim();
    } else {
      plainLines.push(line);
    }
  }

  return {
    discordId: plainLines[0] ?? '',
    discordUsername: plainLines[1] ?? '',
    robloxUsername: plainLines[2] ?? '',
    host: labeled['host'] ?? '',
    dateTime: labeled['date/time'] ?? '',
    position: labeled['position'] ?? '',
    zone: labeled['zone'] ?? '',
    notes: labeled['trainee notes'] ?? '',
  };
}

/**
 * Loose match — pulls digits out of both sides and checks the session's
 * date appears in the pasted date/time string somewhere. Deliberately
 * forgiving about format (DD/MM vs MM/DD, GMT/BST, spacing) since this
 * is a soft cross-check, not a strict parse — see the mismatch warning
 * in ManageSessionInteractive, which does not block filling the form.
 */
export function looksLikeSameDate(pastedDateTime: string, sessionDateISO: string): boolean {
  if (!pastedDateTime || !sessionDateISO) return true; // nothing to compare against — don't warn
  const [, month, day] = sessionDateISO.split('-'); // YYYY-MM-DD
  const pastedDigits = pastedDateTime.replace(/\D/g, '');
  return pastedDigits.includes(month + day) || pastedDigits.includes(day + month);
}