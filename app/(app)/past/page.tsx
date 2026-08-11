// FILE: app/(app)/past/page.tsx
import { getCurrentUser } from '@/lib/getCurrentUser';
import { getPastSessions } from '@/lib/pastSessions';
import PastSessionsClient from './PastSessionsClient';

export const metadata = {
  title: 'Past Sessions',
};

export default async function PastSessionsPage() {
  await getCurrentUser(); // redirects to /login internally if not signed in
  const sessions = await getPastSessions();

  return <PastSessionsClient sessions={sessions} />;
}