import { createClient } from '@/utils/supabase/server';
import { canAccessFeedbackTrainer } from '@/lib/feedbackTrainerPermissions';

export interface FeedbackTrainerAccess {
  userId: string;
  isAdmin: boolean;
  discordId: string | null;
  discordName: string | null;
}

/** Use real account flags; View As is a display tool, not authorization. */
export async function getFeedbackTrainerAccess(): Promise<FeedbackTrainerAccess | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const [{ data: staff }, { data: admin }, { data: profile }] = await Promise.all([
    supabase.from('staff_profiles').select('op_dept, cohost_auth').eq('id', user.id).maybeSingle(),
    supabase.from('site_admins').select('id').eq('id', user.id).maybeSingle(),
    supabase.from('profiles').select('discord_id, discord_username').eq('id', user.id).maybeSingle(),
  ]);
  if (!canAccessFeedbackTrainer(staff, !!admin)) return null;
  return {
    userId: user.id, isAdmin: !!admin,
    discordId: profile?.discord_id ? String(profile.discord_id) : null,
    discordName: profile?.discord_username || null,
  };
}
