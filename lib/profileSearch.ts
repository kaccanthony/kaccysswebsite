// FILE: lib/profileSearch.ts
'use server';

import { createClient } from '@/utils/supabase/server';

export interface ProfileSuggestion {
  id: string;
  discordUsername: string;
  discordId: string | null;
  robloxUsername: string | null;
  avatarUrl: string | null;
}

/**
 * Searches profiles only — for the "who is this Internal Helper training"
 * picker, where the trainee is being assessed as staff and should be a real
 * signed-in account, not the known_trainees cache.
 */
export async function searchProfiles(query: string): Promise<ProfileSuggestion[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, discord_id, discord_username, discord_avatar_url, roblox_username')
    .or(`discord_username.ilike.%${q}%,roblox_username.ilike.%${q}%`)
    .limit(8);

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    discordUsername: row.discord_username,
    discordId: row.discord_id,
    robloxUsername: row.roblox_username,
    avatarUrl: row.discord_avatar_url,
  }));
}

export interface TraineeSuggestion {
  source: 'profile' | 'known'; // 'profile' = has actually signed into the site; 'known' = only ever seen in a past session
  discordId: string | null;
  discordUsername: string;
  robloxUsername: string | null;
  avatarUrl: string | null;
}

/**
 * Trainee autocomplete: checks `profiles` first (people who've actually signed
 * in), then `known_trainees` (people only ever seen typed into a past session's
 * roster — no account required). Deliberately allowed to return the same
 * person from both sources; not de-duped against each other.
 */
export async function searchTraineeCandidates(query: string): Promise<TraineeSuggestion[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const supabase = await createClient();

  const [{ data: profileRows }, { data: knownRows }] = await Promise.all([
    supabase
      .from('profiles')
      .select('discord_id, discord_username, discord_avatar_url, roblox_username')
      .or(`discord_username.ilike.%${q}%,roblox_username.ilike.%${q}%`)
      .limit(8),
    supabase
      .from('known_trainees')
      .select('discord_id, discord_username, roblox_username')
      .or(`discord_username.ilike.%${q}%,roblox_username.ilike.%${q}%`)
      .order('last_seen_at', { ascending: false })
      .limit(8), // now safe to trust the limit directly — known_trainees is deduped at write time
  ]);

  const results: TraineeSuggestion[] = (profileRows ?? []).map((row) => ({
    source: 'profile' as const,
    discordId: row.discord_id,
    discordUsername: row.discord_username,
    robloxUsername: row.roblox_username,
    avatarUrl: row.discord_avatar_url,
  }));

  for (const row of knownRows ?? []) {
    results.push({
      source: 'known',
      discordId: row.discord_id,
      discordUsername: row.discord_username,
      robloxUsername: row.roblox_username,
      avatarUrl: null,
    });
  }

  return results;
}