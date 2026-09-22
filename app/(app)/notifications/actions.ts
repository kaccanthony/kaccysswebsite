// FILE: app/(app)/notifications/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/getCurrentUser';
import { createClient } from '@/utils/supabase/server';

export async function markNotificationRead(formData: FormData) {
  const user = await getCurrentUser();
  const notifId = parseInt((formData.get('notif_id') as string) || '', 10);
  if (!notifId) return;

  const supabase = await createClient();
  await supabase.from('notification_reads').upsert({ notif_id: notifId, profile_id: user.id }, { onConflict: 'notif_id,profile_id' });
  revalidatePath('/notifications');
}

export async function markAllRead(formData: FormData) {
  const user = await getCurrentUser();
  const idsRaw = (formData.get('notif_ids') as string) || '';
  const ids = idsRaw.split(',').map((s) => parseInt(s, 10)).filter((n) => !Number.isNaN(n));
  if (ids.length === 0) return;

  const supabase = await createClient();
  const rows = ids.map((id) => ({ notif_id: id, profile_id: user.id }));
  await supabase.from('notification_reads').upsert(rows, { onConflict: 'notif_id,profile_id' });
  revalidatePath('/notifications');
}
