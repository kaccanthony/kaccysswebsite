'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/getCurrentUser';
import { createClient } from '@/utils/supabase/server';
import { checkIdentityFieldFormats } from '@/app/(app)/managesession/parseTraineePaste';
import { isEventType } from '@/lib/events/types';
import { eventError } from '@/lib/events/errors';

const STATUSES = ['Requested', 'Scheduled', 'Published', 'Cancelled', 'Postponed'] as const;
type Result = { success: boolean; message: string };
const fail = (message: string): Result => ({ success: false, message });

async function canManageEvents() {
  const user = await getCurrentUser();
  if (user.isAdmin) return true;
  const supabase = await createClient();
  const { data } = await supabase.from('staff_profiles')
    .select('eventh_auth, eventch_auth').eq('id', user.id).maybeSingle();
  return Boolean(data?.eventh_auth || data?.eventch_auth);
}

export async function saveEvent(formData: FormData): Promise<Result> {
  if (!(await canManageEvents())) return fail('You do not have permission to manage events.');
  const action = String(formData.get('action') ?? '');
  if (action !== 'add' && action !== 'edit') return fail('Invalid action.');
  const eventId = Number(formData.get('event_id'));
  if (action === 'edit' && (!Number.isSafeInteger(eventId) || eventId < 1)) return fail('Invalid event ID.');

  const field = (name: string) => String(formData.get(name) ?? '').trim();
  const status = field('event_status');
  const eventType = field('event_type');
  const name = field('event_name');
  const host = field('host');
  const date = field('event_date');
  const time = field('event_time');
  const game = field('game_or_location');
  const details = field('event_details');
  if (!STATUSES.includes(status as typeof STATUSES[number])) return fail('Choose a valid event status.');
  if (!isEventType(eventType)) return fail(eventError('ERR_002', 'Choose a valid event type (tag).'));
  if (!name || !host || !game || !details) return fail(eventError('ERR_002', 'Name, host, game/location, and details are required.'));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00`))) return fail(eventError('PERR-02', 'Choose a valid event date.'));
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return fail(eventError('PERR-02', 'Choose a valid event time.'));

  let attendees: unknown;
  try { attendees = JSON.parse(field('attendees_json')); }
  catch { return fail('Attendee data could not be read.'); }
  if (!Array.isArray(attendees) || attendees.length < 4 || attendees.length > 100) return fail(eventError('PERR-04', 'Add at least four attendees (maximum 100).'));
  const normalized: { discord_id: string; discord_username: string; roblox_username: string }[] = [];
  const identities = new Set<string>();
  for (const value of attendees) {
    if (!value || typeof value !== 'object') return fail('Invalid attendee entry.');
    const row = value as Record<string, unknown>;
    const discord_id = String(row.discord_id ?? '').trim();
    const discord_username = String(row.discord_username ?? '').trim();
    const roblox_username = String(row.roblox_username ?? '').trim();
    if (!discord_id || !discord_username || !roblox_username) return fail(eventError('PERR-05', 'Every attendee needs a Discord ID, Discord username, and Roblox username.'));
    const format = checkIdentityFieldFormats(discord_id, discord_username, roblox_username);
    if (!format.ok) return fail(format.errors.join(' '));
    if ([discord_id, discord_username, roblox_username].some(part => part.length > 100)) return fail('An attendee field is too long.');
    const key = discord_id || discord_username.toLowerCase();
    if (identities.has(key)) return fail(`Duplicate attendee: ${discord_username}.`);
    identities.add(key);
    normalized.push({ discord_id, discord_username, roblox_username });
  }

  let additionalStaff: unknown;
  try { additionalStaff = JSON.parse(field('additional_staff_json')); }
  catch { return fail('Additional staff data could not be read.'); }
  if (!Array.isArray(additionalStaff) || additionalStaff.length > 20) return fail('Use at most 20 additional staff.');
  const staffRows: { name: string; role: string }[] = [];
  const staffNames = new Set([host.toLowerCase(), ...field('co_hosts').split(',').map(value => value.trim().toLowerCase()).filter(Boolean)]);
  for (const value of additionalStaff) {
    if (!value || typeof value !== 'object') return fail('Invalid additional staff entry.');
    const row = value as Record<string, unknown>;
    const staffName = String(row.name ?? '').trim();
    const role = String(row.role ?? '').trim();
    if (!staffName && !role) continue;
    if (!staffName || !role) return fail('Every additional staff row needs a name and role.');
    if (staffName.length > 100 || role.length > 100) return fail('An additional staff field is too long.');
    if (staffNames.has(staffName.toLowerCase())) return fail(`Duplicate event staff: ${staffName}.`);
    staffNames.add(staffName.toLowerCase());
    staffRows.push({ name: staffName, role });
  }

  const payload = {
    event_status: status,
    event_type: eventType,
    event_name: name,
    host,
    co_hosts: field('co_hosts') || null,
    event_date: date,
    event_time: time,
    game_or_location: game,
    event_details: details,
    event_additional_staff: staffRows,
    event_attendees: normalized.map(row => row.discord_username).join('\n') || null,
    event_attendees_data: normalized,
  };
  const supabase = await createClient();
  if (action === 'add') {
    const { error } = await supabase.from('event_upcoming').insert(payload);
    if (error) return fail(eventError('ERR_003', error.message));
  } else {
    const { data, error } = await supabase.from('event_upcoming').update(payload)
      .eq('event_id', eventId).select('event_id').maybeSingle();
    if (error) return fail(eventError('ERR_003', error.message));
    if (!data) return fail('Event not found or you cannot edit it.');
  }
  const entries = normalized.map(row => ({
    discordId: row.discord_id,
    discordUsername: row.discord_username,
    robloxUsername: row.roblox_username,
  }));
  const { error: cacheError } = await supabase.rpc('upsert_known_trainees_batch', { p_entries: entries });
  let cacheWarning = false;
  if (cacheError?.code === 'PGRST202') {
    for (const entry of entries) {
      const { data: existing } = await supabase.from('known_trainees').select('row_id')
        .eq('discord_id', entry.discordId).maybeSingle();
      const result = existing
        ? await supabase.from('known_trainees').update({ discord_username: entry.discordUsername,
            roblox_username: entry.robloxUsername, last_seen_at: new Date().toISOString() }).eq('row_id', existing.row_id)
        : await supabase.from('known_trainees').insert({ discord_id: entry.discordId,
            discord_username: entry.discordUsername, roblox_username: entry.robloxUsername,
            last_seen_at: new Date().toISOString() });
      if (result.error) cacheWarning = true;
    }
  } else if (cacheError) cacheWarning = true;
  revalidatePath('/manageevents');
  revalidatePath('/upcoming');
  revalidatePath('/eventsetup');
  return { success: true, message: `${action === 'add' ? 'Event added.' : 'Event saved.'}${cacheWarning ? ` ${eventError('PERR-03', 'Some attendee identities could not be added to quick fill.')}` : ''}` };
}

export async function deleteEvent(eventId: number): Promise<Result> {
  if (!(await canManageEvents())) return fail('You do not have permission to manage events.');
  if (!Number.isSafeInteger(eventId) || eventId < 1) return fail('Invalid event ID.');
  const supabase = await createClient();
  const { data: run, error: runError } = await supabase.from('event_runs')
    .select('event_run_id').eq('source_event_id', eventId).maybeSingle();
  if (runError) return fail(`Could not check the event panel: ${runError.message}`);
  if (run) return fail('This event already has a panel. Cancel or postpone it instead of deleting it.');
  const { data, error } = await supabase.from('event_upcoming').delete()
    .eq('event_id', eventId).select('event_id').maybeSingle();
  if (error) return fail(error.message);
  if (!data) return fail('Event not found or you cannot delete it.');
  revalidatePath('/manageevents');
  revalidatePath('/upcoming');
  revalidatePath('/eventsetup');
  return { success: true, message: 'Event deleted.' };
}
