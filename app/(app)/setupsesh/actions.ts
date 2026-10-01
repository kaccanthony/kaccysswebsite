// FILE: app/(app)/setup/actions.ts
'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/getCurrentUser';
import { createClient } from '@/utils/supabase/server';
import { writeStaffAndTrainees, upsertKnownTrainees } from '@/lib/sessionStaffTrainees';
import { findDuplicateAssignments } from '../managesession/duplicateAssignments';
import { isWithinSessionTraineeLimit, SESSION_TRAINEE_LIMIT_MESSAGE } from '@/lib/session/traineeLimit';

function fail(sessionId: number, message: string): never {
  redirect(`/setupsesh?session_id=${sessionId}&error=${encodeURIComponent(message)}`);
}

/**
 * Was save_session_setup.php. Saves any last-minute staff/trainee edits made
 * in the setup modal, then moves the session from session_upcoming to
 * session_ongoing. Unlike the old PHP, session_staff/session_trainees don't
 * need to move at all — they already reference the session by session_id,
 * which stays the same across the transition. Only the base row moves, via
 * the start_session() Postgres function for atomicity (see the SQL you
 * already ran — no multi-statement transaction primitive exists in the
 * Supabase JS client, same reason bump_session_id_sequence is an RPC too).
 */
export async function confirmAndStartSession(formData: FormData) {
  await getCurrentUser(); // redirects to /login internally if not signed in

  const sessionId = parseInt((formData.get('session_id') as string) || '', 10);
  if (!sessionId) fail(0, 'Missing session ID.');

  if (findDuplicateAssignments(formData).size > 0) {
    fail(sessionId, 'Remove duplicate staff or trainee identity assignments in this session before starting.');
  }

  const numSlots = parseInt((formData.get('num_slots') as string) || '0', 10);
  const reservedSlots = Math.max(0, Math.min(10, parseInt((formData.get('reserved_slots') as string) || '0', 10) || 0));
  if (!Number.isSafeInteger(numSlots) || numSlots < 0 || !isWithinSessionTraineeLimit(numSlots, reservedSlots)) {
    fail(sessionId, SESSION_TRAINEE_LIMIT_MESSAGE);
  }

  const supabase = await createClient();

  let staffRows, traineeRows;
  try {
    ({ staffRows, traineeRows } = await writeStaffAndTrainees(supabase, sessionId, formData, numSlots, reservedSlots));
  } catch (e) {
    fail(sessionId, e instanceof Error ? e.message : 'Could not save staff/trainee assignments.');
  }

  // Cache trainees for future autocomplete, same as managesession's saveSession.
  await upsertKnownTrainees(supabase, traineeRows.map((r) => ({
    discordId: r.trainee_discord_id,
    discordUsername: r.trainee_discord ?? '',
    robloxUsername: r.trainee_roblox_username,
  })));

  const hasHost = staffRows.some((s) => s.role === 'HOST' || s.role.startsWith('HOST,'));
  if (!hasHost) fail(sessionId, 'A Host must be assigned before starting the session.');

  const trainerMode = String(formData.get('trainer_assignment_mode') ?? 'auto');
  const { error: modeError } = await supabase.from('session_upcoming')
    .update({ trainer_assignment_mode: trainerMode }).eq('session_id', sessionId);
  if (modeError) fail(sessionId, modeError.message);

  const { error } = await supabase.rpc('start_session', { p_session_id: sessionId });
  if (error) fail(sessionId, error.message);

  revalidatePath('/setupsesh');
  revalidatePath('/sessionongoing');
  revalidatePath('/active');
  // Refresh shared profile popup assignment data.
  revalidatePath('/', 'layout');
  redirect('/sessionongoing?session_id=' + sessionId);
}
