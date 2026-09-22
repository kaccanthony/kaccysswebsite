// FILE: app/api/manage/records/route.ts
// Generic list/create/update/delete for every board in manageTables.ts EXCEPT ones marked
// `joined: true` (those have their own dedicated route — see staff-directory/route.ts).
// This is the direct successor to admin_records.php + manage_records.php: the table/column
// allow-list in lib/manageTables.ts is the only thing that decides what's reachable, same
// guarantee the PHP version had ($config[$table] gate).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getApiUser } from '@/lib/apiAuth';
import { getTableConfig, type BoardConfig, type ColumnDef } from '@/lib/manageTables';

function boardFor(tableKey: string): BoardConfig | null {
  const cfg = getTableConfig();
  const board = cfg[tableKey];
  if (!board || board.comingSoon || board.joined) return null;
  return board;
}

function coerceValue(def: ColumnDef, raw: unknown) {
  if (def.type === 'bool') return !!raw;
  if (def.type === 'number') return raw === '' || raw === null || raw === undefined ? null : Number(raw);
  return raw;
}

export async function GET(req: NextRequest) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const tableKey = req.nextUrl.searchParams.get('table') ?? '';
  const board = boardFor(tableKey);
  if (!board) return NextResponse.json({ success: false, message: 'Unknown or unavailable table.' }, { status: 400 });
  if (user.permLevel < board.minLevel) {
    return NextResponse.json({ success: false, message: 'Insufficient permission for this table.' }, { status: 403 });
  }

  const supabase = await createClient();
  const colNames = Object.keys(board.columns);
  const { data, error } = await supabase
    .from(board.table)
    .select(colNames.join(', '))
    .order(board.primaryKey, { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ success: false, message: `Config/schema mismatch for this table: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ success: true, rows: data ?? [] });
}

export async function POST(req: NextRequest) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const tableKey: string = body.table ?? '';
  const board = boardFor(tableKey);
  if (!board) return NextResponse.json({ success: false, message: 'Unknown or unavailable table.' }, { status: 400 });
  if (user.permLevel < board.minLevel) {
    return NextResponse.json({ success: false, message: 'Insufficient permission for this table.' }, { status: 403 });
  }
  if (board.readOnly) {
    return NextResponse.json({ success: false, message: board.readOnlyReason ?? 'This table is read-only here.' }, { status: 403 });
  }
  if (board.noCreate) {
    return NextResponse.json({ success: false, message: 'Records on this table can\'t be created here.' }, { status: 403 });
  }

  const data: Record<string, unknown> = {};
  const rawData = body.data ?? {};
  for (const [col, def] of Object.entries(board.columns)) {
    if ((def.editableOnCreate ?? true) === false && col !== board.primaryKey) continue;
    if (def.minLevel && user.permLevel < def.minLevel) continue;
    if (!(col in rawData)) continue;
    data[col] = coerceValue(def, rawData[col]);
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ success: false, message: 'No valid fields supplied.' });
  }

  const supabase = await createClient();
  const { error } = await supabase.from(board.table).insert(data);
  if (error) return NextResponse.json({ success: false, message: error.message });
  return NextResponse.json({ success: true });
}

export async function PUT(req: NextRequest) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const tableKey: string = body.table ?? '';
  const board = boardFor(tableKey);
  if (!board) return NextResponse.json({ success: false, message: 'Unknown or unavailable table.' }, { status: 400 });
  if (user.permLevel < board.minLevel) {
    return NextResponse.json({ success: false, message: 'Insufficient permission for this table.' }, { status: 403 });
  }
  if (board.readOnly) {
    return NextResponse.json({ success: false, message: board.readOnlyReason ?? 'This table is read-only here.' }, { status: 403 });
  }

  const pkVal = body.pk;
  if (pkVal === null || pkVal === undefined) {
    return NextResponse.json({ success: false, message: 'Missing primary key value.' });
  }

  const supabase = await createClient();

  // Row-specific guard ported from admin_records.php: once a staff member is Manager/Admin
  // rank (perm 15+), only an Admin (20) may change staff_rank further. Only relevant for the
  // staff_directory board, which is joined and handled in its own route — kept here as a
  // no-op safeguard in case that ever changes.

  const rawData = body.data ?? {};
  const data: Record<string, unknown> = {};
  for (const [col, def] of Object.entries(board.columns)) {
    if (col === board.primaryKey) continue;
    if ((def.editableOnUpdate ?? true) === false) continue;
    if (def.minLevel && user.permLevel < def.minLevel) continue;
    if (!(col in rawData)) continue;
    data[col] = coerceValue(def, rawData[col]);
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ success: false, message: 'No editable fields supplied.' });
  }

  // Site Scripts gets a free version-history snapshot on every save, ported here rather than
  // into a bespoke route since everything else about this board is plain generic CRUD.
  if (board.table === 'site_scripts' && 'content' in data) {
    const { data: before } = await supabase.from('site_scripts').select('content').eq('script_key', pkVal).maybeSingle();
    if (before) {
      await supabase.from('site_scripts_history').insert({
        script_key: pkVal,
        content: before.content,
        saved_by: user.id,
      });
    }
    data.updated_at = new Date().toISOString();
  }

  const { error } = await supabase.from(board.table).update(data).eq(board.primaryKey, pkVal);
  if (error) return NextResponse.json({ success: false, message: error.message });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const tableKey: string = body.table ?? '';
  const board = boardFor(tableKey);
  if (!board) return NextResponse.json({ success: false, message: 'Unknown or unavailable table.' }, { status: 400 });
  if (user.permLevel < board.minLevel) {
    return NextResponse.json({ success: false, message: 'Insufficient permission for this table.' }, { status: 403 });
  }
  if (board.readOnly) {
    return NextResponse.json({ success: false, message: board.readOnlyReason ?? 'This table is read-only here.' }, { status: 403 });
  }
  if (board.noDelete) {
    return NextResponse.json({ success: false, message: 'Records on this table can\'t be deleted here.' }, { status: 403 });
  }

  const pkVal = body.pk;
  if (pkVal === null || pkVal === undefined) {
    return NextResponse.json({ success: false, message: 'Missing primary key value.' });
  }

  const supabase = await createClient();
  const { error } = await supabase.from(board.table).delete().eq(board.primaryKey, pkVal);
  if (error) return NextResponse.json({ success: false, message: error.message });
  return NextResponse.json({ success: true });
}
