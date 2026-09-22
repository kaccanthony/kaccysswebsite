'use server';
// FILE: app/settings/actions.ts
// Mirrors the save_profile_* / save_notifs branches of settings.php's POST handler.

import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import {
  NOTIF_DEFAULTS,
  STAFF_KEYS,
  USER_KEYS,
  CHECKBOX_KEYS,
  mergePrefs,
} from '@/lib/settings';

async function requireUserId(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return user.id;
}

export async function saveProfile(formData: FormData) {
  const supabase = await createClient();
  const userId = await requireUserId(supabase);

  const displayName = String(formData.get('display_name') ?? '').trim();
  const discordUsername = String(formData.get('discord_username') ?? '').trim();
  const robloxName = String(formData.get('roblox_name') ?? '').trim();
  const hideStats = formData.get('hide_stats') === 'on';

  // DISPLAY NAME WORKAROUND — see lib/settings.ts. Merge into existing
  // notif_prefs rather than clobbering the rest of the jsonb blob.
  const { data: existing } = await supabase
    .from('profiles')
    .select('notif_prefs')
    .eq('id', userId)
    .single();

  const nextPrefs = { ...((existing?.notif_prefs as Record<string, string>) ?? {}), display_name: displayName };

  await supabase
    .from('profiles')
    .update({
      discord_username: discordUsername,
      roblox_username: robloxName,
      hide_stats: hideStats,
      notif_prefs: nextPrefs,
    })
    .eq('id', userId);

  redirect('/settings?saved=profile');
}

export async function saveNotifications(formData: FormData) {
  const supabase = await createClient();
  const userId = await requireUserId(supabase);

  const scope = String(formData.get('scope') ?? '');
  // Same guard as PHP: only ever touch the prefix belonging to the
  // submitted form, so saving one tab never wipes the other tab's prefs.
  const allowedKeys = scope === 'staff' ? STAFF_KEYS : scope === 'user' ? USER_KEYS : [...STAFF_KEYS, ...USER_KEYS];

  const { data: existing } = await supabase
    .from('profiles')
    .select('notif_prefs')
    .eq('id', userId)
    .single();

  const currentPrefs = mergePrefs(existing?.notif_prefs as Record<string, string>);
  const nextPrefs = { ...currentPrefs };

  for (const key of allowedKeys) {
    if (CHECKBOX_KEYS.has(key)) {
      nextPrefs[key] = formData.get(key) === 'on' ? '1' : '0';
    } else {
      nextPrefs[key] = String(formData.get(key) ?? NOTIF_DEFAULTS[key] ?? '');
    }
  }

  await supabase.from('profiles').update({ notif_prefs: nextPrefs }).eq('id', userId);

  redirect('/settings?saved=notifs');
}
