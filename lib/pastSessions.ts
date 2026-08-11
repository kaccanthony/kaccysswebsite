// FILE: lib/pastSessions.ts
import { createClient } from '@/utils/supabase/server';

export interface PastTrainee {
  name: string;
  zone: string;
  trainer: string;
}

export interface PastSession {
  session_id: number;
  session_name: string | null;
  session_desc: string | null;
  session_status: string | null;
  session_date: string | null; // YYYY-MM-DD
  host: string | null;
  supervisor_name: string;
  cohost_filled: number;
  cohost_total: number;
  assistant_filled: number;
  assistant_total: number;
  trainees_trained: PastTrainee[];
}

/**
 * Confirmed against your actual db.txt schema:
 *  - `session_post_logs` has NO staff columns — those live in a separate
 *    `session_staff_logs` table, joined here by session_id (this matches what
 *    the original past.php already did — this file now matches that again).
 *  - `session_staff_logs` columns are `cohost_1`/`cohost_2`/`cohost_3`/
 *    `cohost_4_supervisor` (not `co_host1`/`co_host4_supervisor`).
 *  - `session_full_logs.trainer_id` is a `bigint` (a raw Discord snowflake),
 *    NOT a `profiles.id` uuid — it has to be matched against
 *    `profiles.discord_id` (stored as text) instead, cast to string.
 */
export async function getPastSessions(): Promise<PastSession[]> {
  const supabase = await createClient();

  const { data: sessions, error } = await supabase
    .from('session_post_logs')
    .select('session_id, session_name, session_desc, session_status, session_date')
    .order('session_date', { ascending: false })
    .order('session_id', { ascending: false });

  if (error) throw error;
  if (!sessions || sessions.length === 0) return [];

  const sessionIds = sessions.map((s) => s.session_id);

  const [{ data: staffLogs, error: staffErr }, { data: trainees, error: traineeErr }] = await Promise.all([
    supabase
      .from('session_staff_logs')
      .select('session_id, host, cohost_1, cohost_2, cohost_3, cohost_4_supervisor, assistant_1, assistant_2, assistant_3, assistant_4')
      .in('session_id', sessionIds),
    supabase
      .from('session_full_logs')
      .select('session_id, trainee_roblox, trainee_zone, trainer_id')
      .in('session_id', sessionIds)
      .eq('trainee_attendance', true),
  ]);

  if (staffErr) throw staffErr;
  if (traineeErr) throw traineeErr;

  const staffBySession = new Map((staffLogs ?? []).map((s) => [s.session_id, s]));

  // trainer_id is bigint (Discord snowflake) — profiles.discord_id is text, so cast to match.
  const trainerIds = Array.from(new Set((trainees ?? []).map((t) => String(t.trainer_id)).filter(Boolean)));
  const trainerNames = new Map<string, string>();
  if (trainerIds.length > 0) {
    const { data: profileRows } = await supabase.from('profiles').select('discord_id, discord_username').in('discord_id', trainerIds);
    for (const row of profileRows ?? []) {
      if (row.discord_id) trainerNames.set(row.discord_id, row.discord_username || row.discord_id);
    }
  }

  const traineesBySession = new Map<number, PastTrainee[]>();
  for (const t of trainees ?? []) {
    const list = traineesBySession.get(t.session_id) ?? [];
    const trainerKey = String(t.trainer_id);
    list.push({
      name: t.trainee_roblox,
      zone: String(t.trainee_zone ?? ''),
      trainer: trainerNames.get(trainerKey) || trainerKey || '—',
    });
    traineesBySession.set(t.session_id, list);
  }

  return sessions.map((row): PastSession => {
    const staff = staffBySession.get(row.session_id);
    const cohostFilled = [staff?.cohost_1, staff?.cohost_2, staff?.cohost_3].filter(Boolean).length;
    const assistantFilled = [staff?.assistant_1, staff?.assistant_2, staff?.assistant_3, staff?.assistant_4].filter(Boolean).length;

    return {
      session_id: row.session_id,
      session_name: row.session_name,
      session_desc: row.session_desc,
      session_status: row.session_status,
      session_date: row.session_date,
      host: staff?.host ?? null,
      supervisor_name: staff?.cohost_4_supervisor ?? '',
      cohost_filled: cohostFilled,
      cohost_total: 3,
      assistant_filled: assistantFilled,
      assistant_total: 4,
      trainees_trained: traineesBySession.get(row.session_id) ?? [],
    };
  });
}