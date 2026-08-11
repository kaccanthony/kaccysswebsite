// FILE: app/(app)/upcoming/page.tsx
import { getCurrentUser } from '@/lib/getCurrentUser';
import { getUpcomingSessions } from '@/lib/upcomingSessions';
import UpcomingSessionsClient from './UpcomingSessionsClient';

export const metadata = {
  title: 'Upcoming Sessions',
};

export default async function UpcomingSessionsPage() {
  await getCurrentUser(); // redirects to /login internally if not signed in — open to any signed-in account
  const sessions = await getUpcomingSessions();

  return <UpcomingSessionsClient sessions={sessions} />;
}