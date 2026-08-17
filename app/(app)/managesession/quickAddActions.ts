// FILE: app/(app)/managesession/quickAddActions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/getCurrentUser';
import { createClient } from '@/utils/supabase/server';

export interface QuickAddTraineeInput {
  robloxUsername: string;
  discordUsername: string;
  discordId: string;
  zone?: string;
  trainerName?: string;
  note?: string;
}

export async function quickAddTrainee(
  sessionId: number,
  trainee: QuickAddTraineeInput
): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (user.permLevel < 10) return { error: 'You do not have permission to manage sessions.' };

  const supabase = await createClient();

  const { data: session } = await supabase
    .from('session_upcoming')
    .select('num_slots')
    .eq('session_id', sessionId)
    .single();
  if (!session) return { error: 'Session not found.' };

  const { data: existing } = await supabase
    .from('session_trainees')
    .select('slot_number')
    .eq('session_id', sessionId)
    .order('slot_number', { ascending: false })
    .limit(1);

  const nextSlot = (existing?.[0]?.slot_number ?? 0) + 1;
  const isStandby = nextSlot > session.num_slots; // past capacity -> standby automatically

  const { error } = await supabase.from('session_trainees').insert({
    session_id: sessionId,
    slot_number: nextSlot,
    is_standby: isStandby,
    trainee_roblox_username: trainee.robloxUsername || null,
    trainee_discord: trainee.discordUsername || null,
    trainee_discord_id: trainee.discordId || null,
    zone: trainee.zone ? parseInt(trainee.zone, 10) : null,
    trainer_name: trainee.trainerName || null,
    note: trainee.note || null,
  });
  if (error) return { error: error.message };

  // Same known_trainees upsert pattern used elsewhere — keeps the cache fresh.
  if (trainee.discordUsername) {
    await supabase.from('known_trainees').upsert(
      {
        discord_id: trainee.discordId || null,
        discord_username: trainee.discordUsername,
        roblox_username: trainee.robloxUsername || null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: trainee.discordId ? 'discord_id' : 'discord_username' }
    );
  }

  revalidatePath('/managesession');
  return {};
}