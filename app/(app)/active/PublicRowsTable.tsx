'use client';
// FILE: app/active/PublicRowsTable.tsx
// Replaces the refreshPublicTable() polling loop from active.js.

import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheckCircle, faCircle } from '@fortawesome/free-solid-svg-icons';
import type { PublicSessionRow } from '@/lib/activeSession';

export default function PublicRowsTable({
  sessionId,
  initialRows,
}: {
  sessionId: number;
  initialRows: PublicSessionRow[];
}) {
  const [rows, setRows] = useState<PublicSessionRow[]>(initialRows);

  useEffect(() => {
    if (!sessionId) return;

    async function refresh() {
      try {
        const res = await fetch(`/api/active-session-state?session_id=${sessionId}`);
        const data = await res.json();
        setRows(data.rows ?? []);
      } catch {
        // silent — just retry next poll (same as the PHP version)
      }
    }

    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
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