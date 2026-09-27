// FILE: lib/settings.ts
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * SCHEMA NOTE
 * ───────────
 * The original PHP page read from `staff_list` / `user_list` (separate
 * display_name, discord name, roblox name, hide_stats columns per table)
 * and `user_staff_notif_prefs` (one row per pref key).
 *
 * Neither of those tables exist anymore. Everything now lives on the
 * single `profiles` row, plus `staff_profiles` for staff-only fields
 * (currently just staff_rank).
 *
 * `profiles` has no dedicated `display_name` column. Rather than invent
 * a migration, this piggybacks the value inside the flexible
 * `notif_prefs` jsonb column under the key `display_name`. It's a
 * pragmatic workaround — if you want a cleaner setup, add a real
 * `display_name text` column to `profiles` and swap the two read/write
 * spots marked "DISPLAY NAME WORKAROUND" below.
 */

export const NOTIF_DEFAULTS: Record<string, string> = {
  staff_session_reminder: '0',
  staff_reminder_time: '15',
  staff_trainee_sound: '1',
  staff_trainee_warning: '1',
  staff_trainee_warning_time: '60',
  staff_announcement_display: 'toast',
  staff_announcement_enabled: '1',
  user_session_reminder: '0',
  user_reminder_time: '15',
  user_trainee_sound: '1',
  user_new_session: '1',
  user_cancellation: '1',
  user_browser_notifs: '1',
};

export const STAFF_TRAINEE_WARNING_OPTIONS = [
  { seconds: 300, value: '300', label: '5 min' },
  { seconds: 180, value: '180', label: '3 min' },
  { seconds: 120, value: '120', label: '2 min' },
  { seconds: 90, value: '90', label: '1 min 30 sec before' },
  { seconds: 60, value: '60', label: '1 min' },
  { seconds: 30, value: '30', label: '30 sec' },
  { seconds: 20, value: '20', label: '20 sec' },
] as const;

export function parseStaffTraineeWarningTimes(value: string | null | undefined): number[] {
  const allowed = new Set<number>(STAFF_TRAINEE_WARNING_OPTIONS.map((option) => option.seconds));
  return [...new Set((value ?? '').split(',').map(Number).filter((seconds) => allowed.has(seconds)))];
}

export const STAFF_KEYS = [
  'staff_session_reminder',
  'staff_reminder_time',
  'staff_trainee_sound',
  'staff_trainee_warning',
  'staff_trainee_warning_time',
  'staff_announcement_enabled',
  'staff_announcement_display',
] as const;

export const USER_KEYS = [
  'user_session_reminder',
  'user_reminder_time',
  'user_trainee_sound',
  'user_new_session',
  'user_cancellation',
  'user_browser_notifs',
] as const;

export const CHECKBOX_KEYS = new Set([
  'staff_session_reminder',
  'staff_trainee_sound',
  'staff_trainee_warning',
  'staff_announcement_enabled',
  'user_session_reminder',
  'user_trainee_sound',
  'user_new_session',
  'user_cancellation',
  'user_browser_notifs',
]);

export interface ProfileRow {
  id: string;
  discord_id: string | null;
  discord_username: string;
  discord_server_name: string | null;
  discord_avatar_url: string | null;
  roblox_username: string | null;
  hide_stats: boolean;
  notif_prefs: Record<string, string>;
}

export interface StaffProfileRow {
  staff_rank: string;
}

export interface SettingsData {
  profile: ProfileRow;
  staffProfile: StaffProfileRow | null;
  isStaff: boolean;
  prefs: Record<string, string>;
  displayName: string; // see DISPLAY NAME WORKAROUND
}

export function mergePrefs(raw: Record<string, string> | null | undefined): Record<string, string> {
  return { ...NOTIF_DEFAULTS, ...(raw ?? {}) };
}

export async function fetchSettingsData(
  supabase: SupabaseClient,
  userId: string
): Promise<SettingsData> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, discord_id, discord_username, discord_server_name, discord_avatar_url, roblox_username, hide_stats, notif_prefs')
    .eq('id', userId)
    .single();

  const { data: staffProfile } = await supabase
    .from('staff_profiles')
    .select('staff_rank')
    .eq('id', userId)
    .maybeSingle();

  const rawPrefs = (profile?.notif_prefs as Record<string, string>) ?? {};

  return {
    profile: profile as ProfileRow,
    staffProfile: (staffProfile as StaffProfileRow) ?? null,
    isStaff: Boolean(staffProfile),
    prefs: mergePrefs(rawPrefs),
    // The profile display name follows the Discord server nickname, falling back to the username.
    displayName: profile?.discord_server_name?.trim() || profile?.discord_username || '',
  };
}
