'use client';
// FILE: app/(app)/active/LiveStatus.tsx
// Small ticking "LIVE SESSION · synced Xs ago" indicator. Resets on the same
// 5s cadence as PublicRowsTable's polling interval, so it visually tracks it
// without the two components needing to share state directly.

import { useEffect, useState } from 'react';

export default function LiveStatus({ sessionId }: { sessionId: number }) {
  const [secondsAgo, setSecondsAgo] = useState(0);

  useEffect(() => {
    setSecondsAgo(0);
    const tick = setInterval(() => setSecondsAgo((s) => s + 1), 1000);
    const resync = setInterval(() => setSecondsAgo(0), 5000); // matches PublicRowsTable's poll interval
    return () => {
      clearInterval(tick);
      clearInterval(resync);
    };
  }, [sessionId]);

  return (
    <div className="live-status">
      <span className="live-pill">
        <span className="live-dot" /> LIVE SESSION
      </span>
      <span className="sync-note">synced {secondsAgo}s ago</span>
    </div>
  );
}