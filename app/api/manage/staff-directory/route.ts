// FILE: app/api/manage/staff-directory/route.ts
// staff_directory replaces the old flat `staff_list` MySQL table. In the current schema a
// "staff member" is a `profiles` row that ALSO has a `staff_profiles` row, so this board reads
// as a join and writes as two (conditional) updates. Doesn't go through the generic
// /api/manage/records route — see the `joined: true` flag on staff_directory in manageTables.ts.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { createClient } from '@/utils/supabase/server';
import { getApiUser } from '@/lib/apiAuth';
import { orderStaffRows } from '@/lib/staffRankOrder';

const PROFILE_FIELDS = ['roblox_username', 'nationality', 'hide_stats'] as const;
const STAFF_FIELDS = ['staff_rank', 'staff_joined', 'staff_loa', 'staff_quota_met', 'staff_perm_level'] as const;
const STAFF_BOOLEAN_FIELDS = new Set<string>(['staff_loa', 'staff_quota_met']);
type LinkedProfile = {
  discord_id?: string | null;
  discord_username?: string | null;
  discord_server_name?: string | null;
  discord_avatar_url?: string | null;
  roblox_avatar_url?: string | null;
  roblox_username?: string | null;
  nationality?: string | null;
  num_sessions_attended?: number | null;
  hide_stats?: boolean | null;
};

export async function GET() {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  if (user.permLevel < 15) {
    return NextResponse.json({ success: false, message: 'Insufficient permission for this table.' }, { status: 403 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('staff_profiles')
    .select(
      'id, staff_rank, staff_joined, staff_loa, staff_quota_met, staff_perm_level, ' +
        'op_dept, comm_dept, host_auth, cohost_auth, asst_auth, eventh_auth, eventch_auth, ih_auth, ' +
        'profiles(discord_id, discord_username, discord_server_name, discord_avatar_url, roblox_avatar_url, roblox_username, nationality, num_sessions_attended, hide_stats)'
    )
    .order('staff_perm_level', { ascending: false });

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

  // Flatten the join into the same flat-row shape every other board uses.
  const joinedRows = (data ?? []) as unknown as Array<Record<string, unknown> & { profiles?: LinkedProfile | null }>;
  const rows = joinedRows.map((row) => ({
    id: row.id,
    staff_rank: row.staff_rank,
    staff_joined: row.staff_joined,
    staff_loa: row.staff_loa,
    staff_quota_met: row.staff_quota_met,
    staff_perm_level: row.staff_perm_level,
    op_dept: row.op_dept,
    comm_dept: row.comm_dept,
    host_auth: row.host_auth,
    cohost_auth: row.cohost_auth,
    asst_auth: row.asst_auth,
    eventh_auth: row.eventh_auth,
    eventch_auth: row.eventch_auth,
    ih_auth: row.ih_auth,
    discord_id: row.profiles?.discord_id ?? null,
    discord_username: row.profiles?.discord_username ?? null,
    discord_server_name: row.profiles?.discord_server_name ?? null,
    discord_avatar_url: row.profiles?.discord_avatar_url ?? null,
    roblox_avatar_url: row.profiles?.roblox_avatar_url ?? null,
    roblox_username: row.profiles?.roblox_username ?? null,
    nationality: row.profiles?.nationality ?? null,
    num_sessions_attended: row.profiles?.num_sessions_attended ?? null,
    hide_stats: row.profiles?.hide_stats ?? null,
  }));

  return NextResponse.json({ success: true, rows: orderStaffRows(rows, (row) => row.staff_rank) });
}

// "Create" here means promoting an EXISTING profile to staff (you can't hand-create a
// profiles row — that only happens via Discord OAuth sign-in). Body: { profileId, staff_rank,
// staff_perm_level? }.
export async function POST(req: NextRequest) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  if (user.permLevel < 15) {
    return NextResponse.json({ success: false, message: 'Insufficient permission for this table.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const profileId: string | undefined = body.data?.id;
  if (!profileId) return NextResponse.json({ success: false, message: 'Missing profile to promote.' });

  const insert: Record<string, unknown> = { id: profileId, staff_rank: body.data?.staff_rank ?? 'Assistant Authorized' };
  if (user.permLevel >= 20 && body.data?.staff_perm_level !== undefined) {
    insert.staff_perm_level = Number(body.data.staff_perm_level) || 0;
  }

  const supabase = await createClient();
  const { error } = await supabase.from('staff_profiles').insert(insert);
  if (error) return NextResponse.json({ success: false, message: error.message });
  return NextResponse.json({ success: true });
}

export async function PUT(req: NextRequest) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  if (user.permLevel < 15) {
    return NextResponse.json({ success: false, message: 'Insufficient permission for this table.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const pkVal: string | undefined = body.pk;
  const rawData: Record<string, unknown> = body.data ?? {};
  if (!pkVal) return NextResponse.json({ success: false, message: 'Missing primary key value.' });

  const supabase = await createClient();

  // Same guard as the old admin_records.php: once someone is already Manager/Admin rank
  // (perm 15+), only an Admin (20) can change staff_rank further.
  const { data: targetRow } = await supabase.from('staff_profiles').select('staff_perm_level').eq('id', pkVal).maybeSingle();
  const targetPermLevel = targetRow?.staff_perm_level ?? null;
  const canChangeRank = !(targetPermLevel !== null && targetPermLevel >= 15 && user.permLevel < 20);

  const profileUpdate: Record<string, unknown> = {};
  for (const f of PROFILE_FIELDS) {
    if (f in rawData) profileUpdate[f] = f === 'hide_stats' ? !!rawData[f] : rawData[f];
  }

  const staffUpdate: Record<string, unknown> = {};
  for (const f of STAFF_FIELDS) {
    if (!(f in rawData)) continue;
    if (f === 'staff_rank' && !canChangeRank) continue;
    if (f === 'staff_perm_level' && user.permLevel < 20) continue;
    staffUpdate[f] = STAFF_BOOLEAN_FIELDS.has(f) ? !!rawData[f] : rawData[f];
  }

  if (Object.keys(profileUpdate).length === 0 && Object.keys(staffUpdate).length === 0) {
    return NextResponse.json({ success: false, message: 'No editable fields supplied.' });
  }

  if (Object.keys(profileUpdate).length > 0) {
    const { error } = await supabase.from('profiles').update(profileUpdate).eq('id', pkVal);
    if (error) return NextResponse.json({ success: false, message: error.message });
  }
  if (Object.keys(staffUpdate).length > 0) {
    const { error } = await supabase.from('staff_profiles').update(staffUpdate).eq('id', pkVal);
    if (error) return NextResponse.json({ success: false, message: error.message });
  }

  return NextResponse.json({ success: true });
}

// Removes staff status (deletes the staff_profiles row) — does NOT delete the underlying
// account/profile. Deleting someone's whole account from here would be one click away from
// deleting their Supabase Auth identity, which this page has no business doing.
export async function DELETE(req: NextRequest) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  if (user.permLevel < 15) {
    return NextResponse.json({ success: false, message: 'Insufficient permission for this table.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const pkVal: string | undefined = body.pk;
  if (!pkVal) return NextResponse.json({ success: false, message: 'Missing primary key value.' });

  const supabase = await createClient();
  const { error } = await supabase.from('staff_profiles').delete().eq('id', pkVal);
  if (error) return NextResponse.json({ success: false, message: error.message });
  return NextResponse.json({ success: true });
}
