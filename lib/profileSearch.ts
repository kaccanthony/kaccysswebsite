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

const PROFILE_SELECT = 'id, discord_id, discord_username, discord_avatar_url, roblox_username';
const TRAINEE_PROFILE_SELECT = 'discord_id, discord_username, discord_avatar_url, roblox_username';
const KNOWN_TRAINEE_SELECT = 'discord_id, discord_username, roblox_username';

function uniqueRows<T extends { discord_id: string | null; discord_username: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = row.discord_id || row.discord_username.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Search signed-in profiles for the Internal Helper trainee picker. */
export async function searchProfiles(query: string): Promise<ProfileSuggestion[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const supabase = await createClient();
  const pattern = `%${q}%`;
  // Keep values in structured filter arguments; never interpolate user text
  // into an .or(...) expression string.
  const [discordResult, robloxResult] = await Promise.all([
    supabase.from('profiles').select(PROFILE_SELECT).ilike('discord_username', pattern).limit(8),
    supabase.from('profiles').select(PROFILE_SELECT).ilike('roblox_username', pattern).limit(8),
  ]);
  if (discordResult.error || robloxResult.error) return [];

  return uniqueRows([...(discordResult.data ?? []), ...(robloxResult.data ?? [])])
    .slice(0, 8)
    .map((row) => ({
      id: row.id,
      discordUsername: row.discord_username,
      discordId: row.discord_id,
      robloxUsername: row.roblox_username,
      avatarUrl: row.discord_avatar_url,
    }));
}

export interface TraineeSuggestion {
  source: 'profile' | 'known';
  discordId: string | null;
  discordUsername: string;
  robloxUsername: string | null;
  avatarUrl: string | null;
}

/** Trainee autocomplete across profiles and the known-trainee cache. */
export async function searchTraineeCandidates(query: string): Promise<TraineeSuggestion[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const supabase = await createClient();
  const pattern = `%${q}%`;
  const [profilesByDiscord, profilesByRoblox, knownByDiscord, knownByRoblox] = await Promise.all([
    supabase.from('profiles').select(TRAINEE_PROFILE_SELECT).ilike('discord_username', pattern).limit(8),
    supabase.from('profiles').select(TRAINEE_PROFILE_SELECT).ilike('roblox_username', pattern).limit(8),
    supabase.from('known_trainees').select(KNOWN_TRAINEE_SELECT).ilike('discord_username', pattern).order('last_seen_at', { ascending: false }).limit(8),
    supabase.from('known_trainees').select(KNOWN_TRAINEE_SELECT).ilike('roblox_username', pattern).order('last_seen_at', { ascending: false }).limit(8),
  ]);

  const profileRows = uniqueRows([...(profilesByDiscord.data ?? []), ...(profilesByRoblox.data ?? [])]).slice(0, 8);
  const knownRows = uniqueRows([...(knownByDiscord.data ?? []), ...(knownByRoblox.data ?? [])]).slice(0, 8);
  const results: TraineeSuggestion[] = profileRows.map((row) => ({
    source: 'profile',
    discordId: row.discord_id,
    discordUsername: row.discord_username,
    robloxUsername: row.roblox_username,
    avatarUrl: row.discord_avatar_url,
  }));

  for (const row of knownRows) {
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
