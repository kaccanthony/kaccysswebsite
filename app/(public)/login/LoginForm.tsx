'use client';
// FILE: app/(public)/login/LoginForm.tsx

import { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { createClient } from '@/utils/supabase/client';
import { ICONS } from '@/lib/icons';

export default function LoginForm() {
  const glowRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Ported from login.js: lagging background glow blob ──
  useEffect(() => {
    const blob = glowRef.current;
    if (!blob) return;

    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let blobX = mouseX;
    let blobY = mouseY;
    let frame: number;

    const LERP = 0.07; // lower = more lag (0.04 dreamy · 0.07 default · 0.15 snappy)

    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };

    const animate = () => {
      blobX += (mouseX - blobX) * LERP;
      blobY += (mouseY - blobY) * LERP;
      blob.style.left = `${blobX}px`;
      blob.style.top = `${blobY}px`;
      frame = requestAnimationFrame(animate);
    };

    document.addEventListener('mousemove', handleMouseMove);
    animate();

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(frame);
    };
  }, []);

  async function handleDiscordSignIn() {
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        // queryParams.scope alone — having both this AND options.scopes set
        // may have been causing Supabase to merge rather than replace.
        queryParams: {
          scope: 'identify guilds.members.read',
        },
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    }
    // On success the browser navigates away to Discord — nothing else to do here.
  }

  return (
    <>
      <div id="bg-glow" ref={glowRef} />

      <div className="card login-card">
        <h1>Yoshi&apos;s Signalling Server Web</h1>
        <p className="subtitle">Sign in to continue</p>

        {error && <div className="alert alert-error">{error}</div>}

        <button
          type="button"
          className={`btn-login btn-discord${loading ? ' is-loading' : ''}`}
          onClick={handleDiscordSignIn}
          disabled={loading}
        >
          <FontAwesomeIcon icon={ICONS.discord} />
          {loading ? ' Redirecting…' : ' Continue with Discord'}
        </button>

        <p className="login-note">
          First time here? Signing in with Discord creates your account automatically.
          You can link your Roblox account afterward from your dashboard settings.
        </p>
      </div>
    </>
  );
}