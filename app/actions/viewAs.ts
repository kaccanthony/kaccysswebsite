'use server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import {
  encodeViewAsCookie, decodeViewAsCookie, VIEW_AS_COOKIE_NAME, VIEW_AS_MAX_AGE_SECONDS, type ViewAsPayload,
} from '@/lib/viewAs/cookie';
import { RANK_SIMULATED_PERM_LEVEL, VIEWABLE_RANKS, type ViewAsAuthFlags } from '@/lib/viewAs/rankMap';

export interface StartViewAsInput {
  mode: 'rank' | 'person';
  rank: string;
  /** Required for 'person' mode (the looked-up row's real staff_perm_level). Ignored for 'rank' mode. */
  permLevel?: number;
  auths: ViewAsAuthFlags;
  personDiscordId?: string;
  personLabel?: string;
}

export async function startViewAs(input: StartViewAsInput, reason: string) {
  if (!reason.trim()) throw new Error('A reason is required.');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized.');

  const { data: adminRow } = await supabase.from('site_admins').select('id').eq('id', user.id).maybeSingle();
  if (!adminRow) throw new Error('Only admins can use View As.');

  let permLevel: number;
  if (input.mode === 'rank') {
    if (!VIEWABLE_RANKS.includes(input.rank)) throw new Error('Unknown rank.');
    permLevel = RANK_SIMULATED_PERM_LEVEL[input.rank] ?? 0;
  } else {
    if (!input.personDiscordId || !input.personLabel) throw new Error('No staff member selected.');
    if (input.permLevel === undefined) throw new Error('Missing perm level for selected staff member.');
    permLevel = input.permLevel;
  }

  const viewedRankLog = input.mode === 'person' ? `${input.rank} (as ${input.personLabel})` : input.rank;

  const { data: log, error } = await supabase
    .from('admin_view_as_logs')
    .insert({ admin_id: user.id, viewed_rank: viewedRankLog, reason: reason.trim() })
    .select('log_id')
    .single();
  if (error || !log) throw new Error(error?.message ?? 'Could not start view-as session.');

  const payload: ViewAsPayload = {
    adminId: user.id,
    mode: input.mode,
    rank: input.rank,
    permLevel,
    auths: input.auths,
    personLabel: input.mode === 'person' ? input.personLabel : undefined,
    logId: log.log_id,
    exp: Math.floor(Date.now() / 1000) + VIEW_AS_MAX_AGE_SECONDS,
  };

  const cookieStore = await cookies();
  cookieStore.set({
    name: VIEW_AS_COOKIE_NAME,
    value: encodeViewAsCookie(payload),
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: VIEW_AS_MAX_AGE_SECONDS,
    path: '/',
  });
}

export async function stopViewAs() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const cookieStore = await cookies();
  const raw = cookieStore.get(VIEW_AS_COOKIE_NAME)?.value;
  const payload = decodeViewAsCookie(raw, user.id);

  if (payload) {
    await supabase
      .from('admin_view_as_logs')
      .update({ ended_at: new Date().toISOString() })
      .eq('log_id', payload.logId)
      .eq('admin_id', user.id);
  }

  cookieStore.delete(VIEW_AS_COOKIE_NAME);
}
