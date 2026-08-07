// FILE: lib/activeSession.ts
import type { SupabaseClient } from '@supabase/supabase-js';

export interface PublicSessionRow {
  slot: number;
  discord: string;
  roblox: string;
  zone: string | null;
  trainer: string;
  done: boolean;
}

// Loosely typed — session_ongoing has trainee_{1..10}_* dynamic columns
export interface SessionOngoing {
  session_id: number;
  host: string;
  started_at: string;
  live_state: string | null;
  [key: string]: unknown;
}

/**
 * Mirrors the PHP logic shared by active.php and public_session_state.php:
 * decode live_state.completedRows, then walk trainee_1..10 slots.
 */
export function buildRowsFromSession(session: SessionOngoing): PublicSessionRow[] {
  let completedRows: Record<string, boolean> = {};

  if (session.live_state) {
    try {
      const live = JSON.parse(session.live_state as string);
      completedRows = live?.completedRows ?? {};
    } catch {
      completedRows = {};
    }
  }

  const rows: PublicSessionRow[] = [];

  for (let t = 1; t <= 10; t++) {
    const discord = session[`trainee_${t}_discord`] as string | undefined;
    if (!discord) continue;

    rows.push({
      slot: t,
      discord,
      roblox: (session[`trainee_${t}_name`] as string) ?? '',
      zone: (session[`trainee_${t}_zone`] as string) ?? null,
      trainer: (session[`trainee_${t}_trainer_name`] as string) ?? '',
      // PHP checked both 0-indexed and 1-indexed completedRows entries — kept as-is
      done: Boolean(completedRows[t - 1] ?? completedRows[t]),
    });
  }

  return rows;
}

/**
 * Fetches a specific session by id, or (if none given) the most recently
 * started session — same fallback active.php used.
 */
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
    return (data as SessionOngoing) ?? null;
  }

  const { data } = await supabase
    .from('session_ongoing')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as SessionOngoing) ?? null;
}