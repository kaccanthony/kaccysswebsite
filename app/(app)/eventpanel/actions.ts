'use server';

import { getCurrentUser } from '@/lib/getCurrentUser';
import { createClient } from '@/utils/supabase/server';

export async function setEventRunTiming(runId: number, start: string, end: string, concluded: boolean) {
  await getCurrentUser();
  if (!Number.isSafeInteger(runId) || runId < 1) return { error: 'Invalid event run.' };
  const startedAt = start ? new Date(start) : null;
  const endedAt = end ? new Date(end) : null;
  if ((startedAt && !Number.isFinite(startedAt.getTime())) ||
      (endedAt && !Number.isFinite(endedAt.getTime())) ||
      (endedAt && (!startedAt || endedAt < startedAt))) {
    return { error: 'Enter a valid event start and end time.' };
  }
  const status = concluded || endedAt ? 'concluded' : startedAt ? 'running' : 'ready';
  const supabase = await createClient();
  const { data, error } = await supabase.from('event_runs').update({
    started_at: startedAt?.toISOString() ?? null,
    ended_at: endedAt?.toISOString() ?? null,
    concluded_at: concluded ? new Date().toISOString() : null,
    status,
  }).eq('event_run_id', runId).select('event_run_id').maybeSingle();
  if (error || !data) return { error: error?.message ?? 'Event update was not permitted.' };
  return { error: null };
}
