import { getCurrentUser } from '@/lib/getCurrentUser';
import { createClient } from '@/utils/supabase/server';
import { currentSiteTimeParts, getSiteTimezoneMode } from '@/lib/siteTimezone';
import EventSetupClient, { type ScheduledEvent } from './EventSetupClient';
import { eventError } from '@/lib/events/errors';

export const metadata = { title: 'Setup Event' };

export default async function EventSetupPage({ searchParams }: {
  searchParams: Promise<{ event_id?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const timezoneMode = await getSiteTimezoneMode(supabase);
  const { date: today } = currentSiteTimeParts(timezoneMode);
  const params = await searchParams;

  const { data: scheduled, error: scheduleError } = await supabase
    .from('event_upcoming')
    .select('event_id, event_type, event_status, host, co_hosts, event_name, event_date, event_time, game_or_location, event_details, event_additional_notes, event_attendees')
    .eq('event_date', today)
    .in('event_status', ['Scheduled', 'Published'])
    .order('event_time', { ascending: true });

  const identities = new Set(
    [user.effectiveUsername, ...(user.viewingAs ? [] : [user.discordUsername ?? ''])]
      .map(value => value.trim().toLowerCase()).filter(Boolean)
  );
  const events = (scheduled ?? []).filter(row => user.isAdmin || identities.has(row.host.trim().toLowerCase())) as ScheduledEvent[];
  const requestedEventId = Number(params.event_id);
  const ids = events.map(event => event.event_id);
  const { data: runs, error: runsError } = ids.length
    ? await supabase.from('event_runs').select('event_run_id, source_event_id, event_type, status').in('source_event_id', ids)
    : await supabase.from('event_runs').select('event_run_id, source_event_id, event_type, status').limit(0);

  return <EventSetupClient
    events={events}
    runs={runs ?? []}
    timezoneMode={timezoneMode}
    canHost={user.isAdmin || user.effectiveAuths.eventh_auth}
    initialSelectedId={events.some(event => event.event_id === requestedEventId) ? requestedEventId : undefined}
    error={params.error ?? (scheduleError ? eventError('ERR_001', `Could not load scheduled events. Apply database/manage_events.sql if needed. ${scheduleError.message}`) : undefined) ?? (runsError ? eventError('ERR_001', 'Event panel database is not ready. Apply database/event_panel.sql first.') : undefined)}
    databaseReady={!runsError}
  />;
}
