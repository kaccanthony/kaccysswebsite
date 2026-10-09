/** Import the cached department-sheet metrics for every current staff roster row.
 *
 * Dry run: node --env-file=.env.local scripts/import-staff-public-data.mjs
 * Apply:   node --env-file=.env.local scripts/import-staff-public-data.mjs --apply
 *
 * The snapshot contains only public metrics and Roblox IDs. Nationality and flag
 * data are deliberately excluded. Existing department metrics are retained when
 * a workbook has no corresponding data for that staff member.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const snapshot = JSON.parse(readFileSync(new URL('../lib/staffPublicSnapshot.json', import.meta.url), 'utf8'));
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Supabase server credentials are missing.');

const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const stableJson = value => JSON.stringify(value, Object.keys(value ?? {}).sort());
const [{ data: roster, error: rosterError }, { data: current, error: currentError }] = await Promise.all([
  db.from('staff_roster').select('discord_id, discord_username').order('discord_username'),
  db.from('staff_public_data').select('discord_id, roblox_id, operations, community, source_as_of'),
]);
if (rosterError) throw rosterError;
if (currentError) throw currentError;

const currentById = new Map((current ?? []).map(row => [row.discord_id, row]));
const rows = (roster ?? []).map(member => {
  const source = snapshot[member.discord_id] ?? {};
  const existing = currentById.get(member.discord_id);
  const operations = { ...(existing?.operations ?? {}), ...(source.operations ?? {}) };
  const community = { ...(existing?.community ?? {}), ...(source.community ?? {}) };
  const departmentStatsChanged = !existing
    || stableJson(operations) !== stableJson(existing.operations ?? {})
    || stableJson(community) !== stableJson(existing.community ?? {});
  return {
    discord_id: member.discord_id,
    roblox_id: source.roblox_id ?? existing?.roblox_id ?? null,
    operations,
    community,
    source_as_of: departmentStatsChanged
      ? source.source_as_of ?? new Date().toISOString().slice(0, 10)
      : existing.source_as_of ?? source.source_as_of ?? new Date().toISOString().slice(0, 10),
  };
});

const missing = rows.filter(row => !currentById.has(row.discord_id));
console.log(`${rows.length} roster rows checked; ${missing.length} staff_public_data rows need inserting.`);
for (const row of missing) {
  const member = roster.find(item => item.discord_id === row.discord_id);
  console.log(`  + ${member?.discord_username ?? row.discord_id} (${row.discord_id})`);
}

if (process.argv[2] !== '--apply') {
  console.log('Dry run only. Pass --apply to upsert the roster-backed public data.');
  process.exit(0);
}

const { error: upsertError } = await db.from('staff_public_data').upsert(rows, { onConflict: 'discord_id' });
if (upsertError) throw upsertError;

const rosterIds = rows.map(row => row.discord_id);
const { data: verified, error: verifyError } = await db
  .from('staff_public_data')
  .select('discord_id, roblox_id, operations, community, source_as_of')
  .in('discord_id', rosterIds);
if (verifyError) throw verifyError;
if ((verified ?? []).length !== rosterIds.length) {
  throw new Error(`Verification failed: expected ${rosterIds.length} public rows, found ${(verified ?? []).length}.`);
}
const verifiedById = new Map(verified.map(row => [row.discord_id, row]));
for (const expected of rows) {
  const actual = verifiedById.get(expected.discord_id);
  const matches = actual
    && String(actual.roblox_id ?? '') === String(expected.roblox_id ?? '')
    && stableJson(actual.operations) === stableJson(expected.operations)
    && stableJson(actual.community) === stableJson(expected.community)
    && actual.source_as_of === expected.source_as_of;
  if (!matches) throw new Error(`Verification failed for ${expected.discord_id}: imported values differ.`);
}
console.log(`Imported and verified ${rosterIds.length} staff_public_data rows.`);
