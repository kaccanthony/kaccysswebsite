'use client';
// FILE: app/(app)/AppShell.tsx

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { ICONS } from '@/lib/icons';
import './appshell.css';

export interface AssignedSession {
  sessionId: number;
  label: string; // e.g. "Aug 4, 20:00 BST — Host"
}

export interface AppShellUser {
  username: string;
  role: string; // formatted display role, e.g. "[OM] Operations Manager"
  avatarUrl: string | null;
}

export default function AppShell({
  user,
  assignedSessions,
  children,
}: {
  user: AppShellUser;
  assignedSessions: AssignedSession[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  // ── Ported from dashboard.js: close on outside click / Escape ──
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        popupRef.current &&
        btnRef.current &&
        !popupRef.current.contains(e.target as Node) &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <>
      <div className="bg-app" />

      <header className="topbar">
        <Link href="/dashboard" className="logo-link">
          <div className="logo-wrap">
            <div className="pulse-ring" />
            <div className="pulse-ring ring2" />
            <img src="/images/YSSLogo.png" alt="YSS Logo" className="logo-img" draggable={false} />
          </div>
          <span className="app-name">YSS Central</span>
        </Link>

        <div className="topbar-right">
          <button
            ref={btnRef}
            className="profile-btn"
            aria-label="Profile menu"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((o) => !o);
            }}
          >
            <div className="avatar">
              {user.avatarUrl ? <img src={user.avatarUrl} alt="Avatar" draggable={false} /> : <FontAwesomeIcon icon={ICONS.user} />}
            </div>
            <div className="profile-meta">
              <span className="profile-name">{user.username}</span>
              <span className="profile-role">{user.role}</span>
            </div>
            <FontAwesomeIcon icon={ICONS.chevronDown} className={`chev${open ? ' open' : ''}`} />
          </button>

          <div ref={popupRef} className={`profile-popup${open ? ' open' : ''}`}>
            <div className="popup-header">
              <div className="popup-avatar">
                {user.avatarUrl ? <img src={user.avatarUrl} alt="Avatar" draggable={false} /> : <FontAwesomeIcon icon={ICONS.user} />}
              </div>
              <div>
                <div className="popup-name">{user.username}</div>
                <div className="popup-role">{user.role}</div>
              </div>
            </div>

            <div className="popup-section-label">Assigned Sessions</div>
            <div className="popup-sessions">
              {assignedSessions.length === 0 ? (
                <span className="session-pill">
                  <FontAwesomeIcon icon={ICONS.circleDot} /> No active sessions
                </span>
              ) : (
                assignedSessions.map((s) => (
                  <span key={s.sessionId} className="session-pill">
                    <FontAwesomeIcon icon={ICONS.circleDot} /> {s.label}
                  </span>
                ))
              )}
            </div>

            <div className="popup-divider" />
            <a href="/notifications" className="popup-item">
              <FontAwesomeIcon icon={ICONS.bell} /> Notifications
            </a>
            <a href="/settings" className="popup-item">
              <FontAwesomeIcon icon={ICONS.gear} /> Settings
            </a>
            <button className="popup-item danger" onClick={handleLogout}>
              <FontAwesomeIcon icon={ICONS.signOut} /> Log out
            </button>
          </div>
        </div>
      </header>

      <main className="main">{children}</main>
    </>
  );
}