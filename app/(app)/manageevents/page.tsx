import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/getCurrentUser';
import { createClient } from '@/utils/supabase/server';
import { getSiteTimezoneMode } from '@/lib/siteTimezone';
import ManageEventsClient, { type EventRow, type StaffOption } from './ManageEventsClient';

export const metadata = { title: 'Manage Events' };

export default async function ManageEventsPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const { data: access } = user.isAdmin ? { data: null } : await supabase.from('staff_profiles')
    .select('eventh_auth, eventch_auth').eq('id', user.id).maybeSingle();
  if (!user.isAdmin && !access?.eventh_auth && !access?.eventch_auth) redirect('/dashboard');

  const [{ data: events, error }, { data: staffRows }, { data: rosterRows }, { data: archivedGames }, timezoneMode] = await Promise.all([
    supabase.from('event_upcoming').select('event_id, event_status, event_type, host, co_hosts, event_name, event_date, event_time, game_or_location, event_details, event_attendees, event_attendees_data, event_additional_staff')
      .order('event_date', { ascending: true }).order('event_time', { ascending: true }),
    supabase.from('staff_profiles').select('eventh_auth, eventch_auth, profiles(discord_username, discord_server_name, discord_id)'),
    supabase.from('staff_roster').select('discord_id, discord_username, eventh_auth, eventch_auth'),
    supabase.from('event_log_archives').select('game_or_location').order('event_date', { ascending: false }).limit(500),
    getSiteTimezoneMode(supabase),
  ]);
  const staff = new Map<string, StaffOption>();
  for (const row of rosterRows ?? []) {
    staff.set(row.discord_id || row.discord_username.toLowerCase(), {
      name: row.discord_username, host: row.eventh_auth, cohost: row.eventch_auth,
    });
  }
  for (const row of staffRows ?? []) {
    const profile = row.profiles as unknown as { discord_username: string | null; discord_server_name: string | null; discord_id: string | null } | null;
    if (profile?.discord_username) staff.set(profile.discord_id || profile.discord_username.toLowerCase(), {
      name: profile.discord_server_name || profile.discord_username, host: row.eventh_auth, cohost: row.eventch_auth,
    });
  }
  const gameNames = new Map<string, string>();
  for (const row of [...(events ?? []), ...(archivedGames ?? [])]) {
    const game = row.game_or_location.trim();
    if (game) gameNames.set(game.toLowerCase(), game);
  }
  return <ManageEventsClient events={(events ?? []) as unknown as EventRow[]}
    staff={[...staff.values()].sort((a, b) => a.name.localeCompare(b.name))}
    gameSuggestions={[...gameNames.values()].sort((a, b) => a.localeCompare(b))}
    timezoneMode={timezoneMode} loadError={error?.message ?? null} />;
}
