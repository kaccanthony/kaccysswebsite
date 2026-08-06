// Paused in development
// FILE: app/auth/roblox/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const params = new URLSearchParams({
    client_id: process.env.ROBLOX_CLIENT_ID!,
    redirect_uri: `${origin}/auth/roblox/callback`,
    response_type: 'code',
    scope: 'openid profile',
  });

  return NextResponse.redirect(`https://apis.roblox.com/oauth/v2/authorize?${params}`);
}