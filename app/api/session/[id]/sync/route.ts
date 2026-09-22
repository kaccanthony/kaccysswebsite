// app/api/session/[id]/sync/route.ts
// Synchronizes the live controller with the normalized schema in
// database/current_db.sql. Core fields/live_state belong to session_ongoing;
// staff, trainees, and drivers are durably written to their child tables.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import type { DriverRow, LiveState, StaffShiftRow } from '@/types/session';

const ONGOING_COLUMNS = new Set([
  'session_status', 'additional_notes', 'session_date', 'session_time', 'trainee_timer',
]);

const TRAINEE_COLUMN_MAP: Record<string, string> = {
  name: 'trainee_roblox_username',
  discord: 'trainee_discord',
  discord_id: 'trainee_discord_id',
  zone: 'zone',
  note: 'note',
  trainer_name: 'trainer_name',
  attended: 'attended',
};

const LIVE_STATE_FIELDS = new Set<keyof LiveState>([
  'sessionHost', 'trainees', 'timers', 'drivers', 'staffShift', 'feedbackData',
  'completedRows', 'slotOrder', 'unallocatedTrainees', 'timeTracker',
  'mainAstNotes', 'overrides', 'announcement',
]);

const KEYED_MERGE_FIELDS = [
  'trainees', 'timers', 'feedbackData', 'completedRows', 'timeTracker',
] as const;

function mergeLiveState(existing: LiveState, incoming: Partial<LiveState>): LiveState {
  const merged: LiveState = { ...existing, ...incoming };

  for (const field of KEYED_MERGE_FIELDS) {
    if (incoming[field]) {
      Object.assign(merged, {
        [field]: { ...(existing[field] ?? {}), ...(incoming[field] ?? {}) },
      });
    }
  }

  if (incoming.unallocatedTrainees) {
    const byUid = new Map((existing.unallocatedTrainees ?? []).map((u) => [u.uid, u]));
    for (const u of incoming.unallocatedTrainees) byUid.set(u.uid, u);
    const incomingUids = new Set(incoming.unallocatedTrainees.map((u) => u.uid));
    merged.unallocatedTrainees = [...byUid.values()].filter((u) => incomingUids.has(u.uid));
  }

  return merged;
}

function normalizeShiftRole(value: unknown): StaffShiftRow['role'] {
  const role = String(value ?? 'Assistant');
  if (role === 'Main AST' || role === 'Co-Host' || role === 'Internal Helper') return role;
  return 'Assistant';
}

function additionalDatabaseRole(role: StaffShiftRow['role']): string {
  return `Add T. ${role}`;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessionId = Number((await params).id);
  if (!Number.isSafeInteger(sessionId) || sessionId <= 0) {
    return NextResponse.json({ success: false, message: 'Invalid session id.' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: session, error } = await supabase
    .from('session_ongoing')
    .select('*')
    .eq('session_id', sessionId)
    .single();

  if (error || !session) {
    return NextResponse.json({ success: false, message: 'Session not found.' }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    session,
    live_state: (session.live_state as LiveState | null) ?? {},
    last_updated: session.last_updated,
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessionId = Number((await params).id);
  if (!Number.isSafeInteger(sessionId) || sessionId <= 0) {
    return NextResponse.json({ success: false, message: 'Invalid session id.' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || Number(body.session_id) !== sessionId) {
    return NextResponse.json({ success: false, message: 'Invalid session payload.' }, { status: 400 });
  }

  const [
    { data: current, error: currentError },
    { data: profile },
    { data: adminRow },
    { data: assignedStaff, error: staffReadError },
    { data: currentTrainees, error: traineeReadError },
    { data: currentDrivers, error: driverReadError },
  ] = await Promise.all([
    supabase.from('session_ongoing').select('*').eq('session_id', sessionId).maybeSingle(),
    supabase.from('profiles').select('discord_username').eq('id', user.id).maybeSingle(),
    supabase.from('site_admins').select('id').eq('id', user.id).maybeSingle(),
    supabase
      .from('session_staff')
      .select('staff_row_id, role, staff_name, attended, notes')
      .eq('session_id', sessionId),
    supabase
      .from('session_trainees')
      .select('trainee_row_id, slot_number, is_standby')
      .eq('session_id', sessionId),
    supabase
      .from('session_drivers')
      .select('driver_row_id')
      .eq('session_id', sessionId),
  ]);

  const readError = currentError ?? staffReadError ?? traineeReadError ?? driverReadError;
  if (readError) {
    return NextResponse.json({ success: false, message: readError.message }, { status: 500 });
  }
  if (!current) {
    return NextResponse.json({ success: false, message: 'Session not found.' }, { status: 404 });
  }

  const username = String(profile?.discord_username ?? user.user_metadata?.user_name ?? '')
    .trim()
    .toLowerCase();
  const activeStaff = (assignedStaff ?? [])
    .map((row) => String(row.staff_name ?? '').trim().toLowerCase())
    .filter(Boolean);

  if (!adminRow && (!username || !activeStaff.includes(username))) {
    return NextResponse.json({ success: false, message: 'You are not assigned to this session.' }, { status: 403 });
  }

  const ongoingPatch: Record<string, unknown> = {};
  const traineePatches = new Map<number, Record<string, unknown>>();
  let requestedHost: string | undefined;

  if (body.updates && typeof body.updates === 'object') {
    for (const [column, value] of Object.entries(body.updates)) {
      if (column === 'host') {
        requestedHost = String(value ?? '').trim();
        continue;
      }

      const match = /^trainee_(\d+)_(name|discord|discord_id|zone|note|trainer_name|attended)$/.exec(column);
      if (match) {
        const slot = Number(match[1]);
        const existingSlot = (currentTrainees ?? []).find((row) => Number(row.slot_number) === slot);
        const allowedStandby = Boolean(existingSlot?.is_standby);
        if (!Number.isSafeInteger(slot) || slot < 1 || (slot > Number(current.num_slots) && !allowedStandby)) continue;
        const logicalField = match[2];
        const databaseField = TRAINEE_COLUMN_MAP[logicalField];
        const slotPatch = traineePatches.get(slot) ?? {};

        if (logicalField === 'discord_id') {
          const discordId = String(value ?? '').trim();
          if (discordId && !/^\d+$/.test(discordId)) {
            return NextResponse.json(
              { success: false, message: `${column} must contain digits only.` },
              { status: 400 }
            );
          }
          slotPatch[databaseField] = discordId || null;
        } else if (logicalField === 'zone') {
          const zone = value === '' || value == null ? null : Number(value);
          if (zone !== null && !Number.isSafeInteger(zone)) {
            return NextResponse.json({ success: false, message: `${column} is invalid.` }, { status: 400 });
          }
          slotPatch[databaseField] = zone;
        } else if (logicalField === 'attended') {
          slotPatch[databaseField] = Boolean(value);
        } else {
          const text = String(value ?? '').trim();
          slotPatch[databaseField] = text || null;
        }

        traineePatches.set(slot, slotPatch);
        continue;
      }

      if (ONGOING_COLUMNS.has(column)) ongoingPatch[column] = value;
    }
  }

  if (requestedHost !== undefined && !requestedHost) {
    return NextResponse.json({ success: false, message: 'Session host is required.' }, { status: 400 });
  }

  let incomingLiveState: Partial<LiveState> | null = null;
  if (body.live_state && typeof body.live_state === 'object' && !Array.isArray(body.live_state)) {
    const incoming: Partial<LiveState> = {};
    for (const [field, value] of Object.entries(body.live_state)) {
      if (LIVE_STATE_FIELDS.has(field as keyof LiveState)) {
        (incoming as Record<string, unknown>)[field] = value;
      }
    }
    if (Object.keys(incoming).length > 0) incomingLiveState = incoming;
  }

  if (
    Object.keys(ongoingPatch).length === 0 &&
    traineePatches.size === 0 &&
    !incomingLiveState &&
    requestedHost === undefined
  ) {
    return NextResponse.json({ success: false, message: 'Nothing to update.' }, { status: 400 });
  }

  // RLS in current_db.sql intentionally limits child-table updates by rank.
  // After the assignment check above, server-side writes use service_role so
  // every legitimate controller role can save through this guarded endpoint.
  const database = createAdminClient();

  if (requestedHost !== undefined) {
    const hostAssignment = (assignedStaff ?? []).find(
      (row) => row.role === 'HOST' || row.role.startsWith('HOST,')
    );
    if (!hostAssignment) {
      return NextResponse.json(
        { success: false, message: 'This session has no HOST row in session_staff.' },
        { status: 409 }
      );
    }
    if (hostAssignment.staff_name !== requestedHost) {
      const { data: savedHost, error } = await database
        .from('session_staff')
        .update({ staff_name: requestedHost })
        .eq('staff_row_id', hostAssignment.staff_row_id)
        .select('staff_row_id')
        .maybeSingle();
      if (error || !savedHost) {
        return NextResponse.json(
          { success: false, message: error?.message ?? 'The HOST assignment was not updated.' },
          { status: 500 }
        );
      }
    }
    incomingLiveState = { ...(incomingLiveState ?? {}), sessionHost: requestedHost };
  }

  for (const [slot, slotPatch] of traineePatches) {
    const existing = (currentTrainees ?? []).find((row) => Number(row.slot_number) === slot);
    if (existing) {
      const { data, error } = await database
        .from('session_trainees')
        .update(slotPatch)
        .eq('trainee_row_id', existing.trainee_row_id)
        .select('trainee_row_id')
        .maybeSingle();
      if (error || !data) {
        return NextResponse.json(
          { success: false, message: error?.message ?? `Trainee slot ${slot} was not updated.` },
          { status: 500 }
        );
      }
      continue;
    }

    const hasTraineeIdentity = Boolean(
      slotPatch.trainee_roblox_username || slotPatch.trainee_discord || slotPatch.trainee_discord_id
    );
    if (!hasTraineeIdentity) continue;

    const { error } = await database.from('session_trainees').insert({
      session_id: sessionId,
      slot_number: slot,
      is_standby: false,
      trainee_roblox_username: null,
      trainee_discord: null,
      trainee_discord_id: null,
      zone: null,
      note: null,
      trainer_name: null,
      attended: false,
      ...slotPatch,
    });
    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
  }

  if (incomingLiveState?.staffShift !== undefined) {
    if (!Array.isArray(incomingLiveState.staffShift)) {
      return NextResponse.json({ success: false, message: 'Invalid staff shift state.' }, { status: 400 });
    }

    const existingNonHosts = (assignedStaff ?? []).filter(
      (row) => !(row.role === 'HOST' || row.role.startsWith('HOST,'))
    );
    const actorAssignments = (assignedStaff ?? []).filter(
      (row) => String(row.staff_name ?? '').trim().toLowerCase() === username
    );
    const actorCanManageAdditions = actorAssignments.some((row) =>
      row.role === 'HOST' || row.role.startsWith('HOST,') || row.role === 'AST_1' || row.role.startsWith('AST_1,')
    );
    const persistedOverrides = ((current.live_state as LiveState | null)?.overrides ?? {});
    const effectiveOverrides = { ...persistedOverrides, ...(incomingLiveState.overrides ?? {}) };
    const staffAdditionAllowed = effectiveOverrides['staff-addition'] ?? true;
    const requestsNewStaff = incomingLiveState.staffShift.some((rawRow) => {
      if (!rawRow || typeof rawRow !== 'object') return false;
      const row = rawRow as StaffShiftRow;
      const staffName = String(row.discord ?? '').trim();
      if (!staffName) return false;
      const requestedId = Number(row.sourceRowId);
      return !existingNonHosts.some((candidate) =>
        (Number.isSafeInteger(requestedId) && candidate.staff_row_id === requestedId)
        || String(candidate.staff_name).trim().toLowerCase() === staffName.toLowerCase()
      );
    });
    if (requestsNewStaff && (!staffAdditionAllowed || !actorCanManageAdditions)) {
      return NextResponse.json(
        { success: false, message: !staffAdditionAllowed ? 'Staff addition is disabled by the Host.' : 'Only the Host or Main AST can add staff.' },
        { status: 403 }
      );
    }
    const keptIds = new Set<number>();
    const normalizedRows: StaffShiftRow[] = [];

    for (const rawRow of incomingLiveState.staffShift) {
      if (!rawRow || typeof rawRow !== 'object') continue;
      const row = rawRow as StaffShiftRow;
      const staffName = String(row.discord ?? '').trim();
      if (!staffName) continue;
      const requestedId = Number(row.sourceRowId);
      const existing = existingNonHosts.find((candidate) =>
        (Number.isSafeInteger(requestedId) && candidate.staff_row_id === requestedId) ||
        String(candidate.staff_name).trim().toLowerCase() === staffName.toLowerCase()
      );
      const role = normalizeShiftRole(row.role);

      if (existing) {
        const update: Record<string, unknown> = {
          staff_name: staffName,
          attended: Boolean(row.attended),
          notes: String(row.notes ?? '').trim() || null,
        };
        if (String(existing.role).startsWith('Add T.')) update.role = additionalDatabaseRole(role);
        const { error } = await database
          .from('session_staff')
          .update(update)
          .eq('staff_row_id', existing.staff_row_id);
        if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
        keptIds.add(existing.staff_row_id);
        normalizedRows.push({ ...row, sourceRowId: existing.staff_row_id, role, discord: staffName });
      } else {
        const { data: inserted, error } = await database
          .from('session_staff')
          .insert({
            session_id: sessionId,
            role: additionalDatabaseRole(role),
            staff_name: staffName,
            attended: Boolean(row.attended),
            notes: String(row.notes ?? '').trim() || null,
          })
          .select('staff_row_id')
          .single();
        if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
        keptIds.add(inserted.staff_row_id);
        normalizedRows.push({ ...row, sourceRowId: inserted.staff_row_id, role, discord: staffName });
      }
    }

    const deletedIds = existingNonHosts
      .map((row) => row.staff_row_id)
      .filter((rowId) => !keptIds.has(rowId));
    if (deletedIds.length > 0) {
      const { error } = await database.from('session_staff').delete().in('staff_row_id', deletedIds);
      if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
    incomingLiveState.staffShift = normalizedRows;
  }

  if (incomingLiveState?.drivers !== undefined) {
    if (!Array.isArray(incomingLiveState.drivers)) {
      return NextResponse.json({ success: false, message: 'Invalid driver state.' }, { status: 400 });
    }

    const keptIds = new Set<number>();
    const normalizedDrivers: DriverRow[] = [];
    for (const rawRow of incomingLiveState.drivers) {
      if (!rawRow || typeof rawRow !== 'object') continue;
      const row = rawRow as DriverRow;
      const discord = String(row.discord ?? '').trim();
      const roblox = String(row.roblox ?? '').trim();
      if (!discord && !roblox) continue;
      const rowId = Number(row.sourceRowId);
      const existing = (currentDrivers ?? []).find(
        (candidate) => Number.isSafeInteger(rowId) && candidate.driver_row_id === rowId
      );

      if (existing) {
        const { error } = await database
          .from('session_drivers')
          .update({ discord_username: discord || null, roblox_username: roblox || null, attended: Boolean(row.attended) })
          .eq('driver_row_id', existing.driver_row_id);
        if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
        keptIds.add(existing.driver_row_id);
        normalizedDrivers.push({ ...row, sourceRowId: existing.driver_row_id, discord, roblox });
      } else {
        const { data: inserted, error } = await database
          .from('session_drivers')
          .insert({ session_id: sessionId, discord_username: discord || null, roblox_username: roblox || null, attended: Boolean(row.attended) })
          .select('driver_row_id')
          .single();
        if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
        keptIds.add(inserted.driver_row_id);
        normalizedDrivers.push({ ...row, sourceRowId: inserted.driver_row_id, discord, roblox });
      }
    }

    const deletedIds = (currentDrivers ?? [])
      .map((row) => row.driver_row_id)
      .filter((rowId) => !keptIds.has(rowId));
    if (deletedIds.length > 0) {
      const { error } = await database.from('session_drivers').delete().in('driver_row_id', deletedIds);
      if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
    incomingLiveState.drivers = normalizedDrivers;
  }

  // Compare-and-swap live_state so concurrent controllers cannot overwrite a
  // newer timer/feedback update with an older snapshot.
  let currentRow = current;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const attemptPatch: Record<string, unknown> = { ...ongoingPatch };
    if (incomingLiveState) {
      attemptPatch.live_state = mergeLiveState(
        (currentRow.live_state as LiveState | null) ?? {},
        incomingLiveState
      );
    }
    attemptPatch.last_updated = new Date().toISOString();

    let updateQuery = database
      .from('session_ongoing')
      .update(attemptPatch)
      .eq('session_id', sessionId);
    updateQuery = currentRow.last_updated
      ? updateQuery.eq('last_updated', currentRow.last_updated)
      : updateQuery.is('last_updated', null);

    const { data: fresh, error } = await updateQuery.select('*').maybeSingle();
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    if (fresh) {
      return NextResponse.json({
        success: true,
        session: fresh,
        live_state: (fresh.live_state as LiveState | null) ?? {},
        last_updated: fresh.last_updated,
      });
    }

    const { data: latest, error: refreshError } = await database
      .from('session_ongoing')
      .select('*')
      .eq('session_id', sessionId)
      .maybeSingle();
    if (refreshError) {
      return NextResponse.json({ success: false, message: refreshError.message }, { status: 500 });
    }
    if (!latest) {
      return NextResponse.json({ success: false, message: 'Session no longer exists.' }, { status: 404 });
    }
    currentRow = latest;
  }

  return NextResponse.json(
    { success: false, message: 'The session changed repeatedly while saving. Please retry.' },
    { status: 409 }
  );
}
