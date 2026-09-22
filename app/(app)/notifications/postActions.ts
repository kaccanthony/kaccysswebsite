// FILE: app/(app)/notifications/postActions.ts
'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/getCurrentUser';
import { createClient } from '@/utils/supabase/server';

function fail(redirectTo: string, message: string): never {
  redirect(`${redirectTo}?error=${encodeURIComponent(message)}`);
}

export async function postNotification(formData: FormData) {
  const user = await getCurrentUser();
  if (!user.isStaff) fail('/dashboard', 'You do not have permission to post notifications.');

  const redirectTo = (formData.get('redirect_to') as string) || '/dashboard';
  const category = (formData.get('category') as string) || 'announcement';
  const title = ((formData.get('title') as string) || '').trim();
  const description = ((formData.get('description') as string) || '').trim();
  if (!title || !description) fail(redirectTo, 'Title and description are required.');

  const audienceType = (formData.get('audience_type') as string) || 'everyone';
  const audienceRank = (formData.get('audience_rank') as string) || null;
  const audienceDepartment = (formData.get('audience_department') as string) || null;

  const supabase = await createClient();

  const { data: inserted, error } = await supabase
    .from('notifications')
    .insert({
      category,
      title,
      description,
      posted_by: user.id,
      audience_type: audienceType,
      audience_rank: audienceType === 'rank' ? audienceRank : null,
      audience_department: audienceType === 'department' ? audienceDepartment : null,
    })
    .select('notif_id')
    .single();

  if (error || !inserted) fail(redirectTo, error?.message ?? 'Could not post notification.');

  if (audienceType === 'users') {
    const userIds = formData.getAll('recipient_ids') as string[];
    if (userIds.length > 0) {
      await supabase.from('notification_recipients').insert(userIds.map((id) => ({ notif_id: inserted.notif_id, profile_id: id })));
    }
  }

  revalidatePath(redirectTo);
  revalidatePath('/notifications');
  redirect(`${redirectTo}?success=${encodeURIComponent('Notification posted.')}`);
}
