// app/api/session/[id]/sync/route.ts
// Synchronizes the live controller with the normalized schema in
// database/current_db.sql. Core fields/live_state belong to session_ongoing;
// staff, trainees, and drivers are durably written to their child tables.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import type { DriverRow, LiveState, OverridesState, StaffShiftRow } from '@/types/session';
import { SESSION_ONGOING_COLUMNS } from '@/lib/supabase/columns';
import { isWithinSessionTraineeLimit, SESSION_TRAINEE_LIMIT_MESSAGE } from '@/lib/session/traineeLimit';
import { getSessionControlAccess } from '@/lib/session/controlPermissions';
import { isInternalHelperRole } from '@/lib/sessionStaffTrainees';

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

const OVERRIDE_KEYS = new Set<keyof OverridesState>([
  'session-details', 'trainees', 'staff-roles', 'drivers-disable', 'slot-order',
  'staff-delete', 'trainee-details', 'trainer-details', 'staff-addition', 'allow-all',
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

function shiftRole(role: string): StaffShiftRow['role'] {
  if (isInternalHelperRole(role)) return 'Internal Helper';
  if (role.startsWith('CH_') || role === 'Add T. Co-Host') return 'Co-Host';
  if (role.startsWith('AST_1') || role === 'Add T. Main AST') return 'Main AST';
  return 'Assistant';
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessionId = Number((await params).id);
  if (!Number.isSafeInteger(sessionId) || sessionId <= 0) {
    return NextResponse.json({ success: false, message: 'Invalid session id.' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: session, error } = await supabase
    .from('session_ongoing')
    .select(SESSION_ONGOING_COLUMNS)
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
    supabase.from('session_ongoing').select(SESSION_ONGOING_COLUMNS).eq('session_id', sessionId).maybeSingle(),
    supabase.from('profiles').select('discord_username').eq('id', user.id).maybeSingle(),
    supabase.from('site_admins').select('id').eq('id', user.id).maybeSingle(),
    supabase
      .from('session_staff')
      .select('staff_row_id, role, staff_name, attended, notes')
      .eq('session_id', sessionId),
    supabase
      .from('session_trainees')
      .select('trainee_row_id, slot_number, is_standby, trainee_roblox_username, trainee_discord, trainee_discord_id, zone, note, trainer_name, attended')
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

  const actorAssignments = (assignedStaff ?? []).filter((row) =>
    String(row.staff_name ?? '').trim().toLowerCase() === username
  );
  const persistedStaffShift = (current.live_state as LiveState | null)?.staffShift ?? [];
  const effectiveShiftRole = (row: (typeof actorAssignments)[number]) => {
    const liveRow = persistedStaffShift.find((member) => member.sourceRowId === row.staff_row_id &&
      member.discord.trim().toLowerCase() === username);
    return liveRow?.role ?? shiftRole(row.role);
  };
  const actorRoles = {
    host: actorAssignments.some((row) => row.role === 'HOST' || row.role.startsWith('HOST,')),
    coHost: actorAssignments.some((row) => effectiveShiftRole(row) === 'Co-Host'),
    mainAst: actorAssignments.some((row) => effectiveShiftRole(row) === 'Main AST'),
    internalHelper: actorAssignments.some((row) => effectiveShiftRole(row) === 'Internal Helper'),
  };
  const persistedOverrides: Partial<OverridesState> = (current.live_state as LiveState | null)?.overrides ?? {};
  const controlAccess = getSessionControlAccess(persistedOverrides, actorRoles);

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

  if (incomingLiveState?.overrides !== undefined) {
    if (!actorRoles.host) {
      return NextResponse.json({ success: false, message: 'Only the Host can change session controls.' }, { status: 403 });
    }
    const requested = incomingLiveState.overrides as unknown;
    if (!requested || typeof requested !== 'object' || Array.isArray(requested) ||
      Object.entries(requested).some(([key, value]) => !OVERRIDE_KEYS.has(key as keyof OverridesState) || typeof value !== 'boolean')) {
      return NextResponse.json({ success: false, message: 'Invalid session controls.' }, { status: 400 });
    }
  }

  if ((requestedHost !== undefined || Object.keys(ongoingPatch).some((key) => key !== 'session_status') || incomingLiveState?.sessionHost !== undefined) && !controlAccess.sessionDetails) {
    return NextResponse.json({ success: false, message: 'Session details are locked for your role.' }, { status: 403 });
  }
  const completedRows = (current.live_state as LiveState | null)?.completedRows ?? {};
  const allDone = Object.keys(completedRows).length > 0 && Object.values(completedRows).every(Boolean);
  const canChangeStatus = actorRoles.host || persistedOverrides['allow-all'] === true ||
    ((actorRoles.coHost || actorRoles.internalHelper) && (persistedOverrides['session-details'] === true || allDone));
  if ('session_status' in ongoingPatch && !canChangeStatus) {
    return NextResponse.json({ success: false, message: 'Session status is locked for your role.' }, { status: 403 });
  }
  if (incomingLiveState?.slotOrder !== undefined && !controlAccess.slotOrder) {
    return NextResponse.json({ success: false, message: 'Slot ordering is locked for your role.' }, { status: 403 });
  }
  if (incomingLiveState?.drivers !== undefined && !controlAccess.drivers) {
    return NextResponse.json({ success: false, message: 'Driver input is disabled for your role.' }, { status: 403 });
  }

  for (const [slot, slotPatch] of traineePatches) {
    const existing = (currentTrainees ?? []).find((row) => Number(row.slot_number) === slot);
    const removing = Boolean(existing && controlAccess.trainees &&
      ['trainee_roblox_username', 'trainee_discord', 'trainee_discord_id', 'zone', 'note', 'trainer_name']
        .every((field) => field in slotPatch && (slotPatch[field] === null || slotPatch[field] === '')));
    for (const [field, value] of Object.entries(slotPatch)) {
      if (field === 'attended' || value === (existing as Record<string, unknown> | undefined)?.[field] ||
        (value === null && !(existing as Record<string, unknown> | undefined)?.[field])) continue;
      const allowed = removing || (field === 'trainer_name' ? controlAccess.trainerDetails : (controlAccess.traineeDetails || controlAccess.trainees));
      if (!allowed) return NextResponse.json({ success: false, message: 'Trainee details are locked for your role.' }, { status: 403 });
    }
  }

  if (incomingLiveState?.trainees !== undefined) {
    if (!incomingLiveState.trainees || typeof incomingLiveState.trainees !== 'object' || Array.isArray(incomingLiveState.trainees) || traineePatches.size === 0) {
      return NextResponse.json({ success: false, message: 'Invalid trainee state.' }, { status: 400 });
    }
    // Build live rows from the validated database patches so a caller cannot
    // hide unauthorized changes in the separately supplied live_state snapshot.
    const validatedRows: NonNullable<LiveState['trainees']> = {};
    for (const [slot, patch] of traineePatches) {
      const existing = (currentTrainees ?? []).find((row) => Number(row.slot_number) === slot);
      const value = (field: string) => field in patch ? patch[field] : (existing as Record<string, unknown> | undefined)?.[field];
      const zone = value('zone');
      validatedRows[String(slot - 1)] = {
        discord: String(value('trainee_discord') ?? ''),
        discordId: String(value('trainee_discord_id') ?? ''),
        roblox: String(value('trainee_roblox_username') ?? ''),
        zone: zone == null || zone === '' ? '' : `Zone ${zone}`,
        notes: String(value('note') ?? ''),
        trainerName: String(value('trainer_name') ?? ''),
        attended: Boolean(value('attended')),
      };
    }
    incomingLiveState.trainees = validatedRows;
  }

  if (
    Object.keys(ongoingPatch).length === 0 &&
    traineePatches.size === 0 &&
    !incomingLiveState &&
    requestedHost === undefined
  ) {
    return NextResponse.json({ success: false, message: 'Nothing to update.' }, { status: 400 });
  }

  if (incomingLiveState?.unallocatedTrainees !== undefined) {
    if (!Array.isArray(incomingLiveState.unallocatedTrainees)) {
      return NextResponse.json({ success: false, message: 'Invalid unallocated trainee list.' }, { status: 400 });
    }
    if (incomingLiveState.unallocatedTrainees.some((row) => !row || typeof row !== 'object' || typeof row.uid !== 'string')) {
      return NextResponse.json({ success: false, message: 'Invalid unallocated trainee.' }, { status: 400 });
    }
    const storedUnallocated = (current.live_state as LiveState | null)?.unallocatedTrainees;
    const currentUnallocated = Array.isArray(storedUnallocated) ? storedUnallocated : [];
    const currentByUid = new Map(currentUnallocated.map((row) => [row.uid, row]));
    const nextByUid = new Map(incomingLiveState.unallocatedTrainees.map((row) => [row.uid, row]));
    if (nextByUid.size !== incomingLiveState.unallocatedTrainees.length) {
      return NextResponse.json({ success: false, message: 'Duplicate unallocated trainee.' }, { status: 400 });
    }
    const listChanged = currentByUid.size !== nextByUid.size ||
      [...currentByUid.keys()].some((uid) => !nextByUid.has(uid));
    if (listChanged && !controlAccess.trainees) {
      return NextResponse.json({ success: false, message: 'Adding or deleting trainees is locked for your role.' }, { status: 403 });
    }
    for (const row of incomingLiveState.unallocatedTrainees) {
      const previous = currentByUid.get(row.uid);
      const detailsChanged = (['discord', 'discordId', 'roblox', 'zone', 'notes'] as const)
        .some((field) => String(row[field] ?? '') !== String(previous?.[field] ?? ''));
      if (detailsChanged && !(controlAccess.traineeDetails || controlAccess.trainees)) {
        return NextResponse.json({ success: false, message: 'Trainee details are locked for your role.' }, { status: 403 });
      }
      if (String(row.trainerName ?? '') !== String(previous?.trainerName ?? '') && !controlAccess.trainerDetails) {
        return NextResponse.json({ success: false, message: 'Trainer assignment is locked for your role.' }, { status: 403 });
      }
    }
    const currentUnallocatedCount = currentUnallocated.length;
    const nextUnallocatedCount = incomingLiveState.unallocatedTrainees.length;
    const fixedSlots = Number(current.num_slots) + (currentTrainees ?? []).filter((row) => row.is_standby).length;
    if (
      nextUnallocatedCount > currentUnallocatedCount &&
      !isWithinSessionTraineeLimit(fixedSlots, nextUnallocatedCount)
    ) {
      return NextResponse.json({ success: false, message: SESSION_TRAINEE_LIMIT_MESSAGE }, { status: 400 });
    }
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
    if (requestsNewStaff && !controlAccess.staffAddition) {
      return NextResponse.json(
        { success: false, message: 'Only the Host or an Internal Helper can add staff when this control is enabled.' },
        { status: 403 }
      );
    }
    const keptExistingIds = new Set(incomingLiveState.staffShift.map((rawRow) => {
      const row = rawRow as StaffShiftRow;
      const requestedId = Number(row?.sourceRowId);
      return existingNonHosts.find((candidate) => candidate.staff_row_id === requestedId ||
        String(candidate.staff_name).trim().toLowerCase() === String(row?.discord ?? '').trim().toLowerCase())?.staff_row_id;
    }));
    if (!controlAccess.staffDelete && existingNonHosts.some((row) => !keptExistingIds.has(row.staff_row_id))) {
      return NextResponse.json({ success: false, message: 'Staff deletion is locked for your role.' }, { status: 403 });
    }
    if (!controlAccess.staffRoles && incomingLiveState.staffShift.some((rawRow) => {
      const row = rawRow as StaffShiftRow;
      const requestedId = Number(row?.sourceRowId);
      const existing = existingNonHosts.find((candidate) => candidate.staff_row_id === requestedId ||
        String(candidate.staff_name).trim().toLowerCase() === String(row?.discord ?? '').trim().toLowerCase());
      const previousRole = persistedStaffShift.find((member) => member.sourceRowId === existing?.staff_row_id)?.role ?? (existing ? shiftRole(existing.role) : null);
      return existing && (row.role !== previousRole ||
        String(row.discord ?? '').trim().toLowerCase() !== String(existing.staff_name).trim().toLowerCase());
    })) {
      return NextResponse.json({ success: false, message: 'Staff assignments and roles are locked for your role.' }, { status: 403 });
    }
    const keptIds = new Set<number>();
    const normalizedRows: StaffShiftRow[] = [];

    for (const rawRow of incomingLiveState.staffShift) {
      if (!rawRow || typeof rawRow !== 'object') continue;
      const row = rawRow as StaffShiftRow;
      const staffName = String(row.discord ?? '').trim();
      if (!staffName) {
        // Keep the client-side empty row until a staff member is selected;
        // it is not a database record and should not disappear on sync.
        normalizedRows.push({ ...row, discord: '' });
        continue;
      }
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

    const { data: fresh, error } = await updateQuery.select(SESSION_ONGOING_COLUMNS).maybeSingle();
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
      .select(SESSION_ONGOING_COLUMNS)
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
