import { getPublicStaff } from '@/lib/staff';

export async function GET() {
  try {
    return Response.json(await getPublicStaff());
  } catch (error) {
    console.error('Public staff directory failed', error);
    return Response.json({ error: 'Staff directory unavailable' }, { status: 503 });
  }
}
