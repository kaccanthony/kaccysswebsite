import type { SupabaseClient } from '@supabase/supabase-js';

export type SiteTimezoneMode = 'GMT' | 'BST';

export const DEFAULT_SITE_TIMEZONE: SiteTimezoneMode = 'BST';
export const SITE_TIMEZONE_SETTING_KEY = 'timezone_mode';

export function canManageSiteTimezone(user: {
  isAdmin: boolean;
  adminRole: string | null;
  rawRole: string;
}): boolean {
  return (
    (user.isAdmin && ['owner', 'developer', 'moderator'].includes(user.adminRole ?? ''))
    || ['Operations Manager', 'Community Manager'].includes(user.rawRole)
  );
}

export function parseSiteTimezone(value: unknown): SiteTimezoneMode {
  return value === 'GMT' || value === 'BST' ? value : DEFAULT_SITE_TIMEZONE;
}

export async function getSiteTimezoneMode(supabase: SupabaseClient): Promise<SiteTimezoneMode> {
  const { data, error } = await supabase
    .from('site_settings')
    .select('setting_value')
    .eq('setting_key', SITE_TIMEZONE_SETTING_KEY)
    .maybeSingle();

  // Keep existing deployments usable until database/site_timezone.sql runs.
  if (error || !data) return DEFAULT_SITE_TIMEZONE;
  return parseSiteTimezone(data.setting_value);
}

export function siteTimezoneOffsetMinutes(mode: SiteTimezoneMode): number {
  return mode === 'BST' ? 60 : 0;
}

/** Converts a stored site wall-clock date/time into an absolute ISO instant. */
export function siteWallTimeToISOString(
  date: string,
  time: string,
  mode: SiteTimezoneMode
): string | null {
  const match = `${date}T${time}`.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/
  );
  if (!match) return null;

  const [, year, month, day, hour, minute, second = '00'] = match;
  const utcMilliseconds = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  ) - siteTimezoneOffsetMinutes(mode) * 60_000;

  const instant = new Date(utcMilliseconds);
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}

/** Current date/time expressed in selected fixed site timezone. */
export function currentSiteTimeParts(mode: SiteTimezoneMode): { date: string; time: string } {
  const shifted = new Date(Date.now() + siteTimezoneOffsetMinutes(mode) * 60_000);
  return {
    date: shifted.toISOString().slice(0, 10),
    time: shifted.toISOString().slice(11, 19),
  };
}

export function formatInstantInSiteTimezone(
  instant: Date,
  mode: SiteTimezoneMode,
  options: Intl.DateTimeFormatOptions
): string {
  const shifted = new Date(instant.getTime() + siteTimezoneOffsetMinutes(mode) * 60_000);
  return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' }).format(shifted);
}
