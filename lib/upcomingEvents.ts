import { createClient } from '@/utils/supabase/server';
import { currentSiteTimeParts, getSiteTimezoneMode, siteWallTimeToISOString, type SiteTimezoneMode } from '@/lib/siteTimezone';

export interface UpcomingEventAttendee {
  discord_id: string;
  discord_username: string;
  roblox_username: string;
}

export interface UpcomingEventStaff {
  name: string;
  role: string;
}

export interface UpcomingEvent {
  event_id: number;
  event_name: string;
  event_status: string;
  event_type: string | null;
  event_datetime_iso: string | null;
  timezone_mode: SiteTimezoneMode;
  host: string;
  co_hosts: string[];
  game_or_location: string;
  event_details: string;
  event_additional_notes: string | null;
  event_attendees: string[];
  event_attendees_data: UpcomingEventAttendee[];
  event_additional_staff: UpcomingEventStaff[];
}

export async function getUpcomingEvents(): Promise<UpcomingEvent[]> {
  const supabase = await createClient();
  const timezoneMode = await getSiteTimezoneMode(supabase);
  const { date, time } = currentSiteTimeParts(timezoneMode);
  const { data, error } = await supabase.from('event_upcoming')
    .select('event_id, event_status, event_type, host, co_hosts, event_name, event_date, event_time, game_or_location, event_details, event_additional_notes, event_attendees, event_attendees_data, event_additional_staff')
    .or(`event_date.gt.${date},and(event_date.eq.${date},event_time.gte.${time})`)
    .neq('event_status', 'Cancelled')
    .neq('event_status', 'Postponed')
    .order('event_date', { ascending: true })
    .order('event_time', { ascending: true });
  if (error) throw error;

  return (data ?? []).map((row): UpcomingEvent => ({
    event_id: row.event_id,
    event_name: row.event_name,
    event_status: row.event_status,
    event_type: row.event_type,
    event_datetime_iso: siteWallTimeToISOString(row.event_date, row.event_time, timezoneMode),
    timezone_mode: timezoneMode,
    host: row.host,
    co_hosts: (row.co_hosts ?? '').split(/[,;\n]/).map((name: string) => name.trim()).filter(Boolean),
    game_or_location: row.game_or_location,
    event_details: row.event_details,
    event_additional_notes: row.event_additional_notes,
    event_attendees: (row.event_attendees ?? '').split(/[,;\n]/).map((name: string) => name.trim()).filter(Boolean),
    event_attendees_data: Array.isArray(row.event_attendees_data) ? row.event_attendees_data as UpcomingEventAttendee[] : [],
    event_additional_staff: Array.isArray(row.event_additional_staff) ? row.event_additional_staff as UpcomingEventStaff[] : [],
  }));
}
