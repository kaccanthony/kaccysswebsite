// FILE: app/(app)/managesession/actions.ts
'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/getCurrentUser';
import { createClient } from '@/utils/supabase/server';

function fail(message: string): never {
  redirect(`/managesession?error=${encodeURIComponent(message)}`);
}

/**
 * Upserts one trainee into the known_trainees cache — matched by discord_id
 * when we have it (stable, preferred), otherwise by discord_username
 * (case-insensitive). Updates the existing row instead of inserting a
 * duplicate if a match is found.
 */
async function upsertKnownTrainee(
  supabase: Awaited<ReturnType<typeof createClient>>,
  entry: { discordId: string | null; discordUsername: string; robloxUsername: string | null }
) {
  if (!entry.discordUsername && !entry.discordId) return;

  const existingQuery = supabase.from('known_trainees').select('row_id').limit(1);
  const { data: existing } = entry.discordId
    ? await existingQuery.eq('discord_id', entry.discordId).maybeSingle()
    : await existingQuery.ilike('discord_username', entry.discordUsername).maybeSingle();

  if (existing) {
    await supabase
      .from('known_trainees')
      .update({
        discord_username: entry.discordUsername,
        roblox_username: entry.robloxUsername,
        discord_id: entry.discordId ?? undefined, // fill in if we now know it and didn't before
        last_seen_at: new Date().toISOString(),
      })
      .eq('row_id', existing.row_id);
  } else {
    await supabase.from('known_trainees').insert({
      discord_id: entry.discordId,
      discord_username: entry.discordUsername,
      roblox_username: entry.robloxUsername,
      last_seen_at: new Date().toISOString(),
    });
  }
}

export async function deleteSession(formData: FormData) {
  const user = await getCurrentUser();
  if (user.permLevel < 15) fail('You do not have permission to delete sessions.');

  const sessionId = parseInt(formData.get('session_id') as string, 10);
  const supabase = await createClient();

  // session_staff / session_trainees have no FK-cascade guarantee shown in the
  // schema, so clean them up explicitly before removing the session itself.
  await Promise.all([
    supabase.from('session_staff').delete().eq('session_id', sessionId),
    supabase.from('session_trainees').delete().eq('session_id', sessionId),
  ]);
  await supabase.from('session_upcoming').delete().eq('session_id', sessionId);

  revalidatePath('/managesession');
  redirect('/managesession?success=' + encodeURIComponent('Session deleted.'));
}

// ── Primary staff roles, per your new convention: HOST / CH_1-4 / AST_1-4.
// CH_3 and CH_4 each get an optional ", IH" suffix from their checkbox. ──
type PrimaryRoleDefinition = {
  role: string;
  field: string;
  ihField?: string;
};

const PRIMARY_ROLES: PrimaryRoleDefinition[] = [
  { role: 'HOST', field: 'host' },
  { role: 'CH_1', field: 'co_host1' },
  { role: 'CH_2', field: 'co_host2' },
  { role: 'CH_3', field: 'co_host3', ihField: 'co_host3_ih' },
  { role: 'CH_4', field: 'co_host4_supervisor', ihField: 'co_host4_ih' },
  { role: 'AST_1', field: 'assistant_1' },
  { role: 'AST_2', field: 'assistant_2' },
  { role: 'AST_3', field: 'assistant_3' },
  { role: 'AST_4', field: 'assistant_4' },
];

export async function saveSession(formData: FormData) {
  const user = await getCurrentUser();
  if (user.permLevel < 10) fail('You do not have permission to manage sessions.');

  const action = formData.get('action') as string; // 'add' | 'edit'
  const numSlots = parseInt((formData.get('num_slots') as string) || '0', 10);

  // ── Primary roles ──
  const primaryStaff = PRIMARY_ROLES.map(({ role, field, ihField }) => {
    const name = ((formData.get(field) as string) || '').trim();
    if (!name) return null;
    const ih = ihField ? formData.get(ihField) === 'on' : false;
    return { role: ih ? `${role}, IH` : role, name };
  }).filter((r): r is { role: string; name: string } => r !== null);

  // Only checked among primary slots now — the same person CAN also show up
  // in the Additional Staff / IH list (that's the point of the IH-merge below).
  const primaryNames = primaryStaff.map((s) => s.name);
  if (new Set(primaryNames).size !== primaryNames.length) {
    fail("Duplicate staff entry detected — the same person can't hold two primary roles at once.");
  }

  if (!primaryStaff.some((s) => s.role.startsWith('HOST'))) {
    fail('A host is required.');
  }

  // ── Additional staff: repeated name+role pairs. The client should submit
  // these as `additional_staff_name` / `additional_staff_role` (one of each
  // per row, same index order) rather than the old single free-text field. ──
  const additionalNames = formData.getAll('additional_staff_name') as string[];
  const additionalRoles = formData.getAll('additional_staff_role') as string[];
  const additionalEntries: { name: string; roleName: string }[] = [];
  for (let i = 0; i < additionalNames.length; i++) {
    const name = (additionalNames[i] || '').trim();
    const roleName = (additionalRoles[i] || '').trim();
    if (name && roleName) additionalEntries.push({ name, roleName });
  }

  const sessionDate = formData.get('session_date') as string;
  if (!sessionDate) fail('Invalid or missing session date.');

  const sessionTime = formData.get('session_time') as string;
  if (!/^\d{2}:\d{2}$/.test(sessionTime)) fail('Invalid or missing session time.');

  const supabase = await createClient();

  // ── session_upcoming holds ONLY its own real columns now — no staff or
  // trainee data lives here anymore. ──
  const sessionRow = {
    session_status: (formData.get('session_status') as string) || 'Requested',
    session_booked: formData.get('session_booked') === 'on',
    session_name: (formData.get('session_name') as string) || null,
    session_desc: (formData.get('session_desc') as string) || null,
    session_duration: (formData.get('session_duration') as string) || '',
    num_slots: numSlots,
    trainer_assignment_mode: (formData.get('trainer_assignment_mode') as string) || 'auto',
    session_date: sessionDate,
    session_time: sessionTime,
    additional_notes: (formData.get('additional_notes') as string) || null,
    trainee_timer: parseInt((formData.get('trainee_timer') as string) || '10', 10)
  };

  let sessionId: number;

  if (action === 'add') {
    const customIdRaw = formData.get('custom_session_id') as string;
    const customId = customIdRaw ? parseInt(customIdRaw, 10) : null;

    if (customId) {
      const [{ count: c1 }, { count: c2 }] = await Promise.all([
        supabase.from('session_upcoming').select('session_id', { count: 'exact', head: true }).eq('session_id', customId),
        supabase.from('session_ongoing').select('session_id', { count: 'exact', head: true }).eq('session_id', customId),
      ]);
      if ((c1 ?? 0) + (c2 ?? 0) > 0) {
        fail(`Session ID #${customId} is already in use — pick a different one or leave it blank to auto-assign.`);
      }
    }

    const insertPayload = customId ? { session_id: customId, ...sessionRow } : sessionRow;
    const { data: inserted, error } = await supabase.from('session_upcoming').insert(insertPayload).select('session_id').single();
    if (error || !inserted) fail(error?.message ?? 'Could not create session.');
    sessionId = inserted.session_id;

    if (customId) {
      // Keep the auto-increment sequence ahead of any manually-chosen ID.
      await supabase.rpc('bump_session_id_sequence', { new_max: customId });
    }
  } else {
    sessionId = parseInt(formData.get('session_id') as string, 10);
    if (!sessionId) fail('Missing session ID.');

    const { error } = await supabase.from('session_upcoming').update(sessionRow).eq('session_id', sessionId);
    if (error) fail(error.message);
  }

  // ── Replace session_staff for this session entirely (simplest correct way
  // to sync a form save against a child table with no natural per-row key
  // coming from the client). ──
  await supabase.from('session_staff').delete().eq('session_id', sessionId);

  const staffRows = primaryStaff.map((s) => ({
    session_id: sessionId,
    role: s.role,
    staff_name: s.name,
    attended: false,
    notes: null as string | null,
  }));

  for (const entry of additionalEntries) {
    const isIH = /internal helper|^ih$/i.test(entry.roleName);
    const matchedPrimary = isIH
      ? staffRows.find((r) => r.staff_name.trim().toLowerCase() === entry.name.trim().toLowerCase())
      : undefined;

    if (matchedPrimary) {
      // Someone already holding a primary role is ALSO doing IH duty —
      // merge into their existing row instead of creating a separate one.
      // e.g. a HOST row's role becomes "HOST, IH".
      if (!matchedPrimary.role.includes('IH')) {
        matchedPrimary.role = `${matchedPrimary.role}, IH`;
      }
    } else {
      staffRows.push({
        session_id: sessionId,
        role: `Add T. ${entry.roleName}`,
        staff_name: entry.name,
        attended: false,
        notes: null,
      });
    }
  }

  if (staffRows.length > 0) {
    const { error: staffError } = await supabase.from('session_staff').insert(staffRows);
    if (staffError) fail(staffError.message);
  }

  // ── Replace session_trainees for this session entirely ──
  await supabase.from('session_trainees').delete().eq('session_id', sessionId);

  const traineeRows: Record<string, unknown>[] = [];
  for (let t = 1; t <= numSlots; t++) {
    const roblox = (formData.get(`trainee_${t}_roblox`) as string) || '';
    const discord = (formData.get(`trainee_${t}_discord`) as string) || '';
    if (!roblox && !discord) continue; // empty slot — skip rather than insert a blank row

    const zoneRaw = formData.get(`trainee_${t}_zone`) as string;
    traineeRows.push({
      session_id: sessionId,
      slot_number: t,
      is_standby: formData.get(`trainee_${t}_standby`) === 'on',
      trainee_roblox_username: roblox || null,
      trainee_discord: discord || null,
      trainee_discord_id: (formData.get(`trainee_${t}_discord_id`) as string) || null,
      zone: zoneRaw ? parseInt(zoneRaw, 10) : null,
      note: (formData.get(`trainee_${t}_note`) as string) || null,
      trainer_name: (formData.get(`trainee_${t}_trainer`) as string) || null,
      attended: false,
    });
  }

  if (traineeRows.length > 0) {
    const { error: traineeError } = await supabase.from('session_trainees').insert(traineeRows);
    if (traineeError) fail(traineeError.message);

    // Cache/update each filled trainee slot in known_trainees for future
    // autocomplete — matched by discord_id (or username if no id given), so
    // someone appearing in multiple sessions gets ONE row that stays fresh,
    // not a pile of stale duplicates.
    for (const r of traineeRows) {
      await upsertKnownTrainee(supabase, {
        discordId: r.trainee_discord_id ? String(r.trainee_discord_id) : null,
        discordUsername: (r.trainee_discord as string) ?? '',
        robloxUsername: (r.trainee_roblox_username as string) ?? null,
      });
    }
  }

  const msg =
    action === 'add'
      ? user.rawRole === 'Head Staff' && user.permLevel < 20
        ? 'Session request submitted — a manager will review it.'
        : 'Session added.'
      : sessionRow.session_status === 'Booked'
        ? 'Session booked!'
        : 'Session saved.';

  revalidatePath('/managesession');
  redirect('/managesession?success=' + encodeURIComponent(msg));
}