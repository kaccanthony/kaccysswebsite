'use client';
// FILE: app/(app)/LiveStatusPill.tsx
// Shared between AppShell's header and the /active page's own status row.
// Both read the SAME context value, so they can never disagree.

import { useLiveSession } from './LiveSessionContext';
import { formatSyncNote } from '@/lib/formatSyncNote';

export default function LiveStatusPill() {
  const { status, now } = useLiveSession();

  if (!status) return null; // nothing has reported in yet — render nothing rather than guess

  if (!status.active) {
    return (
      <span className="live-pill live-pill-off">
        <span className="live-dot off" /> No Active Session
      </span>
    );
  }

  return (
    <div className="live-status">
      <span className="live-pill">
        <span className="live-dot" /> LIVE SESSION
      </span>
      <span className="sync-note">{formatSyncNote(now - status.lastChangeAt)}</span>
    </div>
  );
}