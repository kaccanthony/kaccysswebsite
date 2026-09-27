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
import { useLiveSessionActions } from '../LiveSessionContext';

export default function PublicRowsTable({
  sessionId,
  initialRows,
  initialLastChangeAt,
}: {
  sessionId: number;
  initialRows: PublicSessionRow[];
  initialLastChangeAt: number | null;
}) {
  const [rows, setRows] = useState<PublicSessionRow[]>(initialRows);
  const { reportActive } = useLiveSessionActions();
  const lastSnapshot = useRef(JSON.stringify(initialRows));
  const lastDatabaseChange = useRef(initialLastChangeAt);

  useEffect(() => {
    if (!sessionId) return;
    let pending = false;
    let disposed = false;
    let controller: AbortController | null = null;

    // the server just gave us fresh data for this render — that counts as a change
    reportActive(false, initialLastChangeAt ?? undefined);

    async function refresh() {
      if (pending) return;
      pending = true;
      controller = new AbortController();
      try {
        const res = await fetch(`/api/active-session-state?session_id=${sessionId}`, { signal: controller.signal });
        const data = await res.json();
        if (disposed) return;
        const newRows: PublicSessionRow[] = data.rows ?? [];
        const snapshot = JSON.stringify(newRows);
        const databaseChange = typeof data.lastChangeAt === 'number' ? data.lastChangeAt : null;
        const changed = databaseChange !== null
          ? databaseChange !== lastDatabaseChange.current
          : snapshot !== lastSnapshot.current;
        const rowsChanged = snapshot !== lastSnapshot.current;
        lastSnapshot.current = snapshot;
        lastDatabaseChange.current = databaseChange;

        if (rowsChanged) setRows(newRows);
        reportActive(changed, databaseChange ?? undefined);
      } catch {
        // silent — just retry next poll (same as the PHP version).
        // Note: we deliberately do NOT call reportActive() here, since a
        // failed poll means we don't actually know anything changed — the
        // sync note will correctly keep counting up from the last real change.
      } finally {
        pending = false;
        controller = null;
      }
    }

    const interval = setInterval(refresh, 5000);
    return () => {
      disposed = true;
      controller?.abort();
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reportActive only touches stable setState fns
  }, [sessionId]);

  return (
    <>
      <tbody id="public-rows">
      {rows.filter((row) => row.group === 'allocated').map((r) => (
        <tr key={r.key}>
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
      <tbody className="reserved-rows">
        <tr className="row-group-title"><th colSpan={6}>Standby / Reserved</th></tr>
        {rows.filter((row) => row.group === 'reserved').map((r) => (
          <tr key={r.key}>
            <td>{r.slot}</td>
            <td>{r.discord || '-'}</td>
            <td>{r.roblox || '-'}</td>
            <td>{r.zone ?? '-'}</td>
            <td>{r.trainer || '-'}</td>
            <td className="chk-cell">
              {r.done ? <FontAwesomeIcon icon={faCheckCircle} className="done" /> : <FontAwesomeIcon icon={faCircle} />}
            </td>
          </tr>
        ))}
        {rows.every((row) => row.group !== 'reserved') && (
          <tr><td colSpan={6} className="reserved-empty">No standby, reserved, or unallocated trainees.</td></tr>
        )}
      </tbody>
    </>
  );
}
