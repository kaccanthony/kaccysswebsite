// FILE: lib/notifications.ts
import { createClient } from '@/utils/supabase/server';

export interface NotificationRow {
  notif_id: number;
  category: string;
  title: string;
  description: string;
  posted_by: string | null;
  posted_by_name: string | null;
  posted_by_avatar: string | null;
  posted_at: string;
  is_read: boolean;
}

/** Every notification visible to this user (via get_notifications_for), with read state merged in. */
export async function getNotificationsForCurrentUser(userId: string): Promise<NotificationRow[]> {
  const supabase = await createClient();

  const { data: notifs, error } = await supabase.rpc('get_notifications_for', { p_profile_id: userId });
  if (error) throw error;
  if (!notifs || notifs.length === 0) return [];

  const notifIds = notifs.map((n: { notif_id: number }) => n.notif_id);
  const posterIds = Array.from(new Set(notifs.map((n: { posted_by: string | null }) => n.posted_by).filter((v: string | null): v is string => !!v)));

  const [{ data: reads }, { data: posters }] = await Promise.all([
    supabase.from('notification_reads').select('notif_id').eq('profile_id', userId).in('notif_id', notifIds),
    posterIds.length > 0
      ? supabase.from('profiles').select('id, discord_username, discord_avatar_url').in('id', posterIds)
      : Promise.resolve({ data: [] as { id: string; discord_username: string; discord_avatar_url: string | null }[] }),
  ]);

  const readSet = new Set((reads ?? []).map((r) => r.notif_id));
  const posterInfo = new Map((posters ?? []).map((p) => [p.id, p]));

  return notifs
    .map((n: Record<string, any>) => {
      const poster = n.posted_by ? posterInfo.get(n.posted_by) : undefined;
      return {
        notif_id: n.notif_id,
        category: n.category,
        title: n.title,
        description: n.description,
        posted_by: n.posted_by,
        posted_by_name: poster?.discord_username ?? null,
        posted_by_avatar: poster?.discord_avatar_url ?? null,
        posted_at: n.posted_at,
        is_read: readSet.has(n.notif_id),
      };
    })
    .sort((a: NotificationRow, b: NotificationRow) => new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime());
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_unread_notification_count', { p_profile_id: userId });
  if (error) return 0;
  return data ?? 0;
}