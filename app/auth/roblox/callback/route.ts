// FILE: app/auth/roblox/callback/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getRobloxThumbnailUrl } from '@/lib/robloxThumbnails';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/login`);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent('Roblox authorization was cancelled.')}`);
  }

  // ── Exchange the authorization code for an access token ──
  const tokenRes = await fetch('https://apis.roblox.com/oauth/v1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.ROBLOX_CLIENT_ID!,
      client_secret: process.env.ROBLOX_CLIENT_SECRET!,
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${origin}/auth/roblox/callback`,
    }),
  });
  const token = await tokenRes.json();

  if (!token.access_token) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent('Could not authenticate with Roblox.')}`);
  }

  // ── Fetch the Roblox identity ──
  const userRes = await fetch('https://apis.roblox.com/oauth/v1/userinfo', {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  const robloxUser = await userRes.json();

  // Bust (chest-up, formal) instead of OAuth's own headshot claim — closer
  // crop than you want for the topbar. Full-body ('avatar' type) is fetched
  // on-demand later for things like a staff overview grid, not stored here,
  // since caching it would go stale the moment someone changes their avatar
  // without re-linking.
  const bustUrl = await getRobloxThumbnailUrl(robloxUser.sub, 'avatar-bust');

  await supabase
    .from('profiles')
    .update({
      roblox_id: robloxUser.sub,
      roblox_username: robloxUser.preferred_username ?? robloxUser.name,
      roblox_avatar_url: bustUrl ?? robloxUser.picture ?? null, // fall back to OAuth's headshot if the Thumbnails call fails
      roblox_verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  return NextResponse.redirect(`${origin}/dashboard?success=${encodeURIComponent('Roblox account linked.')}`);
}