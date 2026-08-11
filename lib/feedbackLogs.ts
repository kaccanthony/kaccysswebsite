// FILE: lib/feedbackLogs.ts
import { createClient } from '@/utils/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface FeedbackLog {
  log_id: number;
  session_id: number;
  session_label: string; // "#123 — Session Name", resolved across whichever session table still has it
  trainee_id: string; // kept as string — bigint Discord snowflakes exceed JS's safe integer range
  trainee_name: string; // resolved discord_username where possible, else the raw id
  trainer_id: string | null;
  trainer_name: string | null;
  created_at: string;
  updated_at: string;
  trains: number | null;
  setup: string | null;
  conflict: string | null;
  priority: string | null;
  rbtiming: string | null;
  overall: string | null;
  notes: string | null;
  setup_seconds: number | null;
}

export interface SessionTraineeOption {
  session_id: number;
  session_label: string;
  trainee_id: string;
  trainee_label: string; // Roblox name — session_full_logs has no direct FK to profiles for trainees
}

async function resolveSessionLabels(supabase: SupabaseClient, sessionIds: number[]): Promise<Map<number, string>> {
  const labels = new Map<number, string>();
  if (sessionIds.length === 0) return labels;

  // A session_id could currently live in any of these three tables depending
  // on where it is in its lifecycle — check all three, first match wins.
  const [{ data: postRows }, { data: ongoingRows }, { data: upcomingRows }] = await Promise.all([
    supabase.from('session_post_logs').select('session_id, session_name').in('session_id', sessionIds),
    supabase.from('session_ongoing').select('session_id, session_name').in('session_id', sessionIds),
    supabase.from('session_upcoming').select('session_id, session_name').in('session_id', sessionIds),
  ]);

  for (const row of [...(postRows ?? []), ...(ongoingRows ?? []), ...(upcomingRows ?? [])]) {
    if (!labels.has(row.session_id)) {
      labels.set(row.session_id, row.session_name ? `#${row.session_id} — ${row.session_name}` : `#${row.session_id}`);
    }
  }
  for (const id of sessionIds) {
    if (!labels.has(id)) labels.set(id, `#${id}`);
  }
  return labels;
}

/** Every feedback entry, newest-updated first. */
export async function getFeedbackLogs(): Promise<FeedbackLog[]> {
  const supabase = await createClient();

  const { data: logs, error } = await supabase.from('session_feedback_logs').select('*').order('updated_at', { ascending: false });

  if (error) throw error;
  if (!logs || logs.length === 0) return [];

  const sessionIds = Array.from(new Set(logs.map((l) => l.session_id)));
  const sessionLabels = await resolveSessionLabels(supabase, sessionIds);

  const discordIds = Array.from(
    new Set(
      logs
        .flatMap((l) => [String(l.trainee_id), l.trainer_id != null ? String(l.trainer_id) : null])
        .filter((v): v is string => !!v)
    )
  );
  const nameByDiscordId = new Map<string, string>();
  if (discordIds.length > 0) {
    const { data: profileRows } = await supabase.from('profiles').select('discord_id, discord_username').in('discord_id', discordIds);
    for (const row of profileRows ?? []) {
      if (row.discord_id) nameByDiscordId.set(row.discord_id, row.discord_username || row.discord_id);
    }
  }

  return logs.map((row: Record<string, any>): FeedbackLog => {
    const traineeKey = String(row.trainee_id);
    const trainerKey = row.trainer_id != null ? String(row.trainer_id) : null;
    return {
      log_id: row.log_id,
      session_id: row.session_id,
      session_label: sessionLabels.get(row.session_id) ?? `#${row.session_id}`,
      trainee_id: traineeKey,
      trainee_name: nameByDiscordId.get(traineeKey) ?? traineeKey,
      trainer_id: trainerKey,
      trainer_name: trainerKey ? nameByDiscordId.get(trainerKey) ?? trainerKey : null,
      created_at: row.created_at,
      updated_at: row.updated_at,
      trains: row.trains,
      setup: row.setup,
      conflict: row.conflict,
      priority: row.priority,
      rbtiming: row.rbtiming,
      overall: row.overall,
      notes: row.notes,
      setup_seconds: row.setup_seconds,
    };
  });
}

/**
 * Trainee picker options for creating a feedback entry "from scratch" — pulled
 * from actual attendance records (session_full_logs), since trainee_id has to
 * correspond to someone genuinely marked as trained in a real session.
 */
export async function getSessionTraineeOptions(): Promise<SessionTraineeOption[]> {
  const supabase = await createClient();

  const { data: attended, error } = await supabase
    .from('session_full_logs')
    .select('session_id, trainee_id, trainee_roblox')
    .eq('trainee_attendance', true)
    .order('session_id', { ascending: false });

  if (error) throw error;
  if (!attended || attended.length === 0) return [];

  const sessionIds = Array.from(new Set(attended.map((a) => a.session_id)));
  const sessionLabels = await resolveSessionLabels(supabase, sessionIds);

  return attended.map((row) => ({
    session_id: row.session_id,
    session_label: sessionLabels.get(row.session_id) ?? `#${row.session_id}`,
    trainee_id: String(row.trainee_id),
    trainee_label: row.trainee_roblox,
  }));
}