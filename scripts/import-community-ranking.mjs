/** Restore missing Community results from the cached workbook export.
 *
 * Run with: node --env-file=.env.local scripts/import-community-ranking.mjs --apply
 * Existing Community metrics are preserved. Re-running is safe.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const snapshot = JSON.parse(readFileSync(new URL('../lib/staffPublicSnapshot.json', import.meta.url), 'utf8'));
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Supabase server credentials are missing.');
const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const { data, error } = await db.from('staff_public_data').select('discord_id, community');
if (error) throw error;

const updates = [];
for (const row of data ?? []) {
  const source = snapshot[row.discord_id]?.community;
  if (!source || typeof source.department_power_ranking !== 'number') continue;
  const community = row.community ?? {};
  const merged = { ...community };
  for (const key of ['average_turnout', 'tag_versatility', 'department_power_ranking', 'power_rank']) {
    if (typeof merged[key] !== 'number' && typeof source[key] === 'number') merged[key] = source[key];
  }
  if (Object.keys(merged).length > Object.keys(community).length) updates.push({ id: row.discord_id, community: merged });
}

if (process.argv[2] !== '--apply') {
  console.log(`${updates.length} Community rows need missing stats. Pass --apply to import.`);
} else {
  for (const row of updates) {
    const { error: updateError } = await db.from('staff_public_data')
      .update({ community: row.community }).eq('discord_id', row.id);
    if (updateError) throw updateError;
  }
  console.log(`Imported missing Community stats for ${updates.length} rows.`);
}
