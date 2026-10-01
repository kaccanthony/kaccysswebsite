// FILE: lib/sessionStaffTrainees.ts
// Shared between managesession/actions.ts (full session CRUD) and
// setup/actions.ts (the "confirm assignments + go live" flow) — both write
// to session_staff/session_trainees the same way, so that logic lives here
// once instead of twice. Not a 'use server' file (Next.js only allows async
// function exports from those), just plain helpers imported by both actions.

import type { SupabaseClient } from '@supabase/supabase-js';
import { isWithinSessionTraineeLimit, SESSION_TRAINEE_LIMIT_MESSAGE } from '@/lib/session/traineeLimit';
import { applyTrainerAssignments } from '@/lib/session/trainerAssignments';

export interface PrimaryRoleDefinition {
  role: string;
  field: string;
  ihField?: string;
}

// Primary staff roles: HOST / CH_1-4 / AST_1-4. CH_3 and CH_4 each get an
// optional ", IH" suffix from their checkbox.
export const PRIMARY_ROLES: PrimaryRoleDefinition[] = [
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

export interface StaffRowInput {
  session_id: number;
  role: string;
  staff_name: string;
  attended: boolean;
  notes: string | null;
}

export function isInternalHelperRole(role: string): boolean {
  return /\binternal helper\b|\bIH\b/i.test(role);
}


/**
 * Parses the primary role selects + repeated Additional Staff rows out of a
 * FormData into session_staff rows, applying the IH-merge rule (someone
 * already holding a primary role who's ALSO submitted as Additional Staff
 * with an "Internal Helper"/"IH" role gets merged into their existing row
 * as ", IH" rather than creating a duplicate). Throws on validation failure
 * — callers should catch and turn it into a fail()/redirect.
 */
export function buildStaffRowsFromForm(formData: FormData, sessionId: number): StaffRowInput[] {
  const primaryStaff = PRIMARY_ROLES.map(({ role, field, ihField }) => {
    const name = ((formData.get(field) as string) || '').trim();
    if (!name) return null;
    const ih = ihField ? formData.get(ihField) === 'on' : false;
    return { role: ih ? `${role}, IH` : role, name };
  }).filter((r): r is { role: string; name: string } => r !== null);

  const primaryNames = primaryStaff.map((s) => s.name);
  if (new Set(primaryNames).size !== primaryNames.length) {
    throw new Error("Duplicate staff entry detected — the same person can't hold two primary roles at once.");
  }
  if (!primaryStaff.some((s) => s.role.startsWith('HOST'))) {
    throw new Error('A host is required.');
  }

  const additionalNames = formData.getAll('additional_staff_name') as string[];
  const additionalRoles = formData.getAll('additional_staff_role') as string[];
  const additionalEntries: { name: string; roleName: string }[] = [];
  for (let i = 0; i < additionalNames.length; i++) {
    const name = (additionalNames[i] || '').trim();
    const roleName = (additionalRoles[i] || '').trim();
    if (name && roleName) additionalEntries.push({ name, roleName });
  }

  const staffRows: StaffRowInput[] = primaryStaff.map((s) => ({
    session_id: sessionId,
    role: s.role,
    staff_name: s.name,
    attended: false,
    notes: null,
  }));

  for (const entry of additionalEntries) {
    const isIH = isInternalHelperRole(entry.roleName);
    const matchedPrimary = isIH
      ? staffRows.find((r) =>
          !r.role.startsWith('Add T.')
          && r.staff_name.trim().toLowerCase() === entry.name.trim().toLowerCase()
        )
      : undefined;

    if (matchedPrimary) {
      if (!matchedPrimary.role.includes('IH')) matchedPrimary.role = `${matchedPrimary.role}, IH`;
    } else if (isIH && !staffRows.some((row) => row.role === 'CH_4' || row.role.startsWith('CH_4,'))) {
      // The first standalone Internal Helper occupies the legacy
      // Co-Host 4 / Supervisor slot. Further IHs remain additional rows.
      staffRows.push({
        session_id: sessionId,
        role: 'CH_4, IH',
        staff_name: entry.name,
        attended: false,
        notes: null,
      });
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

  return staffRows;
}

export interface TraineeRowInput {
  session_id: number;
  slot_number: number;
  is_standby: boolean;
  trainee_roblox_username: string | null;
  trainee_discord: string | null;
  trainee_discord_id: string | null;
  zone: number | null;
  note: string | null;
  trainer_name: string | null;
  attended: boolean;
}

export function buildTraineeRowsFromForm(
  formData: FormData,
  sessionId: number,
  numSlots: number,
  reservedSlots = 0
): TraineeRowInput[] {
  const rows: TraineeRowInput[] = [];
  const safeNumSlots = Math.max(0, Math.min(10, numSlots));
  const safeReservedSlots = Math.max(0, Math.min(10, reservedSlots));
  const totalRows = safeNumSlots + safeReservedSlots;

  for (let t = 1; t <= totalRows; t++) {
    const roblox = (formData.get(`trainee_${t}_roblox`) as string) || '';
    const discord = (formData.get(`trainee_${t}_discord`) as string) || '';
    if (!roblox && !discord) continue; // empty slot — skip rather than insert a blank row

    const zoneRaw = formData.get(`trainee_${t}_zone`) as string;
    rows.push({
      session_id: sessionId,
      slot_number: t,
      // Capacity comes only from num_slots. Every extra row is reserved.
      is_standby: t > safeNumSlots,
      trainee_roblox_username: roblox || null,
      trainee_discord: discord || null,
      trainee_discord_id: (formData.get(`trainee_${t}_discord_id`) as string) || null,
      zone: zoneRaw ? parseInt(zoneRaw, 10) : null,
      note: (formData.get(`trainee_${t}_note`) as string) || null,
      trainer_name: (formData.get(`trainee_${t}_trainer`) as string) || null,
      attended: false,
    });
  }
  return rows;
}


/** Replaces session_staff + session_trainees for a session with a fresh set built from form data. Throws on failure. */
export async function writeStaffAndTrainees(
  supabase: SupabaseClient,
  sessionId: number,
  formData: FormData,
  numSlots: number,
  reservedSlots = 0
): Promise<{ staffRows: StaffRowInput[]; traineeRows: TraineeRowInput[] }> {
  if (!Number.isSafeInteger(numSlots) || numSlots < 0 || !isWithinSessionTraineeLimit(numSlots, reservedSlots)) {
    throw new Error(SESSION_TRAINEE_LIMIT_MESSAGE);
  }
  const staffRows = buildStaffRowsFromForm(formData, sessionId);
  const traineeRows = applyTrainerAssignments(
    buildTraineeRowsFromForm(formData, sessionId, numSlots, reservedSlots),
    staffRows,
    String(formData.get('trainer_assignment_mode') ?? 'auto')
  );

  await replaceSessionChildren(supabase, sessionId, staffRows, traineeRows);

  return { staffRows, traineeRows };
}

export async function replaceSessionChildren(
  supabase: SupabaseClient,
  sessionId: number,
  staffRows: StaffRowInput[],
  traineeRows: TraineeRowInput[]
): Promise<void> {
  const { error: rpcError } = await supabase.rpc('replace_session_children', {
    p_session_id: sessionId,
    p_staff: staffRows,
    p_trainees: traineeRows,
  });
  if (!rpcError) return;
  if (rpcError.code !== 'PGRST202') throw new Error(rpcError.message);

  await supabase.from('session_staff').delete().eq('session_id', sessionId);
  if (staffRows.length > 0) {
    const { error } = await supabase.from('session_staff').insert(staffRows);
    if (error) throw new Error(error.message);
  }

  await supabase.from('session_trainees').delete().eq('session_id', sessionId);
  if (traineeRows.length > 0) {
    const { error } = await supabase.from('session_trainees').insert(traineeRows);
    if (error) throw new Error(error.message);
  }
}

/**
 * Upserts one trainee into the known_trainees cache — matched by discord_id
 * when we have it, otherwise by discord_username (case-insensitive).
 */
export async function upsertKnownTrainee(
  supabase: SupabaseClient,
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
        discord_id: entry.discordId ?? undefined,
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

/** One network request for a form's trainees. Falls back during SQL rollout. */
export async function upsertKnownTrainees(
  supabase: SupabaseClient,
  entries: { discordId: string | null; discordUsername: string; robloxUsername: string | null }[]
): Promise<void> {
  if (entries.length === 0) return;
  const { error } = await supabase.rpc('upsert_known_trainees_batch', { p_entries: entries });
  if (error?.code === 'PGRST202') {
    for (const entry of entries) await upsertKnownTrainee(supabase, entry);
  }
  // Individual cache-write errors were previously ignored by the callers.
}
