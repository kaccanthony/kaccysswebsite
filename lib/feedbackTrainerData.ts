import { createAdminClient } from '@/utils/supabase/admin';
import type { FeedbackImage } from '@/app/(app)/sessionongoing/FeedbackImages';

export interface TrainerFeedbackLog {
  log_id: number;
  feedback_origin: 'session' | 'standalone';
  session_id: number | null;
  session_label: string;
  slot_number: number | null;
  trainee_id: string | null;
  trainee_name: string;
  trainer_id: string | null;
  trainer_name: string;
  session_date: string | null;
  session_time: string | null;
  zone: number | null;
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

const LOG_COLUMNS = 'log_id, feedback_origin, session_id, slot_number, trainee_id, trainee_name, trainer_id, created_at, updated_at, trains, setup, conflict, priority, rbtiming, overall, notes, setup_seconds';

export async function getTrainerFeedbackData(): Promise<{
  logs: TrainerFeedbackLog[];
  imagesByLog: Record<number, FeedbackImage[]>;
}> {
  const db = createAdminClient();
  const rawLogs: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from('session_feedback_logs').select(LOG_COLUMNS)
      .order('updated_at', { ascending: false }).range(offset, offset + 999);
    if (error) throw error;
    rawLogs.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  const sessionIds = [...new Set(rawLogs.map((row) => row.session_id).filter((id): id is number => typeof id === 'number'))];
  const sessionDetails = new Map<number, { name: string; date: string | null; time: string | null }>();
  const zoneByTrainee = new Map<string, number>();
  const archivedNames = new Map<string, string>();
  for (let start = 0; start < sessionIds.length; start += 100) {
    const ids = sessionIds.slice(start, start + 100);
    for (const table of ['session_post_logs', 'session_ongoing', 'session_upcoming'] as const) {
      const columns: string = table === 'session_post_logs'
        ? 'session_id, session_name, session_date, session_time, started'
        : 'session_id, session_name, session_date, session_time';
      const { data, error } = await db.from(table).select(columns).in('session_id', ids);
      let rows = (data ?? []) as unknown as Record<string, unknown>[];
      if (error && table === 'session_post_logs') {
        // Older databases may not yet have the archived session_time column.
        const fallback = await db.from(table)
          .select('session_id, session_name, session_date, started').in('session_id', ids);
        if (fallback.error) continue;
        rows = (fallback.data ?? []) as Record<string, unknown>[];
      } else if (error) continue;
      for (const row of rows) {
        const sessionId = Number(row.session_id);
        if (!sessionDetails.has(sessionId)) sessionDetails.set(sessionId, {
          name: String(row.session_name || `Session #${sessionId}`),
          date: typeof row.session_date === 'string' ? row.session_date : null,
          time: (typeof row.session_time === 'string' ? row.session_time
            : typeof row.started === 'string' ? row.started : '').slice(0, 5) || null,
        });
      }
    }
    const [{ data: archived }, { data: live }] = await Promise.all([
      db.from('session_full_logs').select('session_id, trainee_id, trainee_roblox, trainee_zone').in('session_id', ids),
      db.from('session_trainees').select('session_id, trainee_discord_id, trainee_discord, trainee_roblox_username, zone').in('session_id', ids),
    ]);
    for (const row of archived ?? []) {
      const key = `${row.session_id}:${row.trainee_id}`;
      zoneByTrainee.set(key, row.trainee_zone);
      if (row.trainee_roblox) archivedNames.set(key, row.trainee_roblox);
    }
    for (const row of live ?? []) {
      if (row.trainee_discord_id != null && row.zone != null) {
        zoneByTrainee.set(`${row.session_id}:${row.trainee_discord_id}`, row.zone);
      }
      if (row.trainee_discord_id != null) {
        const name = row.trainee_discord || row.trainee_roblox_username;
        if (name) archivedNames.set(`${row.session_id}:${row.trainee_discord_id}`, name);
      }
    }
  }

  const profileIds = [...new Set(rawLogs.flatMap((row) => [row.trainee_id, row.trainer_id]).filter((id) => id != null).map(String))];
  const profileNames = new Map<string, string>();
  for (let start = 0; start < profileIds.length; start += 100) {
    const { data } = await db.from('profiles').select('discord_id, discord_username')
      .in('discord_id', profileIds.slice(start, start + 100));
    for (const row of data ?? []) if (row.discord_id) profileNames.set(String(row.discord_id), row.discord_username || String(row.discord_id));
  }

  const logs: TrainerFeedbackLog[] = rawLogs.map((row) => {
    const sessionId = typeof row.session_id === 'number' ? row.session_id : null;
    const traineeId = row.trainee_id == null ? null : String(row.trainee_id);
    const trainerId = row.trainer_id == null ? null : String(row.trainer_id);
    const sessionDetail = sessionId == null ? null : sessionDetails.get(sessionId);
    return {
      log_id: Number(row.log_id),
      feedback_origin: row.feedback_origin === 'standalone' ? 'standalone' : 'session',
      session_id: sessionId,
      session_label: sessionId == null ? 'Standalone feedback' : `#${sessionId} · ${sessionDetail?.name ?? 'Session'}`,
      slot_number: row.slot_number == null ? null : Number(row.slot_number),
      trainee_id: traineeId,
      trainee_name: String(row.trainee_name || (traineeId && profileNames.get(traineeId)) ||
        (sessionId != null && traineeId && archivedNames.get(`${sessionId}:${traineeId}`)) || traineeId || 'Unknown trainee'),
      trainer_id: trainerId,
      trainer_name: trainerId ? profileNames.get(trainerId) ?? trainerId : '',
      session_date: sessionDetail?.date ?? null,
      session_time: sessionDetail?.time ?? null,
      zone: sessionId != null && traineeId ? zoneByTrainee.get(`${sessionId}:${traineeId}`) ?? null : null,
      created_at: String(row.created_at || row.updated_at || ''),
      updated_at: String(row.updated_at || row.created_at || ''),
      trains: row.trains == null ? null : Number(row.trains),
      setup: row.setup == null ? null : String(row.setup),
      conflict: row.conflict == null ? null : String(row.conflict),
      priority: row.priority == null ? null : String(row.priority),
      rbtiming: row.rbtiming == null ? null : String(row.rbtiming),
      overall: row.overall == null ? null : String(row.overall),
      notes: row.notes == null ? null : String(row.notes),
      setup_seconds: row.setup_seconds == null ? null : Number(row.setup_seconds),
    };
  });

  const imagesByLog: Record<number, FeedbackImage[]> = {};
  const publicUrl = process.env.R2_PUBLIC_URL?.replace(/\/$/, '');
  if (publicUrl) {
    for (let start = 0; start < logs.length; start += 100) {
      const ids = logs.slice(start, start + 100).map((log) => log.log_id);
      const { data, error } = await db.from('feedback_images')
        .select('id, feedback_log_id, slot_number, position, object_key, file_name, content_type, size_bytes, created_at')
        .in('feedback_log_id', ids).eq('status', 'ready').order('position');
      if (error) throw error;
      for (const row of data ?? []) {
        if (row.feedback_log_id == null) continue;
        (imagesByLog[row.feedback_log_id] ??= []).push({
          id: row.id, slot_number: row.slot_number, position: row.position,
          object_key: row.object_key, file_name: row.file_name,
          content_type: row.content_type, size_bytes: row.size_bytes,
          created_at: row.created_at,
          url: `${publicUrl}/${row.object_key}`,
        });
      }
    }
  }
  return { logs, imagesByLog };
}
