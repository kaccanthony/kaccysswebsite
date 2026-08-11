'use client';
// FILE: app/(public)/login/LoginForm.tsx

import { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleCheck } from '@fortawesome/free-solid-svg-icons';
import { createClient } from '@/utils/supabase/client';
import { ICONS } from '@/lib/icons';

export default function LoginForm({
  discordUsername,
  discordAvatarUrl,
  error: initialError,
}: {
  discordUsername: string | null;
  discordAvatarUrl: string | null;
  error?: string;
}) {
  const glowRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [consented, setConsented] = useState(false);

  const discordDone = !!discordUsername;

  // ── Ported from login.js: lagging background glow blob ──
  useEffect(() => {
    const blob = glowRef.current;
    if (!blob) return;

    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let blobX = mouseX;
    let blobY = mouseY;
    let frame: number;

    const LERP = 0.07;

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
        queryParams: {
          scope: 'identify guilds guilds.join guilds.members.read',
        },
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    }
  }

  function handleRobloxSignIn() {
    setLoading(true);
    setError(null);
    window.location.href = '/auth/roblox';
  }

  return (
    <>
      <div id="bg-glow" ref={glowRef} />

      <div className="card login-card">
        <h1>Yoshi&apos;s Signalling Server Web</h1>
        <p className="subtitle">Sign in to continue</p>

        {error && <div className="alert alert-error">{error}</div>}

        {!discordDone && (
          <label className="consent-row">
            <input type="checkbox" checked={consented} onChange={(e) => setConsented(e.target.checked)} />
            <span>
              I agree to the <a href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a> and{' '}
              <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
            </span>
          </label>
        )}

        <div className="login-steps">
          {/* ── Step 1: Discord ── */}
          {discordDone ? (
            <div className="login-step-done">
              <div className="login-step-avatar">
                {discordAvatarUrl ? <img src={discordAvatarUrl} alt="" draggable={false} /> : <FontAwesomeIcon icon={ICONS.user} />}
              </div>
              <div className="login-step-done-text">
                <span className="login-step-label">Discord connected</span>
                <span className="login-step-name">{discordUsername}</span>
              </div>
              <FontAwesomeIcon icon={faCircleCheck} className="login-step-check" />
            </div>
          ) : (
            <button
              type="button"
              className={`btn-login btn-discord${loading ? ' is-loading' : ''}`}
              onClick={handleDiscordSignIn}
              disabled={loading || !consented}
            >
              <FontAwesomeIcon icon={ICONS.discord} />
              {loading ? ' Redirecting…' : ' Continue with Discord'}
            </button>
          )}

          {/* ── Step 2: Roblox ── */}
          <button
            type="button"
            className={`btn-login btn-roblox${loading ? ' is-loading' : ''}`}
            onClick={handleRobloxSignIn}
            disabled={loading || !discordDone}
          >
            {loading && discordDone ? 'Redirecting…' : 'Continue with Roblox'}
          </button>
        </div>

        <p className="login-note">
          {discordDone
            ? 'Just Roblox left — both are required before you can access the dashboard.'
            : "You'll sign in with Discord, then link your Roblox account — both are required before you can access the dashboard."}
        </p>
      </div>
    </>
  );
}