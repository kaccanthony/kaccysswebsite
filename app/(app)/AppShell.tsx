'use client';
// FILE: app/(app)/AppShell.tsx

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { ICONS } from '@/lib/icons';
import { getRoleColor } from '@/lib/roles';
import { LiveSessionProvider } from './LiveSessionContext';
import LiveStatusPill from './LiveStatusPill';
import './appshell.css';

export interface AssignedSession {
  sessionId: number;
  label: string; // e.g. "Aug 4, 20:00 BST — Host"
}

export interface AppShellUser {
  username: string;
  role: string; // formatted display role, e.g. "[OM] Operations Manager"
  avatarUrl: string | null;
  rawRole: string;
  isAdmin: boolean;
  adminRole: string | null;
}

interface AppShellProps {
  user: AppShellUser;
  assignedSessions: AssignedSession[];
  children: React.ReactNode;
}

export default function AppShell(props: AppShellProps) {
  return (
    <LiveSessionProvider>
      <AppShellInner {...props} />
    </LiveSessionProvider>
  );
}

function AppShellInner({ user, assignedSessions, children }: AppShellProps) {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);
  const hoverHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverRevealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const isActiveRoute = pathname === '/active';
  const roleColor = getRoleColor(user.rawRole, user.isAdmin, user.adminRole);

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

  // ── Hide header on scroll-down, reveal on scroll-up ──
  useEffect(() => {
    lastScrollY.current = window.scrollY;

    function onScroll() {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        const currentY = window.scrollY;
        const delta = currentY - lastScrollY.current;

        // ignore tiny jitters; only react to a deliberate scroll in one direction
        if (delta > 6 && currentY > 96) {
          setHidden(true);
          setOpen(false); // don't leave the popup floating with no header
          lastScrollY.current = currentY;
        } else if (delta < -6) {
          setHidden(false);
          lastScrollY.current = currentY;
        }
        ticking.current = false;
      });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // ── Hover the very top edge of the screen to hide/reveal manually ──
  function handleTopEdgeEnter() {
    if (hidden) {
      hoverRevealTimer.current = setTimeout(() => setHidden(false), 250);
    } else {
      hoverHideTimer.current = setTimeout(() => {
        setHidden(true);
        setOpen(false);
      }, 1000);
    }
  }

  function handleTopEdgeLeave() {
    if (hoverHideTimer.current) {
      clearTimeout(hoverHideTimer.current);
      hoverHideTimer.current = null;
    }
    if (hoverRevealTimer.current) {
      clearTimeout(hoverRevealTimer.current);
      hoverRevealTimer.current = null;
    }
  }

  // clear any pending hover timers on unmount
  useEffect(() => {
    return () => {
      if (hoverHideTimer.current) clearTimeout(hoverHideTimer.current);
      if (hoverRevealTimer.current) clearTimeout(hoverRevealTimer.current);
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

      <div className="topbar-hover-zone" onMouseEnter={handleTopEdgeEnter} onMouseLeave={handleTopEdgeLeave} />

      <header className={`topbar${hidden ? ' topbar-hidden' : ''}`}>
        <Link href="/dashboard" className="logo-link">
          <div className="logo-wrap">
            <div className="pulse-ring" />
            <div className="pulse-ring ring2" />
            <img src="/images/YSSLogo.png" alt="YSS Logo" className="logo-img" draggable={false} />
          </div>
          <span className="app-name">YSS Central</span>
        </Link>

        <div className="topbar-right">
          {isActiveRoute && <LiveStatusPill />}

          <button
            ref={btnRef}
            className="profile-btn"
            aria-label="Profile menu"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((o) => !o);
            }}
          >
            <div className="avatar" style={{ background: roleColor }}>
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
              <div className="popup-avatar" style={{ background: roleColor }}>
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