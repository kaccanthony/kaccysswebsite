'use server';
import { createClient } from '@/utils/supabase/server';

const ADMIN_ONLY_CATEGORIES = ['System', 'Admin', 'Update'];

export interface PostNotificationInput {
  category: string;
  title: string;
  description: string;
  audienceType: 'everyone' | 'rank' | 'department' | 'users';
  audienceRank?: string;
  audienceDepartment?: string;
  /** Only for audienceType === 'users' — no DB trigger handles this one, so the composer
   *  picks exactly who gets it and we insert notification_recipients ourselves below. */
  userIds?: string[];
}

export async function postNotification(input: PostNotificationInput) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized.');

  // Real permission check — never trust the client-side category filter alone.
  const [{ data: staffProfile }, { data: adminRow }] = await Promise.all([
    supabase.from('staff_profiles').select('staff_perm_level').eq('id', user.id).maybeSingle(),
    supabase.from('site_admins').select('id').eq('id', user.id).maybeSingle(),
  ]);
  const isAdmin = !!adminRow;
  const permLevel = staffProfile?.staff_perm_level ?? (isAdmin ? 20 : 0);

  if (permLevel < 15) throw new Error('Insufficient permission.');
  if (ADMIN_ONLY_CATEGORIES.includes(input.category) && permLevel < 20) {
    throw new Error(`Only Admins can post ${input.category} announcements.`);
  }

  const title = input.title.trim();
  const description = input.description.trim();
  if (!title || !description) throw new Error('Title and description are both required.');
  if (input.audienceType === 'users' && (!input.userIds || input.userIds.length === 0)) {
    throw new Error('Pick at least one recipient.');
  }

  const { data: notif, error } = await supabase
    .from('notifications')
    .insert({
      category: input.category,
      title,
      description,
      posted_by: user.id,
      audience_type: input.audienceType,
      audience_rank: input.audienceType === 'rank' ? input.audienceRank : null,
      audience_department: input.audienceType === 'department' ? input.audienceDepartment : null,
    })
    .select('notif_id')
    .single();

  if (error || !notif) throw new Error(error?.message ?? 'Failed to post announcement.');

  // 'everyone' / 'rank' / 'department' fan out automatically via the Postgres trigger.
  // 'users' has no rule to fan out from — we insert the picked recipients directly.
  if (input.audienceType === 'users') {
    const rows = input.userIds!.map((id) => ({ notif_id: notif.notif_id, profile_id: id }));
    const { error: recError } = await supabase.from('notification_recipients').insert(rows);
    if (recError) throw new Error(recError.message);
  }

  return { success: true };
}
