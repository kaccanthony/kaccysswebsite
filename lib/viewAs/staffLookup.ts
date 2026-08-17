// FILE: lib/viewAs/staffLookup.ts
'use server';
import { createClient } from '@/utils/supabase/server';

export interface StaffLookupResult {
  source: 'roster' | 'claimed';
  discordId: string;
  discordUsername: string;
  staffRank: string;
  permLevel: number;
  auths: {
    op_dept: boolean; host_auth: boolean; cohost_auth: boolean; asst_auth: boolean;
    comm_dept: boolean; eventh_auth: boolean; eventch_auth: boolean; ih_auth: boolean;
  };
}

// Search BOTH staff_roster (not-yet-logged-in staff) and staff_profiles+profiles (already
// claimed) by a partial username/discord-id match, so "look them up" works no matter which
// side of onboarding they're on.
export async function searchStaffForViewAs(query: string): Promise<StaffLookupResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized.');
  const { data: adminRow } = await supabase.from('site_admins').select('id').eq('id', user.id).maybeSingle();
  if (!adminRow) throw new Error('Only admins can use View As.');

  const AUTH_COLS = 'op_dept, host_auth, cohost_auth, asst_auth, comm_dept, eventh_auth, eventch_auth, ih_auth';

  const [{ data: roster }, { data: claimed }] = await Promise.all([
    supabase
      .from('staff_roster')
      .select(`discord_id, discord_username, staff_rank, staff_perm_level, claimed, ${AUTH_COLS}`)
      .ilike('discord_username', `%${q}%`)
      .limit(8),
    supabase
      .from('staff_profiles')
      .select(`id, staff_rank, staff_perm_level, ${AUTH_COLS}, profiles!inner(discord_id, discord_username)`)
      .ilike('profiles.discord_username', `%${q}%`)
      .limit(8),
  ]);

  const results: StaffLookupResult[] = [];

  for (const r of roster ?? []) {
    if (r.claimed) continue; // already-claimed rows are covered by the `claimed` query below with fresher data
    results.push({
      source: 'roster',
      discordId: r.discord_id,
      discordUsername: r.discord_username,
      staffRank: r.staff_rank,
      permLevel: r.staff_perm_level,
      auths: {
        op_dept: r.op_dept, host_auth: r.host_auth, cohost_auth: r.cohost_auth, asst_auth: r.asst_auth,
        comm_dept: r.comm_dept, eventh_auth: r.eventh_auth, eventch_auth: r.eventch_auth, ih_auth: r.ih_auth,
      },
    });
  }

  for (const c of (claimed ?? []) as any[]) {
    results.push({
      source: 'claimed',
      discordId: c.profiles?.discord_id ?? c.id,
      discordUsername: c.profiles?.discord_username ?? 'Unknown',
      staffRank: c.staff_rank,
      permLevel: c.staff_perm_level,
      auths: {
        op_dept: c.op_dept, host_auth: c.host_auth, cohost_auth: c.cohost_auth, asst_auth: c.asst_auth,
        comm_dept: c.comm_dept, eventh_auth: c.eventh_auth, eventch_auth: c.eventch_auth, ih_auth: c.ih_auth,
      },
    });
  }

  return results.slice(0, 10);
}