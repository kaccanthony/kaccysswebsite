import { getPublicStaffMember } from '@/lib/staff';

export async function GET(_request: Request, context: { params: Promise<{ member: string }> }) {
  try {
    const { member } = await context.params;
    const profile = await getPublicStaffMember(decodeURIComponent(member));
    return profile ? Response.json(profile) : Response.json({ error: 'Staff member not found' }, { status: 404 });
  } catch (error) {
    console.error('Public staff profile failed', error);
    return Response.json({ error: 'Staff profile unavailable' }, { status: 503 });
  }
}
