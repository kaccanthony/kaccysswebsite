// FILE: app/(app)/managefeedback/actions.ts
'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/getCurrentUser';
import { createClient } from '@/utils/supabase/server';

function fail(message: string): never {
  redirect(`/managefeedback?error=${encodeURIComponent(message)}`);
}

export async function saveFeedback(formData: FormData) {
  const user = await getCurrentUser();
  if (!user.isStaff) fail('You do not have permission to manage feedback.');

  const action = formData.get('action') as string; // 'add' | 'edit'

  const sessionId = parseInt((formData.get('session_id') as string) || '', 10);
  const traineeId = ((formData.get('trainee_id') as string) || '').trim();
  if (!sessionId || (action === 'add' && !traineeId)) fail('A session and trainee are required.');

  const trainerId = ((formData.get('trainer_id') as string) || '').trim();
  const trainsRaw = formData.get('trains') as string;
  const setupSecondsRaw = formData.get('setup_seconds') as string;

  const row = {
    session_id: sessionId,
    // kept as strings — bigint Discord snowflakes exceed JS's safe integer range
    trainee_id: traineeId || null,
    trainer_id: trainerId || null,
    trains: trainsRaw ? parseInt(trainsRaw, 10) : null,
    setup: (formData.get('setup') as string) || null,
    conflict: (formData.get('conflict') as string) || null,
    priority: (formData.get('priority') as string) || null,
    rbtiming: (formData.get('rbtiming') as string) || null,
    overall: (formData.get('overall') as string) || null,
    notes: (formData.get('notes') as string) || null,
    setup_seconds: setupSecondsRaw ? parseInt(setupSecondsRaw, 10) : null,
    updated_at: new Date().toISOString(),
  };

  const supabase = await createClient();

  if (action === 'add') {
    const { error } = await supabase.from('session_feedback_logs').insert(row);
    if (error) fail(error.message);

    revalidatePath('/managefeedback');
    redirect('/managefeedback?success=' + encodeURIComponent('Feedback created.'));
  } else {
    const logId = parseInt((formData.get('log_id') as string) || '', 10);
    if (!logId) fail('Missing feedback entry.');

    const { error } = await supabase.from('session_feedback_logs').update(row).eq('log_id', logId);
    if (error) fail(error.message);

    revalidatePath('/managefeedback');
    redirect('/managefeedback?success=' + encodeURIComponent('Feedback updated.'));
  }
}

export async function deleteFeedback(formData: FormData) {
  const user = await getCurrentUser();
  if (!user.isStaff) fail('You do not have permission to delete feedback.');

  const logId = parseInt((formData.get('log_id') as string) || '', 10);
  if (!logId) fail('Missing feedback entry.');

  const supabase = await createClient();
  await supabase.from('session_feedback_logs').delete().eq('log_id', logId);

  revalidatePath('/managefeedback');
  redirect('/managefeedback?success=' + encodeURIComponent('Feedback deleted.'));
}
