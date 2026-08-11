// FILE: app/(app)/managesession/traineeActions.ts
'use server';

import { getCurrentUser } from '@/lib/getCurrentUser';
import { createClient } from '@/utils/supabase/server';

export interface KnownTraineeMatch {
  discordId: string | null;
  discordUsername: string;
  robloxUsername: string | null;
}

export async function lookupKnownTrainee(
  discordId: string,
  discordUsername: string
): Promise<KnownTraineeMatch | null> {
  await getCurrentUser(); // must be signed in — redirects to /login otherwise

  const supabase = await createClient();

  if (discordId) {
    const { data } = await supabase
      .from('known_trainees')
      .select('discord_id, discord_username, roblox_username')
      .eq('discord_id', discordId)
      .maybeSingle();
    if (data) return { discordId: data.discord_id, discordUsername: data.discord_username, robloxUsername: data.roblox_username };
  }

  if (discordUsername) {
    const { data } = await supabase
      .from('known_trainees')
      .select('discord_id, discord_username, roblox_username')
      .ilike('discord_username', discordUsername)
      .maybeSingle();
    if (data) return { discordId: data.discord_id, discordUsername: data.discord_username, robloxUsername: data.roblox_username };
  }

  return null;
}