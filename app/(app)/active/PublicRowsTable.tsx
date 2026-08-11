'use client';
// FILE: app/(app)/active/PublicRowsTable.tsx
// Replaces the refreshPublicTable() polling loop from active.js.
// Now also the single source of truth for "is this session live, and when
// did the data last actually change" — reported up via LiveSessionContext so
// both the header pill and this page's own status pill read the same value.

import { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheckCircle, faCircle } from '@fortawesome/free-solid-svg-icons';
import type { PublicSessionRow } from '@/lib/activeSession';
import { useLiveSession } from '../LiveSessionContext';

export default function PublicRowsTable({
  sessionId,
  initialRows,
}: {
  sessionId: number;
  initialRows: PublicSessionRow[];
}) {
  const [rows, setRows] = useState<PublicSessionRow[]>(initialRows);
  const { reportActive } = useLiveSession();
  const lastSnapshot = useRef(JSON.stringify(initialRows));

  useEffect(() => {
    if (!sessionId) return;

    // the server just gave us fresh data for this render — that counts as a change
    reportActive(true);

    async function refresh() {
      try {
        const res = await fetch(`/api/active-session-state?session_id=${sessionId}`);
        const data = await res.json();
        const newRows: PublicSessionRow[] = data.rows ?? [];
        const snapshot = JSON.stringify(newRows);
        const changed = snapshot !== lastSnapshot.current;
        lastSnapshot.current = snapshot;

        setRows(newRows);
        reportActive(changed); // only bumps "last change" when the data actually differs
      } catch {
        // silent — just retry next poll (same as the PHP version).
        // Note: we deliberately do NOT call reportActive() here, since a
        // failed poll means we don't actually know anything changed — the
        // sync note will correctly keep counting up from the last real change.
      }
    }

    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reportActive only touches stable setState fns
  }, [sessionId]);

  return (
    <tbody id="public-rows">
      {rows.map((r) => (
        <tr key={r.slot}>
          <td>{r.slot}</td>
          <td>{r.discord}</td>
          <td>{r.roblox}</td>
          <td>{r.zone ?? '—'}</td>
          <td>{r.trainer || '—'}</td>
          <td className="chk-cell">
            {r.done ? (
              <FontAwesomeIcon icon={faCheckCircle} className="done" />
            ) : (
              <FontAwesomeIcon icon={faCircle} />
            )}
          </td>
        </tr>
      ))}
    </tbody>
  );
}