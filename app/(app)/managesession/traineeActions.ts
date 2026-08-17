// FILE: app/(app)/managesession/traineeActions.ts
'use server';

import { getCurrentUser } from '@/lib/getCurrentUser';
import { createClient } from '@/utils/supabase/server';
import { RANK_PREFIX_MAP } from './parseTraineePaste';

const UNAVAILABLE_MSG = "Couldn't verify staff records right now — please try again in a moment.";

/**
 * Checks a parsed Host field's rank prefix (e.g. "OM" from "@[OM] Yoshi5336")
 * against that person's real staff_rank — checks staff_profiles first (real,
 * logged-in staff), then staff_roster (pre-registered, not yet claimed).
 * Returns null when there's nothing to check (no prefix in the paste) or the
 * prefix matches; otherwise a user-facing error string. Distinguishes an actual
 * "not found" from a Supabase/network error on the lookup itself — the latter
 * should never be reported to the user as "this person isn't staff".
 */
export async function validateHostRank(hostName: string, prefix: string | null): Promise<string | null> {
  if (!prefix) return null;
  if (!hostName) return null; // required-field check already caught a missing host

  await getCurrentUser();
  const supabase = await createClient();

  let rank: string | null = null;

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('id')
    .ilike('discord_username', hostName)
    .maybeSingle();
  if (profileErr) return UNAVAILABLE_MSG;

  if (profile) {
    const { data: staffProfile, error: staffErr } = await supabase
      .from('staff_profiles')
      .select('staff_rank')
      .eq('id', profile.id)
      .maybeSingle();
    if (staffErr) return UNAVAILABLE_MSG;
    rank = staffProfile?.staff_rank ?? null;
  }

  if (!rank) {
    const { data: rosterRow, error: rosterErr } = await supabase
      .from('staff_roster')
      .select('staff_rank')
      .ilike('discord_username', hostName)
      .eq('claimed', false)
      .maybeSingle();
    if (rosterErr) return UNAVAILABLE_MSG;
    rank = rosterRow?.staff_rank ?? null;
  }

  if (!rank) {
    return `Couldn't find "${hostName}" on staff to verify the [${prefix}] prefix — check the name is spelled correctly.`;
  }

  const expectedRanks = RANK_PREFIX_MAP[prefix];
  if (!expectedRanks.includes(rank)) {
    return `Rank mismatch — [${prefix}] implies ${expectedRanks.join(' or ')}, but "${hostName}" is ranked ${rank}.`;
  }

  return null;
}

export interface HostIdResolution {
  name: string | null;
  error: string | null;
}

/**
 * Resolves a raw <@discordId> mention (see parseHostField) back to a real
 * staff display name — checks profiles (real, logged-in) first, then
 * staff_roster by discord_id (pre-registered, not yet claimed). The ID itself
 * is authoritative, so unlike validateHostRank there's no separate prefix to
 * cross-check — this just needs to find *someone* on staff with that ID.
 */
export async function resolveHostByDiscordId(discordId: string): Promise<HostIdResolution> {
  await getCurrentUser();
  const supabase = await createClient();

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('discord_username')
    .eq('discord_id', discordId)
    .maybeSingle();
  if (profileErr) return { name: null, error: UNAVAILABLE_MSG };
  if (profile?.discord_username) return { name: profile.discord_username, error: null };

  const { data: rosterRow, error: rosterErr } = await supabase
    .from('staff_roster')
    .select('discord_username')
    .eq('discord_id', discordId)
    .eq('claimed', false)
    .maybeSingle();
  if (rosterErr) return { name: null, error: UNAVAILABLE_MSG };
  if (rosterRow?.discord_username) return { name: rosterRow.discord_username, error: null };

  return { name: null, error: `Couldn't find a staff member matching that Discord mention (ID ${discordId}).` };
}

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

export interface SessionMatch {
  sessionId: number;
  sessionName: string | null;
  host: string;
  date: string;
  time: string;
}

/**
 * Finds a session by host name + date, for the global Quick Fill flow —
 * so a paste block (which already carries Host + Date/Time) can locate
 * the right session automatically, no manual list-searching needed.
 * Loose on time (host+date can be enough to disambiguate in practice);
 * returns every match so the caller can ask the user to pick if there's
 * more than one.
 */
export async function findSessionsByHostAndDate(host: string, dateISO: string): Promise<SessionMatch[]> {
  await getCurrentUser();

  const supabase = await createClient();
  const { data: staffRows } = await supabase
    .from('session_staff')
    .select('session_id')
    .eq('role', 'HOST')
    .ilike('staff_name', host);

  const sessionIds = (staffRows ?? []).map((r) => r.session_id);
  if (sessionIds.length === 0) return [];

  const { data: sessions } = await supabase
    .from('session_upcoming')
    .select('session_id, session_name, session_date, session_time')
    .in('session_id', sessionIds)
    .eq('session_date', dateISO);

  return (sessions ?? []).map((s) => ({
    sessionId: s.session_id,
    sessionName: s.session_name,
    host,
    date: s.session_date,
    time: s.session_time,
  }));
}