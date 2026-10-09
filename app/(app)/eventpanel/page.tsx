import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/getCurrentUser';
import { createClient } from '@/utils/supabase/server';
import EventPanelClient, { type EventSeed } from './EventPanelClient';
import { getSiteTimezoneMode } from '@/lib/siteTimezone';

export const metadata = { title: 'Event Panel' };

export default async function EventPanelPage({ searchParams }: {
  searchParams: Promise<{ event_id?: string }>;
}) {
  const eventRunId = Number((await searchParams).event_id);
  if (!Number.isSafeInteger(eventRunId) || eventRunId < 1) {
    const timezoneMode = await getSiteTimezoneMode(await createClient());
    return <EventPanelClient initialSeed={{ timezone: timezoneMode }} />;
  }

  const user = await getCurrentUser();
  const supabase = await createClient();
  const timezoneMode = await getSiteTimezoneMode(supabase);
  const { data: run } = await supabase.from('event_runs')
    .select('event_run_id, event_type, event_date, event_time, timezone_mode, game_name, description, host, co_hosts, additional_staff, planned_attendees, started_at, ended_at, round_count, status')
    .eq('event_run_id', eventRunId).maybeSingle();
  if (!run) redirect('/eventsetup');

  const identities = [user.effectiveUsername, ...(user.viewingAs ? [] : [user.discordUsername ?? ''])]
    .map(value => value.trim().toLowerCase());
  const assigned = identities.includes(run.host.trim().toLowerCase()) ||
    run.co_hosts.split(/[,;\n]/).some((name: string) => identities.includes(name.trim().toLowerCase()));
  if (!user.isAdmin && !assigned) {
    redirect('/dashboard?error=' + encodeURIComponent('You are not assigned to this event.'));
  }

  const plannedParticipants = run.planned_attendees.split(/[\n,;]+/).map((name: string) => name.trim()).filter(Boolean)
    .map((name: string, index: number) => ({ id: `planned-${index + 1}`, name, rounds: Array(10).fill(''), rank: '', attended: false }));

  return <EventPanelClient key={run.event_run_id} eventRunId={run.event_run_id} initialSeed={{
    type: run.event_type as EventSeed['type'],
    date: run.event_date,
    time: run.event_time.slice(0, 5),
    timezone: timezoneMode,
    game: run.game_name,
    description: run.description,
    host: run.host,
    cohosts: run.co_hosts.split(/[,;\n]/).map((name: string) => name.trim()).filter(Boolean).slice(0, 3),
    additionalStaff: run.additional_staff,
    ...(plannedParticipants.length ? { participants: plannedParticipants } : {}),
    start: run.started_at ?? '',
    end: run.ended_at ?? '',
    roundCount: run.round_count,
    concluded: run.status === 'concluded',
  }} />;
}
