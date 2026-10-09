// FILE: app/api/manage/directory/route.ts
// Old admin.js/managestaff.js had to merge staff_list + user_list + staff_archived into one
// id->name map because those were three separate MySQL tables. In the current schema every
// user (staff or not) is already one row in `profiles`, so this is a single query — archived
// staff are merged in afterwards only as a fallback for ids that no longer have a live profile.

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getApiUser } from '@/lib/apiAuth';

export async function GET() {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  if (user.permLevel < 15) {
    return NextResponse.json({ success: false, message: 'Insufficient permission.' }, { status: 403 });
  }

  const supabase = createAdminClient();
  const map: Record<string, string> = {};

  const { data: profiles } = await supabase.from('profiles').select('id, discord_id, discord_username');
  for (const p of profiles ?? []) {
    if (p.discord_username) {
      map[p.id] = p.discord_username;
      if (p.discord_id) map[p.discord_id] = p.discord_username;
    }
  }

  const { data: archived } = await supabase.from('staff_archived').select('staff_id, staff_display_name, staff_name');
  for (const a of archived ?? []) {
    const key = String(a.staff_id);
    if (!map[key]) map[key] = a.staff_display_name || a.staff_name || key;
  }

  return NextResponse.json({ success: true, directory: map });
}
