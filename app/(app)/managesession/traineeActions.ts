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

/**
 * Live-search known_trainees by partial discord or roblox username —
 * used by the inline search quick-fill in each trainee slot, so staff
 * can find someone by typing part of their name instead of needing the
 * full paste-block format.
 */
export async function searchKnownTrainees(query: string): Promise<KnownTraineeMatch[]> {
  await getCurrentUser();

  const trimmed = query.trim();
  if (trimmed.length < 2) return []; // avoid a flood of matches on 1 character

  const supabase = await createClient();
  const { data } = await supabase
    .from('known_trainees')
    .select('discord_id, discord_username, roblox_username')
    .or(`discord_username.ilike.%${trimmed}%,roblox_username.ilike.%${trimmed}%`)
    .order('last_seen_at', { ascending: false })
    .limit(8);

  return (data ?? []).map((d) => ({
    discordId: d.discord_id,
    discordUsername: d.discord_username,
    robloxUsername: d.roblox_username,
  }));
}