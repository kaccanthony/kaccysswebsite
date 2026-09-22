// FILE: lib/activeSession.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { LiveState } from '@/types/session';

export interface PublicSessionRow {
  key: string;
  slot: number | 'Standby' | 'Unallocated';
  group: 'allocated' | 'reserved';
  discord: string;
  roblox: string;
  zone: string | null;
  trainer: string;
  done: boolean;
}

interface SessionTrainee {
  slot_number: number;
  is_standby: boolean;
  trainee_discord: string | null;
  trainee_roblox_username: string | null;
  zone: number | null;
  trainer_name: string | null;
}

export interface SessionOngoing {
  session_id: number;
  host: string;
  started_at: string | null;
  live_state: LiveState | string | null;
  trainees: SessionTrainee[];
  [key: string]: unknown;
}

export function buildRowsFromSession(session: SessionOngoing): PublicSessionRow[] {
  let completedRows: Record<string, boolean> = {};

  if (session.live_state) {
    try {
      const live = typeof session.live_state === 'string'
        ? JSON.parse(session.live_state) as LiveState
        : session.live_state;
      completedRows = live.completedRows ?? {};
    } catch {
      completedRows = {};
    }
  }

  const assignedRows: PublicSessionRow[] = session.trainees
    .filter((trainee) => Boolean(trainee.trainee_discord || trainee.trainee_roblox_username))
    .sort((a, b) => a.slot_number - b.slot_number)
    .map((trainee) => ({
      key: `assigned-${trainee.slot_number}`,
      slot: trainee.is_standby ? 'Standby' : trainee.slot_number,
      group: trainee.is_standby ? 'reserved' : 'allocated',
      discord: trainee.trainee_discord ?? '',
      roblox: trainee.trainee_roblox_username ?? '',
      zone: trainee.zone == null ? null : `Zone ${trainee.zone}`,
      trainer: trainee.trainer_name ?? '',
      // Controller row keys are zero-based; retain the one-based fallback for
      // older live_state rows created by the previous implementation.
      done: Boolean(completedRows[String(trainee.slot_number - 1)] ?? completedRows[String(trainee.slot_number)]),
    }));

  const unallocatedRows: PublicSessionRow[] = (session.live_state && (() => {
    try {
      return typeof session.live_state === 'string'
        ? (JSON.parse(session.live_state) as LiveState).unallocatedTrainees
        : session.live_state.unallocatedTrainees;
    } catch {
      return [];
    }
  })() || []).map((trainee) => ({
    key: `unallocated-${trainee.uid}`,
    slot: 'Unallocated',
    group: 'reserved',
    discord: trainee.discord,
    roblox: trainee.roblox,
    zone: trainee.zone || null,
    trainer: trainee.trainerName,
    done: false,
  }));

  return [...assignedRows, ...unallocatedRows];
}

async function hydrateSession(
  supabase: SupabaseClient,
  row: Record<string, unknown> | null
): Promise<SessionOngoing | null> {
  if (!row) return null;
  const sessionId = Number(row.session_id);
  const [{ data: staffRows }, { data: trainees }] = await Promise.all([
    supabase
      .from('session_staff')
      .select('role, staff_name')
      .eq('session_id', sessionId),
    supabase
      .from('session_trainees')
      .select('slot_number, is_standby, trainee_discord, trainee_roblox_username, zone, trainer_name')
      .eq('session_id', sessionId)
      .order('slot_number', { ascending: true }),
  ]);
  const hostRow = (staffRows ?? []).find(
    (staff) => staff.role === 'HOST' || staff.role.startsWith('HOST,')
  );

  return {
    ...row,
    session_id: sessionId,
    host: hostRow?.staff_name ?? '',
    started_at: (row.started_at as string | null) ?? null,
    live_state: (row.live_state as LiveState | string | null) ?? null,
    trainees: (trainees ?? []) as SessionTrainee[],
  };
}

/** Fetches an ongoing session and its normalized host/trainee child rows. */
export async function fetchSession(
  supabase: SupabaseClient,
  sessionId?: number
): Promise<SessionOngoing | null> {
  if (sessionId) {
    const { data } = await supabase
      .from('session_ongoing')
      .select('*')
      .eq('session_id', sessionId)
      .maybeSingle();
    return hydrateSession(supabase, data as Record<string, unknown> | null);
  }

  const { data } = await supabase
    .from('session_ongoing')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return hydrateSession(supabase, data as Record<string, unknown> | null);
}
