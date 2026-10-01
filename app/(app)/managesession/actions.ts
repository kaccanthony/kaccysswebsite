// FILE: app/(app)/managesession/actions.ts
'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/getCurrentUser';
import { createClient } from '@/utils/supabase/server';
import { buildStaffRowsFromForm, buildTraineeRowsFromForm, replaceSessionChildren } from '@/lib/sessionStaffTrainees';
import { findDuplicateAssignments } from './duplicateAssignments';
import { isWithinSessionTraineeLimit, SESSION_TRAINEE_LIMIT_MESSAGE } from '@/lib/session/traineeLimit';
import {
  canManageSiteTimezone,
  parseSiteTimezone,
  SITE_TIMEZONE_SETTING_KEY,
} from '@/lib/siteTimezone';

type SessionActionResult = { success: boolean; message: string };
const failure = (message: string): SessionActionResult => ({ success: false, message });

/**
 * Upserts one trainee into the known_trainees cache — matched by discord_id
 * when we have it (stable, preferred), otherwise by discord_username
 * (case-insensitive). Updates the existing row instead of inserting a
 * duplicate if a match is found.
 */
async function upsertKnownTrainee(
  supabase: Awaited<ReturnType<typeof createClient>>,
  entry: { discordId: string | null; discordUsername: string; robloxUsername: string | null }
) {
  if (!entry.discordUsername && !entry.discordId) return;

  const existingQuery = supabase.from('known_trainees').select('row_id').limit(1);
  const { data: existing } = entry.discordId
    ? await existingQuery.eq('discord_id', entry.discordId).maybeSingle()
    : await existingQuery.ilike('discord_username', entry.discordUsername).maybeSingle();

  if (existing) {
    await supabase
      .from('known_trainees')
      .update({
        discord_username: entry.discordUsername,
        roblox_username: entry.robloxUsername,
        discord_id: entry.discordId ?? undefined, // fill in if we now know it and didn't before
        last_seen_at: new Date().toISOString(),
      })
      .eq('row_id', existing.row_id);
  } else {
    await supabase.from('known_trainees').insert({
      discord_id: entry.discordId,
      discord_username: entry.discordUsername,
      roblox_username: entry.robloxUsername,
      last_seen_at: new Date().toISOString(),
    });
  }
}

export async function deleteSession(formData: FormData): Promise<SessionActionResult> {
  const user = await getCurrentUser();
  if (user.permLevel < 15) return failure('You do not have permission to delete sessions.');

  const sessionId = parseInt(formData.get('session_id') as string, 10);
  const supabase = await createClient();

  // session_staff / session_trainees have no FK-cascade guarantee shown in the
  // schema, so clean them up explicitly before removing the session itself.
  const { error } = await supabase.rpc('delete_upcoming_session', { p_session_id: sessionId });
  if (error?.code === 'PGRST202') {
    const children = await Promise.all([
      supabase.from('session_staff').delete().eq('session_id', sessionId),
      supabase.from('session_trainees').delete().eq('session_id', sessionId),
    ]);
    const childError = children.find((result) => result.error)?.error;
    if (childError) return failure(childError.message);
    const { error: deleteError } = await supabase.from('session_upcoming').delete().eq('session_id', sessionId);
    if (deleteError) return failure(deleteError.message);
  } else if (error) {
    return failure(error.message);
  }

  revalidatePath('/managesession');
  return { success: true, message: 'Session deleted.' };
}

// Staff normalization is shared with the final Setup Session save so both
// entry points persist identical role codes and Internal Helper placement.
export async function saveSession(formData: FormData): Promise<SessionActionResult> {
  const user = await getCurrentUser();
  if (user.permLevel < 10) return failure('You do not have permission to manage sessions.');

  const action = formData.get('action') as string; // 'add' | 'edit'
  const numSlots = parseInt((formData.get('num_slots') as string) || '0', 10);
  const reservedSlots = Math.max(0, Math.min(10, parseInt((formData.get('reserved_slots') as string) || '0', 10) || 0));

  if (!Number.isSafeInteger(numSlots) || numSlots < 0 || !isWithinSessionTraineeLimit(numSlots, reservedSlots)) {
    return failure(SESSION_TRAINEE_LIMIT_MESSAGE);
  }

  if (findDuplicateAssignments(formData).size > 0) {
    return failure('Remove duplicate staff or trainee identity assignments in this session before saving.');
  }

  // ── Primary roles ──
  let pendingStaffRows: ReturnType<typeof buildStaffRowsFromForm>;
  try {
    pendingStaffRows = buildStaffRowsFromForm(formData, 0);
  } catch (error) {
    return failure(error instanceof Error ? error.message : 'Invalid staff assignments.');
  }

  const sessionDate = formData.get('session_date') as string;
  if (!sessionDate) return failure('Invalid or missing session date.');

  const sessionTime = formData.get('session_time') as string;
  if (!/^\d{2}:\d{2}$/.test(sessionTime)) return failure('Invalid or missing session time.');

  const supabase = await createClient();

  // ── session_upcoming holds ONLY its own real columns now — no staff or
  // trainee data lives here anymore. ──
  const sessionRow = {
    session_status: (formData.get('session_status') as string) || 'Requested',
    session_booked: formData.get('session_booked') === 'on',
    session_name: (formData.get('session_name') as string) || null,
    session_desc: (formData.get('session_desc') as string) || null,
    session_duration: (formData.get('session_duration') as string) || '',
    num_slots: numSlots,
    trainee_timer: parseInt((formData.get('trainee_timer') as string) || '15', 10),
    session_date: sessionDate,
    session_time: sessionTime,
    additional_notes: (formData.get('additional_notes') as string) || null,
  };

  let sessionId: number;
  let existingTrainerNames = new Map<number, string | null>();

  if (action === 'add') {
    const customIdRaw = formData.get('custom_session_id') as string;
    const customId = customIdRaw ? parseInt(customIdRaw, 10) : null;

    if (customId) {
      const [{ count: c1 }, { count: c2 }] = await Promise.all([
        supabase.from('session_upcoming').select('session_id', { count: 'exact', head: true }).eq('session_id', customId),
        supabase.from('session_ongoing').select('session_id', { count: 'exact', head: true }).eq('session_id', customId),
      ]);
      if ((c1 ?? 0) + (c2 ?? 0) > 0) {
        return failure(`Session ID #${customId} is already in use — pick a different one or leave it blank to auto-assign.`);
      }
    }

    const insertPayload = customId
      ? { session_id: customId, trainer_assignment_mode: 'auto', ...sessionRow }
      : { trainer_assignment_mode: 'auto', ...sessionRow };
    const { data: inserted, error } = await supabase.from('session_upcoming').insert(insertPayload).select('session_id').single();
    if (error || !inserted) return failure(error?.message ?? 'Could not create session.');
    sessionId = inserted.session_id;

    if (customId) {
      // Keep the auto-increment sequence ahead of any manually-chosen ID.
      await supabase.rpc('bump_session_id_sequence', { new_max: customId });
    }
  } else {
    sessionId = parseInt(formData.get('session_id') as string, 10);
    if (!sessionId) return failure('Missing session ID.');

    const { data: assignedTrainers, error: trainerError } = await supabase
      .from('session_trainees').select('slot_number, trainer_name').eq('session_id', sessionId);
    if (trainerError) return failure(trainerError.message);
    existingTrainerNames = new Map((assignedTrainers ?? []).map((row) => [row.slot_number, row.trainer_name]));

    const { error } = await supabase.from('session_upcoming').update(sessionRow).eq('session_id', sessionId);
    if (error) return failure(error.message);
  }

  // ── Replace session_staff for this session entirely (simplest correct way
  // to sync a form save against a child table with no natural per-row key
  // coming from the client). ──
  const staffRows = pendingStaffRows.map((row) => ({ ...row, session_id: sessionId }));

  // ── Replace session_trainees for this session entirely ──
  const traineeRows = buildTraineeRowsFromForm(formData, sessionId, numSlots, reservedSlots).map((row) => ({
    ...row,
    trainer_name: existingTrainerNames.get(row.slot_number) ?? null,
  }));

  try {
    await replaceSessionChildren(supabase, sessionId, staffRows, traineeRows);
  } catch (error) {
    revalidatePath('/managesession');
    return failure(error instanceof Error ? error.message : 'Could not save session assignments.');
  }

  if (traineeRows.length > 0) {
    // Cache/update each filled trainee slot in known_trainees for future
    // autocomplete — matched by discord_id (or username if no id given), so
    // someone appearing in multiple sessions gets ONE row that stays fresh,
    // not a pile of stale duplicates.
    const entries = traineeRows.map((r) => ({
      discordId: r.trainee_discord_id ? String(r.trainee_discord_id) : null,
      discordUsername: (r.trainee_discord as string) ?? '',
      robloxUsername: (r.trainee_roblox_username as string) ?? null,
    }));
    const { error: cacheError } = await supabase.rpc('upsert_known_trainees_batch', { p_entries: entries });
    if (cacheError?.code === 'PGRST202') {
      for (const entry of entries) await upsertKnownTrainee(supabase, entry);
    }
  }

  const msg =
    action === 'add'
      ? user.rawRole === 'Head Staff' && user.permLevel < 20
        ? 'Session request submitted — a manager will review it.'
        : 'Session added.'
      : sessionRow.session_status === 'Booked'
        ? 'Session booked!'
        : 'Session saved.';

  revalidatePath('/managesession');
  return { success: true, message: msg };
}

export async function updateSiteTimezone(formData: FormData) {
  const failTimezone = (message: string): never => redirect(`/manage?panel=timezone&error=${encodeURIComponent(message)}`);
  const user = await getCurrentUser();
  if (!canManageSiteTimezone(user)) failTimezone('You do not have permission to change site timezone.');

  const requestedValue = formData.get('timezone_mode');
  if (requestedValue !== 'GMT' && requestedValue !== 'BST') failTimezone('Invalid timezone mode.');
  const timezoneMode = parseSiteTimezone(requestedValue);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('site_settings')
    .update({
      setting_value: timezoneMode,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq('setting_key', SITE_TIMEZONE_SETTING_KEY)
    .select('setting_value')
    .single();

  if (error || !data) failTimezone(`Could not update timezone. Run database/site_timezone.sql first. ${error?.message ?? 'Setting row was not found.'}`);

  revalidatePath('/', 'layout');
  revalidatePath('/manage');
  revalidatePath('/managesession');
  revalidatePath('/upcomingsesh');
  revalidatePath('/setupsesh');
  redirect(`/manage?panel=timezone&success=${encodeURIComponent(`Site timezone changed to ${timezoneMode}.`)}`);
}
