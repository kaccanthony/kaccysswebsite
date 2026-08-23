'use client';
// FILE: app/(app)/LiveSessionContext.tsx
// Lets the /active page's polling component report real session status up to
// AppShell's header (and back down to the page's own status pill), so both
// places always agree instead of AppShell guessing from the URL alone.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export interface LiveSessionStatus {
  active: boolean;
  lastChangeAt: number; // epoch ms — only meaningful when active === true
}

interface LiveSessionContextValue {
  status: LiveSessionStatus | null; // null = not yet known (nothing has reported in)
  now: number; // ticks once per second while a session is active
  /** Call on every successful poll. Pass changed=true only when the data actually differs from before. */
  reportActive: (changed: boolean) => void;
  reportInactive: () => void;
}

const LiveSessionContext = createContext<LiveSessionContextValue>({
  status: null,
  now: Date.now(),
  reportActive: () => {},
  reportInactive: () => {},
});

export function LiveSessionProvider({
  children,
  initialStatus = null,
}: {
  children: ReactNode;
  /** Seeded from the server (layout.tsx) so the pill can render correctly on
   * every page immediately, instead of staying blank until a client-side
   * poller on /active happens to call reportActive() first. */
  initialStatus?: LiveSessionStatus | null;
}) {
  const [status, setStatus] = useState<LiveSessionStatus | null>(initialStatus);
  const [now, setNow] = useState(() => Date.now());

  // only tick while there's actually something live to count up from
  useEffect(() => {
    if (!status?.active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [status?.active]);

  function reportActive(changed: boolean) {
    setStatus((prev) => ({
      active: true,
      lastChangeAt: changed || !prev?.active ? Date.now() : prev.lastChangeAt,
    }));
    setNow(Date.now());
  }

  function reportInactive() {
    setStatus({ active: false, lastChangeAt: Date.now() });
  }

  return (
    <LiveSessionContext.Provider value={{ status, now, reportActive, reportInactive }}>
      {children}
    </LiveSessionContext.Provider>
  );
}

export function useLiveSession() {
  return useContext(LiveSessionContext);
}