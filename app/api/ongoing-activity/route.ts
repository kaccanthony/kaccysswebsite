import { createAdminClient } from '@/utils/supabase/admin';
import { getOngoingActivity } from '@/lib/ongoingActivity';

export async function GET() {
  // Only public activity names and IDs are returned, including to guest viewers.
  const activity = await getOngoingActivity(createAdminClient());
  return Response.json(activity, { headers: { 'Cache-Control': 'no-store' } });
}
