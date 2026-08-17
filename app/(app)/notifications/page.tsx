// FILE: app/(app)/notifications/page.tsx
import { getCurrentUser } from '@/lib/getCurrentUser';
import { getNotificationsForCurrentUser } from '@/lib/notifications';
import NotificationsClient from './NotificationsClient';
import './notifications.css';

export const metadata = { title: 'Notifications' };

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  const notifications = await getNotificationsForCurrentUser(user.id);

  return (
    <main className="main">
      <NotificationsClient notifications={notifications} />
    </main>
  );
}