'use client';
// FILE: app/(app)/AppShell.tsx

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUserTie } from '@fortawesome/free-solid-svg-icons';
import { ICONS } from '@/lib/icons';
import { getRoleColor } from '@/lib/roles';
import { labelForRank } from '@/lib/viewAs/rankMap';
import { stopViewAs } from '@/app/actions/viewAs';
import { LiveSessionProvider } from './LiveSessionContext';
import LiveStatusPill from './LiveStatusPill';
import type { ViewAsState } from '@/lib/getCurrentUser';
import './appshell.css';

export interface AssignedSession {
  sessionId: number;
  label: string;
}

export interface AppShellUser {
  username: string;
  role: string;
  avatarUrl: string | null;
  rawRole: string;
  isAdmin: boolean;
  adminRole: string | null;
}

interface AppShellProps {
  user: AppShellUser;
  assignedSessions: AssignedSession[];
  unreadCount: number;
  /** Real identity is never touched by this — it just drives the centered "Viewing as X" pill. */
  viewingAs?: ViewAsState | null;
  /** Server-computed: does the viewer have a live session right now? Seeds the topbar
   * pill so it's correct on every page load, not just after /active's own poller runs. */
  hasLiveSession?: boolean;
  /** Persisted session_ongoing.last_updated timestamp (epoch ms). */
  liveSessionLastChangeAt?: number | null;
  children: React.ReactNode;
}

export default function AppShell(props: AppShellProps) {
  const { hasLiveSession = false, liveSessionLastChangeAt = null, ...rest } = props;
  return (
    <LiveSessionProvider initialStatus={{
      active: hasLiveSession,
      lastChangeAt: liveSessionLastChangeAt ?? Date.now(),
    }}>
      <AppShellInner {...rest} />
    </LiveSessionProvider>
  );
}

function AppShellInner({ user, assignedSessions, unreadCount, viewingAs = null, children }: AppShellProps) {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [exitingViewAs, setExitingViewAs] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);
  const hoverHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverRevealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  const roleColor = getRoleColor(user.rawRole, user.isAdmin, user.adminRole);

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

  useEffect(() => {
    lastScrollY.current = window.scrollY;
    function onScroll() {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        const currentY = window.scrollY;
        const delta = currentY - lastScrollY.current;
        if (delta > 6 && currentY > 96) {
          setHidden(true);
          setOpen(false);
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
    if (hoverHideTimer.current) { clearTimeout(hoverHideTimer.current); hoverHideTimer.current = null; }
    if (hoverRevealTimer.current) { clearTimeout(hoverRevealTimer.current); hoverRevealTimer.current = null; }
  }
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

  async function handleExitViewAs() {
    setExitingViewAs(true);
    await stopViewAs();
    router.refresh();
    setExitingViewAs(false);
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

        {viewingAs && (
          <div className="topbar-center">
            <div className="viewas-pill">
              <FontAwesomeIcon icon={faUserTie} />
              Viewing as {labelForRank(viewingAs.rank)}
              <button className="viewas-exit" disabled={exitingViewAs} onClick={handleExitViewAs}>
                Exit
              </button>
            </div>
          </div>
        )}

        <div className="topbar-right">
          {/* No longer gated to isActiveRoute — status is now seeded server-side (see
              layout.tsx's hasLiveSession), so it's correct on every page, not just /active. */}
          <LiveStatusPill />
          <Link href="/notifications" className="bell-btn" aria-label="Notifications">

            <FontAwesomeIcon icon={ICONS.bell} />

            {unreadCount > 0 && (

              <span className="bell-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>

            )}

          </Link>
          <button
            ref={btnRef}
            className="profile-btn"
            aria-label="Profile menu"
            onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
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
                <span className="session-pill"><FontAwesomeIcon icon={ICONS.circleDot} /> No assigned sessions</span>
              ) : (
                assignedSessions.map((s) => (
                  <span key={s.sessionId} className="session-pill">
                    <FontAwesomeIcon icon={ICONS.circleDot} /> {s.label}
                  </span>
                ))
              )}
            </div>

            <div className="popup-divider" />
            <a href="/settings" className="popup-item"><FontAwesomeIcon icon={ICONS.gear} /> Settings</a>
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
