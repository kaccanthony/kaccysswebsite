import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import LoginForm from './LoginForm';

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect('/dashboard');
  }

  return (
    <main className="login-page">
      <LoginForm />
    </main>
  );
}