// FILE: app/(public)/login/page.tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import LoginForm from './LoginForm';

export const metadata = {
  title: 'Login',
  description: 'Sign in to YSS with your Discord account and Roblox account.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let discordUsername: string | null = null;
  let discordAvatarUrl: string | null = null;
  let robloxUsername: string | null = null;

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('discord_username, discord_avatar_url, roblox_username')
      .eq('id', user.id)
      .single();

    discordUsername = profile?.discord_username ?? null;
    discordAvatarUrl = profile?.discord_avatar_url ?? null;
    robloxUsername = profile?.roblox_username ?? null;

    if (discordUsername && robloxUsername) {
      redirect('/dashboard'); // both steps done, nothing left to do here
    }
  }

  const params = await searchParams;

  return (
    <main className="login-page">
      <LoginForm
        discordUsername={discordUsername}
        discordAvatarUrl={discordAvatarUrl}
        error={params.error}
      />
    </main>
  );
}