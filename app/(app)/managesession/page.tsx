// FILE: app/(app)/managesession/page.tsx
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/getCurrentUser';

export const metadata = {
  title: 'Manage Sessions',
};

export default async function ManageSessionPage() {
  const user = await getCurrentUser();

  // Same gate as managesession.php: perm_level >= 10
  if (user.permLevel < 10) {
    redirect('/dashboard');
  }

  return (
    <>
      <h1 className="section-label">Manage Sessions</h1>
      <p className="section-sub">
        Placeholder — the full add/edit/delete session form (modal, staff dropdowns, trainee slots)
        is the next thing to build here.
      </p>
    </>
  );
}