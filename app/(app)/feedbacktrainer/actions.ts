'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/utils/supabase/admin';
import { getFeedbackTrainerAccess } from '@/lib/feedbackTrainerAccess';
import { parseFeedbackSetupTime } from '@/lib/feedbackSetupTime';

function fail(message: string): never {
  redirect(`/feedbacktrainer?error=${encodeURIComponent(message)}`);
}

function optionalNumber(form: FormData, key: string, max: number): number | null {
  const raw = String(form.get(key) ?? '').trim();
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0 || value > max) fail(`Invalid ${key.replace('_', ' ')}.`);
  return value;
}

export async function saveTrainerFeedback(formData: FormData) {
  const access = await getFeedbackTrainerAccess();
  if (!access) fail('You do not have access to feedback.');
  const db = createAdminClient();
  const mode = String(formData.get('mode') ?? '');
  const setupSeconds = parseFeedbackSetupTime(String(formData.get('setup_time_mmss') ?? ''));
  if (setupSeconds === undefined) fail('Enter setup time as MM:SS.');
  const content = {
    trains: optionalNumber(formData, 'trains', 32767),
    setup_seconds: setupSeconds,
    setup: String(formData.get('setup') ?? '').trim().slice(0, 10000) || null,
    conflict: String(formData.get('conflict') ?? '').trim().slice(0, 10000) || null,
    priority: String(formData.get('priority') ?? '').trim().slice(0, 10000) || null,
    rbtiming: String(formData.get('rbtiming') ?? '').trim().slice(0, 10000) || null,
    overall: String(formData.get('overall') ?? '').trim().slice(0, 10000) || null,
    notes: String(formData.get('notes') ?? '').trim().slice(0, 10000) || null,
    updated_at: new Date().toISOString(),
  };
  let selectedId: number;
  if (mode === 'create') {
    const name = String(formData.get('trainee_name') ?? '').trim();
    if (!name || name.length > 160) fail('Enter a trainee name up to 160 characters.');
    const traineeId = String(formData.get('trainee_id') ?? '').trim();
    if (traineeId && (!/^\d{1,19}$/.test(traineeId) || BigInt(traineeId) > BigInt('9223372036854775807'))) {
      fail('Enter a valid Discord ID or leave it blank.');
    }
    const { data, error } = await db.from('session_feedback_logs').insert({
      ...content,
      feedback_origin: 'standalone', session_id: null, slot_number: null,
      trainee_id: traineeId || null, trainee_name: name,
      trainer_id: access.discordId,
      created_at: new Date().toISOString(),
    }).select('log_id').single();
    if (error || !data) fail(error?.message ?? 'Could not create feedback.');
    selectedId = data.log_id;
  } else if (mode === 'edit') {
    const id = Number(formData.get('log_id'));
    if (!Number.isSafeInteger(id) || id <= 0) fail('Invalid feedback entry.');
    const { data: existing } = await db.from('session_feedback_logs')
      .select('log_id, feedback_origin').eq('log_id', id).maybeSingle();
    if (!existing) fail('Feedback entry not found.');
    const name = String(formData.get('trainee_name') ?? '').trim();
    if (existing.feedback_origin === 'standalone' && (!name || name.length > 160)) {
      fail('Enter a trainee name up to 160 characters.');
    }
    const { error } = await db.from('session_feedback_logs')
      .update(existing.feedback_origin === 'standalone' ? { ...content, trainee_name: name } : content)
      .eq('log_id', id);
    if (error) fail(error.message);
    selectedId = id;
  } else {
    fail('Invalid feedback action.');
  }
  revalidatePath('/feedbacktrainer');
  redirect(`/feedbacktrainer?selected=${selectedId}&success=${encodeURIComponent(mode === 'create' ? 'Feedback created.' : 'Feedback saved.')}`);
}
