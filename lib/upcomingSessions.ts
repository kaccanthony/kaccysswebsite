// FILE: lib/upcomingSessions.ts
import { createClient } from '@/utils/supabase/server';
import {
  currentSiteTimeParts,
  getSiteTimezoneMode,
  siteWallTimeToISOString,
  type SiteTimezoneMode,
} from '@/lib/siteTimezone';

export interface TraineeInfo {
  discord: string;
  zone: string;
  trainer: string;
}

export interface UpcomingSession {
  session_id: number;
  session_name: string | null;
  session_desc: string | null;
  session_status: string | null;
  session_duration: string | null; // session_upcoming.session_duration is character varying, not numeric
  session_datetime_iso: string | null;
  timezone_mode: SiteTimezoneMode;
  host: string | null;
  cohost1: string | null;
  cohost2: string | null;
  cohost3: string | null;
  supervisor: string | null; // role = CH_4 (optionally CH_4, IH) in session_staff
  assistant1: string | null;
  assistant2: string | null;
  assistant3: string | null;
  assistant4: string | null;
  additionalStaff: string[]; // session_staff roles prefixed with "Add T. "
  cohost_filled: number;
  cohost_total: number;
  assistant_filled: number;
  assistant_total: number;
  trainee_filled: number;
  trainee_total: number;
  trainees: TraineeInfo[];
  reserved_trainees: TraineeInfo[];
}

const LONDON_TZ = 'Europe/London';

/** Returns the current UTC offset (minutes) Europe/London is observing at `utcDate`. */
function londonOffsetMinutes(utcDate: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: LONDON_TZ,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
    .formatToParts(utcDate)
    .reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});

  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === '24' ? '00' : parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return Math.round((asUTC - utcDate.getTime()) / 60000);
}

/**
 * Builds a DST-aware ISO datetime string (e.g. "2026-08-10T14:00:00+01:00") for a
 * wall-clock Europe/London date+time — the TS equivalent of the PHP version's
 * `new DateTime($date.' '.$time, $bst)`. The client can tell BST vs GMT apart just
 * by checking whether the resulting string contains "+01:00".
 */
export function toLondonISOString(dateStr: string, timeStr: string): string | null {
  try {
    const guessUTC = new Date(`${dateStr}T${timeStr}Z`);
    if (isNaN(guessUTC.getTime())) return null;

    // two passes: correct once, then re-check at the corrected instant to handle the
    // handful of hours per year where the offset itself might flip across the guess.
    let offsetMin = londonOffsetMinutes(guessUTC);
    let correctedUTC = new Date(guessUTC.getTime() - offsetMin * 60000);
    offsetMin = londonOffsetMinutes(correctedUTC);
    correctedUTC = new Date(guessUTC.getTime() - offsetMin * 60000);

    const sign = offsetMin >= 0 ? '+' : '-';
    const abs = Math.abs(offsetMin);
    const oh = String(Math.floor(abs / 60)).padStart(2, '0');
    const om = String(abs % 60).padStart(2, '0');

    return correctedUTC.toISOString().replace(/\.\d+Z$/, '') + `${sign}${oh}:${om}`;
  } catch {
    return null;
  }
}

function nowLondonParts(mode: SiteTimezoneMode): { date: string; time: string } {
  return currentSiteTimeParts(mode);
}

interface SessionStaffRow {
  session_id: number;
  role: string;
  staff_name: string;
  attended: boolean;
  notes: string | null;
}

interface SessionTraineeRow {
  session_id: number;
  slot_number: number;
  is_standby: boolean;
  trainee_discord: string | null;
  zone: number | null;
  trainer_name: string | null;
  attended: boolean;
}

/**
 * Fetches every upcoming session from right now onward (BST wall-clock), matching
 * upcomingsesh.php's WHERE clause. Staff assignments and trainee slots live in the
 * normalized session_staff / session_trainees tables (not flat columns on
 * session_upcoming itself), so this does 3 queries and joins them in memory.
 */
export async function getUpcomingSessions(): Promise<UpcomingSession[]> {
  const supabase = await createClient();
  const timezoneMode = await getSiteTimezoneMode(supabase);
  const { date: todayBST, time: nowTimeBST } = nowLondonParts(timezoneMode);

  const { data: sessions, error } = await supabase
    .from('session_upcoming')
    .select('*')
    .or(`session_date.gt.${todayBST},and(session_date.eq.${todayBST},session_time.gte.${nowTimeBST})`)
    .order('session_date', { ascending: true })
    .order('session_time', { ascending: true });

  if (error) throw error;
  if (!sessions || sessions.length === 0) return [];

  const sessionIds = sessions.map((s) => s.session_id);

  const [{ data: staffRows, error: staffErr }, { data: traineeRows, error: traineeErr }] = await Promise.all([
    supabase
      .from('session_staff')
      .select('session_id, role, staff_name, attended, notes')
      .in('session_id', sessionIds),
    supabase
      .from('session_trainees')
      .select('session_id, slot_number, is_standby, trainee_discord, zone, trainer_name, attended')
      .in('session_id', sessionIds)
      .order('slot_number', { ascending: true }),
  ]);

  if (staffErr) throw staffErr;
  if (traineeErr) throw traineeErr;

  const staffBySession = new Map<number, SessionStaffRow[]>();
  for (const row of (staffRows ?? []) as SessionStaffRow[]) {
    const list = staffBySession.get(row.session_id) ?? [];
    list.push(row);
    staffBySession.set(row.session_id, list);
  }

  const traineesBySession = new Map<number, SessionTraineeRow[]>();
  for (const row of (traineeRows ?? []) as SessionTraineeRow[]) {
    const list = traineesBySession.get(row.session_id) ?? [];
    list.push(row);
    traineesBySession.set(row.session_id, list);
  }

  return sessions.map((row): UpcomingSession => {
    const staff = staffBySession.get(row.session_id) ?? [];
    const roleName = (role: string) => staff.find(
      (staffRow) => staffRow.role === role || staffRow.role.startsWith(`${role},`)
    )?.staff_name ?? null;

    const host = roleName('HOST');
    const cohost1 = roleName('CH_1');
    const cohost2 = roleName('CH_2');
    const cohost3 = roleName('CH_3');
    const supervisor = roleName('CH_4');
    const assistant1 = roleName('AST_1');
    const assistant2 = roleName('AST_2');
    const assistant3 = roleName('AST_3');
    const assistant4 = roleName('AST_4');
    const additionalStaff = staff.filter((staffRow) => staffRow.role.startsWith('Add T. ')).map((staffRow) => staffRow.staff_name);

    const cohostFilled = [cohost1, cohost2, cohost3].filter(Boolean).length;
    const assistantFilled = [assistant1, assistant2, assistant3, assistant4].filter(Boolean).length;

    // main slots only — standby trainees aren't counted toward the fill count
    const allTraineeSlots = traineesBySession.get(row.session_id) ?? [];
    const traineeSlots = allTraineeSlots.filter((t) => !t.is_standby);
    const reservedSlots = allTraineeSlots.filter((t) => t.is_standby);
    const trainees: TraineeInfo[] = traineeSlots
      .filter((t) => t.trainee_discord)
      .map((t) => ({
        discord: t.trainee_discord as string,
        zone: t.zone != null ? String(t.zone) : '',
        trainer: t.trainer_name ?? '',
      }));
    const reservedTrainees: TraineeInfo[] = reservedSlots
      .filter((t) => t.trainee_discord)
      .map((t) => ({
        discord: t.trainee_discord as string,
        zone: t.zone != null ? String(t.zone) : '',
        trainer: t.trainer_name ?? '',
      }));

    return {
      session_id: row.session_id,
      session_name: row.session_name ?? null,
      session_desc: row.session_desc ?? null,
      session_status: row.session_status ?? null,
      session_duration: row.session_duration ?? null,
      session_datetime_iso: siteWallTimeToISOString(row.session_date, row.session_time, timezoneMode),
      timezone_mode: timezoneMode,
      host,
      cohost1,
      cohost2,
      cohost3,
      supervisor,
      assistant1,
      assistant2,
      assistant3,
      assistant4,
      additionalStaff,
      cohost_filled: cohostFilled,
      cohost_total: 3,
      assistant_filled: assistantFilled,
      assistant_total: 4,
      trainee_filled: trainees.length,
      trainee_total: Number(row.num_slots ?? 0),
      trainees,
      reserved_trainees: reservedTrainees,
    };
  });
}
