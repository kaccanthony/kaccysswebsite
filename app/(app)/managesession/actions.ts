// FILE: app/(app)/managesession/actions.ts
'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/getCurrentUser';
import { createClient } from '@/utils/supabase/server';

function fail(message: string): never {
  redirect(`/managesession?error=${encodeURIComponent(message)}`);
}

function buildTraineeFields(formData: FormData, numSlots: number) {
  const fields: Record<string, string | number | null> = {};
  for (let t = 1; t <= 10; t++) {
    const inRange = t <= numSlots;
    fields[`trainee_${t}_name`] = inRange ? (formData.get(`trainee_${t}_name`) as string) || null : null;
    fields[`trainee_${t}_discord`] = inRange ? (formData.get(`trainee_${t}_discord`) as string) || null : null;
    fields[`trainee_${t}_discord_id`] = inRange ? (formData.get(`trainee_${t}_discord_id`) as string) || null : null;
    const zone = formData.get(`trainee_${t}_zone`) as string;
    fields[`trainee_${t}_zone`] = inRange && zone ? parseInt(zone, 10) : null;
    fields[`trainee_${t}_note`] = inRange ? (formData.get(`trainee_${t}_note`) as string) || null : null;
  }
  return fields;
}

export async function deleteSession(formData: FormData) {
  const user = await getCurrentUser();
  if (user.permLevel < 15) fail('You do not have permission to delete sessions.');

  const sessionId = parseInt(formData.get('session_id') as string, 10);
  const supabase = await createClient();
  await supabase.from('session_upcoming').delete().eq('session_id', sessionId);

  revalidatePath('/managesession');
  redirect('/managesession?success=' + encodeURIComponent('Session deleted.'));
}

export async function saveSession(formData: FormData) {
  const user = await getCurrentUser();
  if (user.permLevel < 10) fail('You do not have permission to manage sessions.');

  const action = formData.get('action') as string; // 'add' | 'edit'
  const numSlots = parseInt((formData.get('num_slots') as string) || '0', 10);

  const host = (formData.get('host') as string) || '';
  const ch1 = (formData.get('co_host1') as string) || '';
  const ch2 = (formData.get('co_host2') as string) || '';
  const ch3 = (formData.get('co_host3') as string) || '';
  const ch4 = (formData.get('co_host4_supervisor') as string) || '';
  const as1 = (formData.get('assistant_1') as string) || '';
  const as2 = (formData.get('assistant_2') as string) || '';
  const as3 = (formData.get('assistant_3') as string) || '';
  const as4 = (formData.get('assistant_4') as string) || '';

  // Same duplicate-staff check as managesession.php
  const dupCheck = [host, ch1, ch2, ch3, as1, as2, as3, as4].filter(Boolean);
  if (new Set(dupCheck).size !== dupCheck.length) {
    fail("Duplicate staff entry detected — the same person can't hold two roles at once.");
  }

  const sessionDate = formData.get('session_date') as string;
  if (!sessionDate) fail('Invalid or missing session date.');

  let sessionTime = formData.get('session_time') as string;
  if (!/^\d{2}:\d{2}$/.test(sessionTime)) fail('Invalid or missing session time.');
  sessionTime = `${sessionTime}:00`;

  const supabase = await createClient();

  const row = {
    session_name: (formData.get('session_name') as string) || null,
    session_desc: (formData.get('session_desc') as string) || null,
    session_status: (formData.get('session_status') as string) || 'Requested',
    session_booked: formData.get('session_booked') === 'on',
    session_duration: (formData.get('session_duration') as string) || null,
    num_slots: numSlots,
    session_date: sessionDate,
    session_time: sessionTime,
    trainee_timer: parseInt((formData.get('trainee_timer') as string) || '0', 10),
    host,
    co_host1: ch1 || null,
    co_host2: ch2 || null,
    co_host3: ch3 || null,
    co_host4_supervisor: ch4 || null,
    assistant_1: as1 || null,
    assistant_2: as2 || null,
    assistant_3: as3 || null,
    assistant_4: as4 || null,
    additional_staff: (formData.get('additional_staff') as string) || null,
    ...buildTraineeFields(formData, numSlots),
  };

  if (action === 'add') {
    const customIdRaw = formData.get('custom_session_id') as string;
    const customId = customIdRaw ? parseInt(customIdRaw, 10) : null;

    if (customId) {
      const [{ count: c1 }, { count: c2 }] = await Promise.all([
        supabase.from('session_upcoming').select('session_id', { count: 'exact', head: true }).eq('session_id', customId),
        supabase.from('session_ongoing').select('session_id', { count: 'exact', head: true }).eq('session_id', customId),
      ]);
      if ((c1 ?? 0) + (c2 ?? 0) > 0) {
        fail(`Session ID #${customId} is already in use — pick a different one or leave it blank to auto-assign.`);
      }
    }

    const insertPayload = customId ? { session_id: customId, ...row } : row;
    const { error } = await supabase.from('session_upcoming').insert(insertPayload);
    if (error) fail(error.message);

    const msg =
      user.rawRole === 'Head Staff' && user.permLevel < 20
        ? 'Session request submitted — a manager will review it.'
        : 'Session added.';
    revalidatePath('/managesession');
    redirect('/managesession?success=' + encodeURIComponent(msg));
  } else {
    const sessionId = parseInt(formData.get('session_id') as string, 10);
    const { error } = await supabase.from('session_upcoming').update(row).eq('session_id', sessionId);
    if (error) fail(error.message);

    const msg = row.session_status === 'Booked' ? 'Session booked!' : 'Session saved.';
    revalidatePath('/managesession');
    redirect('/managesession?success=' + encodeURIComponent(msg));
  }
}