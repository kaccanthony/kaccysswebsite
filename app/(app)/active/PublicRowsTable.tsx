'use client';
// FILE: app/(app)/active/PublicRowsTable.tsx
// Refreshes the public trainee table when the database broadcasts a change.

import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheckCircle, faCircle } from '@fortawesome/free-solid-svg-icons';
import type { PublicSessionRow } from '@/lib/activeSession';
import { createClient } from '@/utils/supabase/client';

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
    let disposed = false;
    let pending = false;
    let refreshAgain = false;

    async function refresh() {
      if (pending) { refreshAgain = true; return; }
      pending = true;
      do {
        refreshAgain = false;
        try {
          const res = await fetch(`/api/active-session-state?session_id=${sessionId}`, { cache: 'no-store' });
          if (!res.ok || disposed) continue;
          const data = await res.json();
          if (!disposed) setRows(data.rows ?? []);
        } catch { /* Keep the last known rows until the next change. */ }
      } while (refreshAgain && !disposed);
      pending = false;
    }

    const supabase = createClient();
    const broadcast = supabase.channel('public-active-state', { config: { private: false } })
      .on('broadcast', { event: 'changed' }, (payload) => {
        const changedId = Number(payload.payload?.session_id);
        if (changedId === sessionId) void refresh();
      })
      .subscribe((status) => { if (status === 'SUBSCRIBED') void refresh(); });
    const rowsChannel = supabase.channel(`public-active-rows-${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'session_ongoing', filter: `session_id=eq.${sessionId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'session_trainees', filter: `session_id=eq.${sessionId}` }, refresh)
      .subscribe();
    window.addEventListener('online', refresh);
    return () => {
      disposed = true;
      window.removeEventListener('online', refresh);
      void supabase.removeChannel(broadcast);
      void supabase.removeChannel(rowsChannel);
    };
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
