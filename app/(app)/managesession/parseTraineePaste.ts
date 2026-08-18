// FILE: app/(app)/managesession/parseTraineePaste.ts

export interface ParsedTraineePaste {
  discordId: string;
  discordUsername: string;
  robloxUsername: string;
  host: string;
  hostPrefix: string | null;    // 'OM' | 'CM' | 'HS' | 'ST' | null — see RANK_PREFIX_MAP
  hostDiscordId: string | null; // set when Host was pasted as a raw Discord mention, e.g. <@123456789012345678>
  dateTime: string;
  position: string;
  zone: string;
  notes: string;
}

// Discord snowflake IDs are numeric, currently 17-19 digits (slowly widening as
// the epoch counter grows) — 15-20 gives headroom without accepting junk.
const DISCORD_ID_RE = /^\d{15,20}$/;
// Roblox usernames: 3-20 chars, letters/digits/underscore, no leading/trailing/
// double underscores.
const ROBLOX_USERNAME_RE = /^(?!.*__)[A-Za-z0-9](?:[A-Za-z0-9_]{1,18})?[A-Za-z0-9]$/;
// Discord usernames (new unique-username format): 2-32 chars, lowercase letters/
// digits/underscore/period. Lenient — doesn't reject legacy Name#1234 tags.
const DISCORD_USERNAME_RE = /^[a-z0-9_.]{2,32}(#\d{4})?$/i;

export function isValidDiscordId(id: string): boolean {
  return DISCORD_ID_RE.test(id.trim());
}
export function isValidRobloxUsername(name: string): boolean {
  return ROBLOX_USERNAME_RE.test(name.trim());
}
export function isValidDiscordUsername(name: string): boolean {
  return DISCORD_USERNAME_RE.test(name.trim());
}

const LABELS = ['host', 'date/time', 'position', 'zone', 'trainee notes'] as const;

// Which staff_rank value(s) each Discord-mention rank prefix is allowed to mean.
// HS/ST double up because those tiers share a mention prefix per your rank
// grouping (Head Staff + Host Authorized share [HS]; Co-Host/Assistant/Event
// Authorized share [ST]) — adjust here if that convention changes.
export const RANK_PREFIX_MAP: Record<string, string[]> = {
  OM: ['Operations Manager'],
  CM: ['Community Manager'],
  HS: ['Head Staff', 'Host Authorized'],
};

export interface ParsedHost {
  prefix: string | null;
  name: string;
  discordId: string | null; // set instead of name/prefix when it's a raw <@id> mention
}

/**
 * Strips a Discord mention marker and/or rank-prefix tag off the Host field.
 * Handles two distinct paste shapes:
 *  - Readable text: "@[OM] Yoshi5336" or "@OM Yoshi5336" -> { prefix: 'OM', name: 'Yoshi5336' }
 *  - Raw mention (typed manually, or copied from a client that doesn't resolve
 *    mentions to plain text): "<@123456789012345678>" -> { discordId: '...' } —
 *    no name/prefix is available from the text alone; the caller resolves the
 *    real name + rank from the ID via resolveHostByDiscordId().
 * Falls back to treating the whole trimmed string as the name if neither shape
 * matches, so a plain "Yoshi5336" still works exactly as before.
 */
export function parseHostField(raw: string): ParsedHost {
  if (!raw) return { prefix: null, name: '', discordId: null };
  const trimmed = raw.trim();

  const mention = trimmed.match(/^<@!?(\d{15,20})>$/);
  if (mention) return { prefix: null, name: '', discordId: mention[1] };

  const stripped = trimmed.replace(/^@/, '').trim();
  const m = stripped.match(/^\[?([A-Za-z]{2,3})\]?[\s:.-]+(.+)$/);
  if (m) {
    const candidate = m[1].toUpperCase();
    if (candidate in RANK_PREFIX_MAP) {
      return { prefix: candidate, name: m[2].trim(), discordId: null };
    }
  }
  return { prefix: null, name: stripped, discordId: null };
}

export interface RequiredFieldCheck {
  ok: boolean;
  missing: string[];
}

/** Host, Date/Time, Position, Zone — reports exactly which of the four are missing. */
export function checkRequiredSessionFields(parsed: Pick<ParsedTraineePaste, 'host' | 'dateTime' | 'position' | 'zone' | 'hostDiscordId'>): RequiredFieldCheck {
  const missing: string[] = [];
  if (!parsed.host && !parsed.hostDiscordId) missing.push('Host'); // raw <@id> mention counts as present — resolved later
  if (!parsed.dateTime) missing.push('Date/Time');
  if (!parsed.position) missing.push('Position');
  if (!parsed.zone) missing.push('Zone');
  return { ok: missing.length === 0, missing };
}

export interface IdentityFieldCheck {
  ok: boolean;         // all three present
  anyProvided: boolean; // at least one present — enough to attempt a known_trainees lookup
  missing: string[];
}

/** Discord ID / Discord Username / Roblox Username — reports exactly which are missing. */
export function checkIdentityFields(discordId: string, discordUsername: string, robloxUsername: string): IdentityFieldCheck {
  const missing: string[] = [];
  if (!discordId) missing.push('Discord ID');
  if (!discordUsername) missing.push('Discord Username');
  if (!robloxUsername) missing.push('Roblox Username');
  return { ok: missing.length === 0, anyProvided: missing.length < 3, missing };
}

export interface FormatCheck {
  ok: boolean;
  errors: string[];
}

/**
 * Validates the *shape* of any identity fields that were actually provided —
 * separate from checkIdentityFields, which only checks presence. Only checks
 * non-empty fields, so a blank field still reads as "missing" rather than
 * also piling on a format error for nothing.
 */
export function checkIdentityFieldFormats(discordId: string, discordUsername: string, robloxUsername: string): FormatCheck {
  const errors: string[] = [];
  if (discordId && !isValidDiscordId(discordId)) {
    errors.push('Discord ID looks invalid — it should be numeric only (e.g. 123456789012345678).');
  }
  if (discordUsername && !isValidDiscordUsername(discordUsername)) {
    errors.push('Discord Username looks invalid — check for stray spaces or symbols.');
  }
  if (robloxUsername && !isValidRobloxUsername(robloxUsername)) {
    errors.push('Roblox Username looks invalid — 3-20 characters, letters/numbers/underscore only, no leading, trailing, or double underscores.');
  }
  return { ok: errors.length === 0, errors };
}

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

  const parsedHost = parseHostField(labeled['host'] ?? '');

  return {
    discordId: plainLines[0] ?? '',
    discordUsername: plainLines[1] ?? '',
    robloxUsername: plainLines[2] ?? '',
    host: parsedHost.name,
    hostPrefix: parsedHost.prefix,
    hostDiscordId: parsedHost.discordId,
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

/**
 * Extracts every plausible ISO date (YYYY-MM-DD) from a pasted Date/Time
 * string — used by the global Quick Fill button to find the matching
 * session automatically. Same DD/MM vs MM/DD ambiguity handling as the
 * table's own search bar: when genuinely ambiguous, returns both
 * readings so the caller can check for a session matching either.
 */
export function parseFlexibleDateCandidates(text: string): string[] {
  const m = text.match(/(\d{1,4})[-/](\d{1,2})[-/](\d{1,4})/);
  if (!m) return [];
  const [, a, b, c] = m;
  const results: string[] = [];

  if (a.length === 4) {
    const year = parseInt(a, 10);
    const month = parseInt(b, 10);
    const day = parseInt(c, 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      results.push(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    }
    return results;
  }

  const n1 = parseInt(a, 10);
  const n2 = parseInt(b, 10);
  const year = c.length === 2 ? 2000 + parseInt(c, 10) : parseInt(c, 10);

  if (n1 >= 1 && n1 <= 31 && n2 >= 1 && n2 <= 12) {
    results.push(`${year}-${String(n2).padStart(2, '0')}-${String(n1).padStart(2, '0')}`); // DD/MM
  }
  if (n2 >= 1 && n2 <= 31 && n1 >= 1 && n1 <= 12) {
    const candidate = `${year}-${String(n1).padStart(2, '0')}-${String(n2).padStart(2, '0')}`; // MM/DD
    if (!results.includes(candidate)) results.push(candidate);
  }

  return results;
}