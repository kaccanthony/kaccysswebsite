import { getCurrentUser } from '@/lib/getCurrentUser';
import { getUpcomingSessions } from '@/lib/upcomingSessions';
import { getUpcomingEvents } from '@/lib/upcomingEvents';
import UpcomingSessionsClient from '../upcomingsesh/UpcomingSessionsClient';

export const metadata = { title: 'Upcoming Sessions & Events' };

export default async function UpcomingPage() {
  await getCurrentUser();
  const [sessions, events] = await Promise.all([getUpcomingSessions(), getUpcomingEvents()]);
  return <UpcomingSessionsClient sessions={sessions} events={events} />;
}
