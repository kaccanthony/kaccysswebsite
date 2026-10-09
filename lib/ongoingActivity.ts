import type { SupabaseClient } from '@supabase/supabase-js';

export type OngoingActivity = {
  sessions: { id: number; name: string }[];
  events: { id: number; name: string }[];
};

export async function getOngoingActivity(supabase: SupabaseClient): Promise<OngoingActivity> {
  const [sessions, events] = await Promise.all([
    supabase.from('session_ongoing').select('session_id, session_name').order('session_id'),
    supabase.from('event_runs').select('event_run_id, event_name').eq('status', 'running').order('event_run_id'),
  ]);
  if (sessions.error) console.error('Ongoing session lookup failed:', sessions.error.message);
  if (events.error) console.error('Ongoing event lookup failed:', events.error.message);
  return {
    sessions: (sessions.data ?? []).map((row) => ({ id: row.session_id, name: row.session_name || `Session #${row.session_id}` })),
    events: (events.data ?? []).map((row) => ({ id: row.event_run_id, name: row.event_name || `Event #${row.event_run_id}` })),
  };
}
