'use client';
// FILE: app/(app)/manage/ManageBoard.tsx
// Direct port of admin.js + managestaff.js into React/TS. UI/behavior is intentionally
// unchanged — same classes, same layout, same interactions. The only genuinely new thing is
// the optional Supabase Realtime subscription (see useEffect near the bottom) which quietly
// re-fetches the current board when someone else changes a row, instead of the old
// "you only see fresh data if you reload" behaviour.

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { createClient } from '@/utils/supabase/client';
import { MANAGE_ICONS } from '@/lib/manageIcons';
import { GROUP_ORDER, type BoardConfig, type ColumnDef } from '@/lib/manageTables';
import './manage.css';

const REALTIME_ENABLED = true; // flip off if you'd rather not run a channel per board

type Row = Record<string, any>;
type Groups = Record<string, [string, BoardConfig][]>;

const NOTIF_CATEGORIES = ['Session', 'Event', 'Website', 'System', 'Manager', 'Admin', 'Update'];
const NOTIF_CAT_CLASS: Record<string, string> = {
  Session: 'cat-session', Event: 'cat-event', Website: 'cat-website',
  System: 'cat-system', Manager: 'cat-manager', Admin: 'cat-admin', Update: 'cat-update',
};
const PILL_PALETTE_SIZE = 6;

function pillClassFor(value: unknown, options?: string[]) {
  if (Array.isArray(options)) {
    const idx = options.indexOf(String(value));
    return `ms-pill-${idx >= 0 ? idx % PILL_PALETTE_SIZE : 0}`;
  }
  let hash = 0;
  const str = String(value ?? '');
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return `ms-pill-${hash % PILL_PALETTE_SIZE}`;
}

function truncate(str: string, n: number) {
  return str.length > n ? str.slice(0, n) + '…' : str;
}

interface ToastMsg { id: number; message: string; type: 'success' | 'error'; show: boolean; }

export default function ManageBoard({ permLevel, groups }: { permLevel: number; groups: Groups }) {
  const supabase = useMemo(() => createClient(), []);

  const allBoards = useMemo(() => {
    const flat: [string, BoardConfig][] = [];
    for (const g of GROUP_ORDER) flat.push(...(groups[g] ?? []));
    return flat;
  }, [groups]);

  const [currentTable, setCurrentTable] = useState<string | null>(allBoards[0]?.[0] ?? null);
  const cfg: BoardConfig | null = currentTable ? allBoards.find(([k]) => k === currentTable)?.[1] ?? null : null;

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortState, setSortState] = useState<{ col: string | null; dir: 'default' | 'asc' | 'desc' }>({ col: null, dir: 'default' });
  const [directory, setDirectory] = useState<Record<string, string>>({});
  const [contentPhase, setContentPhase] = useState<'visible' | 'leaving' | 'entering'>('visible');

  const [recordModal, setRecordModal] = useState<{ open: boolean; row: Row | null }>({ open: false, row: null });
  const [composerOpen, setComposerOpen] = useState(false);
  const [confirmDeleteRow, setConfirmDeleteRow] = useState<Row | null>(null);
  const [toasts, setToasts] = useState<ToastMsg[]>([]);

  const sidebarRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ top: number; height: number; visible: boolean }>({ top: 0, height: 0, visible: false });

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, type, show: false }]);
    requestAnimationFrame(() => setToasts((t) => t.map((x) => (x.id === id ? { ...x, show: true } : x))));
    setTimeout(() => {
      setToasts((t) => t.map((x) => (x.id === id ? { ...x, show: false } : x)));
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 250);
    }, 3200);
  }, []);

  const endpointFor = (table: string) => (table === 'staff_directory' ? '/api/manage/staff-directory' : '/api/manage/records');

  const needsDirectory = (board: BoardConfig | null) => !!board && Object.values(board.columns).some((d) => d.resolveId);

  const loadDirectory = useCallback(async () => {
    try {
      const res = await fetch('/api/manage/directory');
      const data = await res.json();
      if (data.success) setDirectory(data.directory);
    } catch {
      /* resolveId columns just fall back to raw ids */
    }
  }, []);

  const loadBoard = useCallback(
    async (table: string, boardCfg: BoardConfig) => {
      setLoading(true);
      setLoadError(null);
      setContentPhase('leaving');
      try {
        const url = table === 'staff_directory' ? endpointFor(table) : `${endpointFor(table)}?table=${encodeURIComponent(table)}`;
        const res = await fetch(url);
        const data = await res.json();
        if (!data.success) {
          setLoadError(data.message || 'Failed to load.');
          setRows([]);
        } else {
          setRows(data.rows ?? []);
          if (needsDirectory(boardCfg)) await loadDirectory();
        }
      } catch (err) {
        setLoadError(String(err));
        setRows([]);
      } finally {
        setLoading(false);
        setTimeout(() => {
          setContentPhase('entering');
          requestAnimationFrame(() => setContentPhase('visible'));
        }, 160);
      }
    },
    [loadDirectory]
  );

  const selectBoard = (table: string) => {
    setCurrentTable(table);
    setSearchTerm('');
    setSortState({ col: null, dir: 'default' });
    const boardCfg = allBoards.find(([k]) => k === table)?.[1];
    if (boardCfg && !boardCfg.comingSoon) loadBoard(table, boardCfg);
  };

  useEffect(() => {
    if (currentTable && cfg && !cfg.comingSoon) loadBoard(currentTable, cfg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── sidebar sliding indicator ──
  useEffect(() => {
    const btn = sidebarRef.current?.querySelector<HTMLButtonElement>(`.ms-board-btn[data-table="${currentTable}"]`);
    const sidebar = sidebarRef.current;
    if (!btn || !sidebar) { setIndicator((i) => ({ ...i, visible: false })); return; }
    const sidebarRect = sidebar.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    setIndicator({ top: btnRect.top - sidebarRect.top, height: btnRect.height, visible: true });
  }, [currentTable, groups]);

  // ── Supabase Realtime: refresh the open board when its table changes underneath us ──
  useEffect(() => {
    if (!REALTIME_ENABLED || !cfg || cfg.comingSoon || cfg.readOnly) return;
    const physicalTable = currentTable === 'staff_directory' ? 'staff_profiles' : cfg.table;
    const channel = supabase
      .channel(`manage-${physicalTable}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: physicalTable }, () => {
        if (currentTable) loadBoard(currentTable, cfg);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTable]);

  // ── search / sort ──
  const filteredRows = useMemo(() => {
    if (!searchTerm) return rows;
    const term = searchTerm.toLowerCase();
    return rows.filter((row) => Object.values(row).some((v) => v !== null && v !== undefined && String(v).toLowerCase().includes(term)));
  }, [rows, searchTerm]);

  const sortedRows = useMemo(() => {
    if (!cfg || sortState.col === null || sortState.dir === 'default') return filteredRows;
    const def = cfg.columns[sortState.col];
    const sorted = [...filteredRows].sort((a, b) => {
      const av = a[sortState.col as string];
      const bv = b[sortState.col as string];
      if (def && (def.type === 'number' || def.type === 'bool')) return (Number(av) || 0) - (Number(bv) || 0);
      return String(av ?? '').toLowerCase().localeCompare(String(bv ?? '').toLowerCase());
    });
    return sortState.dir === 'desc' ? sorted.reverse() : sorted;
  }, [filteredRows, sortState, cfg]);

  const toggleSort = (col: string) => {
    setSortState((s) => {
      if (s.col !== col) return { col, dir: 'asc' };
      if (s.dir === 'asc') return { col, dir: 'desc' };
      if (s.dir === 'desc') return { col: null, dir: 'default' };
      return { col, dir: 'asc' };
    });
  };

  // ── record save/delete ──
  const saveRecord = async (data: Record<string, unknown>, isEdit: boolean, pk: unknown) => {
    if (!currentTable) return;
    try {
      const res = await fetch(endpointFor(currentTable), {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isEdit ? { table: currentTable, pk, data } : { table: currentTable, data }),
      });
      const result = await res.json();
      if (result.success) {
        showToast(isEdit ? 'Record updated.' : 'Record added.', 'success');
        setRecordModal({ open: false, row: null });
        if (cfg) loadBoard(currentTable, cfg);
      } else {
        showToast(result.message || 'Save failed.', 'error');
      }
    } catch {
      showToast('Save failed.', 'error');
    }
  };

  const doDelete = async () => {
    if (!currentTable || !cfg || !confirmDeleteRow) return;
    try {
      const res = await fetch(endpointFor(currentTable), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: currentTable, pk: confirmDeleteRow[cfg.primaryKey] }),
      });
      const result = await res.json();
      setConfirmDeleteRow(null);
      if (result.success) {
        showToast('Record deleted.', 'success');
        loadBoard(currentTable, cfg);
      } else {
        showToast(result.message || 'Delete failed.', 'error');
      }
    } catch {
      setConfirmDeleteRow(null);
      showToast('Delete failed.', 'error');
    }
  };

  const forceConcludeSession = async (sessionId: number) => {
    if (!confirm(`Force conclude session #${sessionId}? This archives it into the session logs and removes it from live sessions — this can't be undone.`)) return;
    try {
      const res = await fetch('/api/sessionongoing/conclude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      });
      const result = await res.json();
      if (result.success) {
        showToast(`Session #${sessionId} concluded.`, 'success');
        if (currentTable && cfg) loadBoard(currentTable, cfg);
      } else {
        showToast(result.message || 'Force conclude failed.', 'error');
      }
    } catch {
      showToast('Force conclude failed.', 'error');
    }
  };

  // ── cell formatting ──
  function displayValueFor(def: ColumnDef, value: any) {
    if (def.resolveId) {
      const resolved = directory[value];
      if (resolved) return { text: resolved, unresolved: false };
      return { text: value, unresolved: value !== null && value !== undefined && value !== '' };
    }
    return { text: value, unresolved: false };
  }

  function formatStaffRosterJson(raw: any) {
    let parsed: any;
    try { parsed = typeof raw === 'string' ? JSON.parse(raw) : raw; }
    catch { return <span title={String(raw)}>{truncate(String(raw), 40)}</span>; }
    const lines: React.ReactNode[] = [];
    if (Array.isArray(parsed)) {
      parsed.forEach((entry, i) => {
        if (entry && typeof entry === 'object') {
          const role = entry.role || entry.position || 'Staff';
          const name = entry.name || entry.discord || entry.display_name || entry.discordName || '—';
          lines.push(<div className="ms-json-line" key={i}><b>{role}:</b> {name}</div>);
        } else {
          lines.push(<div className="ms-json-line" key={i}>{String(entry)}</div>);
        }
      });
    } else if (parsed && typeof parsed === 'object') {
      Object.entries(parsed).forEach(([role, name], i) => {
        lines.push(<div className="ms-json-line" key={i}><b>{role}:</b> {typeof name === 'object' ? JSON.stringify(name) : String(name)}</div>);
      });
    }
    if (lines.length === 0) return <span style={{ color: 'rgba(255,255,255,.25)' }}>—</span>;
    return <div className="ms-json-summary">{lines}</div>;
  }

  function formatCellFor(col: string, def: ColumnDef, row: Row) {
    const { text: value, unresolved } = displayValueFor(def, row[col]);
    if (unresolved) {
      return <span className="ms-unresolved-id" title="No matching profile/archived record found">{String(value)}</span>;
    }
    if (def.type === 'discord_avatar') {
      if (!value) return <span style={{ color: 'rgba(255,255,255,.25)' }}>—</span>;
      // eslint-disable-next-line @next/next/no-img-element
      return <img className="ms-avatar-thumb" src={value} alt="Avatar" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />;
    }
    if (value === null || value === undefined || value === '') {
      return <span style={{ color: 'rgba(255,255,255,.25)' }}>—</span>;
    }
    switch (def.type) {
      case 'bool':
        return Number(value) || value === true
          ? <FontAwesomeIcon icon={MANAGE_ICONS.checkCircle} className="ms-bool-true" />
          : <FontAwesomeIcon icon={MANAGE_ICONS.timesCircle} className="ms-bool-false" />;
      case 'select':
      case 'text':
        if (def.pill) return <span className={`ms-pill ${pillClassFor(value, def.options)}`}>{String(value)}</span>;
        return String(value);
      case 'staff_roster_json':
        return formatStaffRosterJson(value);
      case 'textarea':
        return <span title={String(value)}>{truncate(String(value), 60)}</span>;
      default:
        return String(value);
    }
  }

  // ── record modal field builder ──
  function fieldEditableNow(def: ColumnDef, isEdit: boolean) {
    if (isEdit && def.editableOnUpdate === false) return false;
    if (!isEdit && def.editableOnCreate === false) return false;
    if (def.minLevel && permLevel < def.minLevel) return false;
    return true;
  }

  return (
    <>
      <div className="ms-layout">
        {/* ── Sidebar ── */}
        <aside className="ms-sidebar" ref={sidebarRef}>
          <div className="ms-board-indicator" style={{ transform: `translateY(${indicator.top}px)`, height: indicator.height, opacity: indicator.visible ? 1 : 0 }} />
          <div className="ms-sidebar-title">Manage {permLevel >= 20 ? 'Everything' : 'Staff'}</div>
          {GROUP_ORDER.map((groupName) => {
            const boards = groups[groupName] ?? [];
            if (boards.length === 0) return null;
            return (
              <div key={groupName}>
                <div className="ms-group-label">{groupName}</div>
                {boards.map(([key, board]) => (
                  <button
                    key={key}
                    type="button"
                    data-table={key}
                    className={`ms-board-btn ${board.comingSoon ? 'coming-soon' : ''} ${currentTable === key ? 'active' : ''}`}
                    onClick={() => selectBoard(key)}
                  >
                    <span className="ms-board-dot" />
                    {board.label}
                    {board.comingSoon && <span className="ms-soon-tag">Soon</span>}
                  </button>
                ))}
              </div>
            );
          })}
        </aside>

        {/* ── Main board area ── */}
        <main className="ms-main">
          <div className="ms-board-header">
            <div>
              <h1 className="ms-board-title">{cfg ? cfg.label : 'Select a board'}</h1>
              <p className="ms-board-sub">
                {!cfg
                  ? 'Pick something from the sidebar to get started.'
                  : cfg.comingSoon
                  ? "Not built yet."
                  : loading
                  ? 'Loading…'
                  : loadError
                  ? loadError
                  : searchTerm
                  ? `${sortedRows.length} of ${rows.length} record${rows.length === 1 ? '' : 's'} matching "${searchTerm}"`
                  : `${rows.length} record${rows.length === 1 ? '' : 's'}`}
              </p>
            </div>
            <div className="ms-board-header-actions">
              {cfg && !cfg.comingSoon && (
                <input
                  type="text"
                  className="ms-search-input"
                  placeholder="Search this board…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              )}
              {cfg && !cfg.comingSoon && !cfg.readOnly && (
                <button
                  type="button"
                  className="ms-add-btn"
                  onClick={() => (cfg.displayMode === 'notification_composer' ? setComposerOpen(true) : setRecordModal({ open: true, row: null }))}
                >
                  <FontAwesomeIcon icon={MANAGE_ICONS.plus} /> Add Record
                </button>
              )}
            </div>
          </div>

          <div className={`ms-board-content ms-content-${contentPhase === 'visible' ? 'visible' : contentPhase}`}>
            {!cfg ? null : cfg.comingSoon ? (
              <div className="ms-coming-soon-panel">
                <FontAwesomeIcon icon={MANAGE_ICONS.hammer} />
                <div>This board hasn't been built yet — check back soon.</div>
              </div>
            ) : loading ? (
              <div className="ms-spinner-wrap"><div className="ms-spinner" /> Loading board…</div>
            ) : loadError ? (
              <div className="ms-empty">
                <FontAwesomeIcon icon={MANAGE_ICONS.warningTriangle} style={{ fontSize: '1.6rem' }} />
                <div>{loadError}</div>
              </div>
            ) : (
              <>
                {cfg.readOnly && (
                  <div className="ms-readonly-banner">
                    <FontAwesomeIcon icon={MANAGE_ICONS.infoCircle} /> {cfg.readOnlyReason}
                  </div>
                )}
                {sortedRows.length === 0 ? (
                  <div className="ms-empty">
                    <FontAwesomeIcon icon={MANAGE_ICONS.inbox} style={{ fontSize: '1.6rem' }} />
                    <div>No records yet.</div>
                  </div>
                ) : cfg.displayMode === 'cards' ? (
                  <div className="ms-card-grid">
                    {sortedRows.map((row, i) => {
                      const titleCol = Object.keys(cfg.columns)[1] || cfg.primaryKey;
                      return (
                        <div className="ms-record-card" key={String(row[cfg.primaryKey])} style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}>
                          <div className="ms-record-card-title">{row[titleCol] ?? row[cfg.primaryKey] ?? 'Record'}</div>
                          {Object.entries(cfg.columns).map(([col, def]) =>
                            col === titleCol ? null : (
                              <div className="ms-card-field" key={col}>
                                <span className="ms-card-field-label">{def.label}</span>
                                <span>{formatCellFor(col, def, row)}</span>
                              </div>
                            )
                          )}
                          {cfg.primaryKey === 'session_id' && currentTable === 'session_ongoing' && (
                            <button type="button" className="ms-conclude-btn" onClick={() => forceConcludeSession(row.session_id)}>
                              <FontAwesomeIcon icon={MANAGE_ICONS.flagCheckered} /> Force Conclude
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="ms-board-table-wrap">
                    <table className="ms-board-table">
                      <thead>
                        <tr>
                          {Object.entries(cfg.columns).map(([col, def]) => {
                            const active = sortState.col === col && sortState.dir !== 'default';
                            const icon = active ? (sortState.dir === 'asc' ? MANAGE_ICONS.sortUp : MANAGE_ICONS.sortDown) : MANAGE_ICONS.sort;
                            return (
                              <th key={col} onClick={() => toggleSort(col)} style={{ cursor: 'pointer', userSelect: 'none' }}>
                                {def.label} <FontAwesomeIcon icon={icon} style={{ opacity: active ? 0.9 : 0.3, marginLeft: 4 }} />
                              </th>
                            );
                          })}
                          {!cfg.readOnly && <th style={{ width: 80 }} />}
                        </tr>
                      </thead>
                      <tbody>
                        {sortedRows.map((row, i) => (
                          <tr key={String(row[cfg.primaryKey])} style={{ animationDelay: `${Math.min(i * 25, 300)}ms` }}>
                            {Object.entries(cfg.columns).map(([col, def]) => (
                              <td key={col}>{formatCellFor(col, def, row)}</td>
                            ))}
                            {!cfg.readOnly && (
                              <td>
                                <div className="ms-row-actions">
                                  <button type="button" className="ms-row-btn" title="Edit" onClick={() => setRecordModal({ open: true, row })}>
                                    <FontAwesomeIcon icon={MANAGE_ICONS.pen} />
                                  </button>
                                  <button type="button" className="ms-row-btn danger" title="Delete" onClick={() => setConfirmDeleteRow(row)}>
                                    <FontAwesomeIcon icon={MANAGE_ICONS.trash} />
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>

      {/* ── Record add/edit modal ── */}
      {recordModal.open && cfg && (
        <RecordModal
          cfg={cfg}
          row={recordModal.row}
          permLevel={permLevel}
          fieldEditableNow={fieldEditableNow}
          onCancel={() => setRecordModal({ open: false, row: null })}
          onSave={(data) => saveRecord(data, !!recordModal.row, recordModal.row?.[cfg.primaryKey])}
        />
      )}

      {/* ── Notification composer ── */}
      {composerOpen && cfg && (
        <NotificationComposer
          onCancel={() => setComposerOpen(false)}
          onPosted={() => {
            setComposerOpen(false);
            if (currentTable) loadBoard(currentTable, cfg);
          }}
          showToast={showToast}
        />
      )}

      {/* ── Delete confirm ── */}
      {confirmDeleteRow && (
        <div className="ms-modal-backdrop open" onClick={(e) => { if (e.target === e.currentTarget) setConfirmDeleteRow(null); }}>
          <div className="ms-modal ms-modal-small">
            <div className="ms-modal-head"><h2>Delete this record?</h2></div>
            <div className="ms-modal-body"><p>This can't be undone.</p></div>
            <div className="ms-modal-footer">
              <button className="mbtn" onClick={() => setConfirmDeleteRow(null)}>Cancel</button>
              <button className="mbtn danger" onClick={doDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toasts ── */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type} ${t.show ? 'show' : ''}`}>
            <FontAwesomeIcon icon={t.type === 'success' ? MANAGE_ICONS.checkCircle : MANAGE_ICONS.warningTriangle} /> {t.message}
          </div>
        ))}
      </div>
    </>
  );
}

/* ============================= record modal ============================= */
function RecordModal({
  cfg, row, permLevel, fieldEditableNow, onCancel, onSave,
}: {
  cfg: BoardConfig;
  row: Row | null;
  permLevel: number;
  fieldEditableNow: (def: ColumnDef, isEdit: boolean) => boolean;
  onCancel: () => void;
  onSave: (data: Record<string, unknown>) => void;
}) {
  const isEdit = !!row;
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {};
    for (const [col, def] of Object.entries(cfg.columns)) {
      if (col === cfg.primaryKey && isEdit) { init[col] = row![col]; continue; }
      if (!isEdit && def.editableOnCreate === false) continue;
      init[col] = row ? row[col] : def.type === 'bool' ? false : '';
    }
    return init;
  });

  const submit = () => {
    const data: Record<string, unknown> = {};
    for (const [col, def] of Object.entries(cfg.columns)) {
      if (col === cfg.primaryKey && isEdit) continue; // never resend the pk as a field to update
      const editable = fieldEditableNow(def, isEdit) && !(isEdit && col === cfg.primaryKey);
      if (!editable) continue;
      if (!(col in values)) continue;
      data[col] = values[col];
    }
    onSave(data);
  };

  return (
    <div className="ms-modal-backdrop open" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="ms-modal">
        <div className="ms-modal-head">
          <h2>{isEdit ? `Edit ${cfg.label}` : `Add ${cfg.label}`}</h2>
          <button className="ms-modal-close" onClick={onCancel}><FontAwesomeIcon icon={MANAGE_ICONS.close} /></button>
        </div>
        <div className="ms-modal-body">
          {Object.entries(cfg.columns).map(([col, def]) => {
            if (col === cfg.primaryKey && isEdit) return <Field key={col} col={col} def={def} value={values[col]} locked onChange={() => {}} />;
            if (!isEdit && def.editableOnCreate === false) return null;
            const locked = !fieldEditableNow(def, isEdit);
            return (
              <Field
                key={col}
                col={col}
                def={def}
                value={values[col]}
                locked={locked}
                onChange={(v) => setValues((s) => ({ ...s, [col]: v }))}
              />
            );
          })}
        </div>
        <div className="ms-modal-footer">
          <button className="mbtn" onClick={onCancel}>Cancel</button>
          <button className="mbtn primary" onClick={submit}>Save</button>
        </div>
      </div>
    </div>
  );
}

function Field({ col, def, value, locked, onChange }: { col: string; def: ColumnDef; value: unknown; locked: boolean; onChange: (v: unknown) => void }) {
  const lockedTag = locked ? <span className="ms-locked-tag">(locked)</span> : null;
  let input: React.ReactNode;
  switch (def.type) {
    case 'bool':
      input = <input type="checkbox" checked={!!value} disabled={locked} onChange={(e) => onChange(e.target.checked)} style={{ width: 18, height: 18 }} />;
      break;
    case 'select':
      input = (
        <select value={String(value ?? '')} disabled={locked} onChange={(e) => onChange(e.target.value)}>
          {(def.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
      break;
    case 'textarea':
    case 'staff_roster_json':
      input = <textarea value={String(value ?? '')} disabled={locked} onChange={(e) => onChange(e.target.value)} />;
      break;
    case 'number':
      input = <input type="number" value={value === null || value === undefined ? '' : String(value)} disabled={locked} onChange={(e) => onChange(e.target.value)} />;
      break;
    case 'date':
      input = <input type="date" value={String(value ?? '')} disabled={locked} onChange={(e) => onChange(e.target.value)} />;
      break;
    case 'discord_avatar':
      // eslint-disable-next-line @next/next/no-img-element
      input = value ? <img className="ms-avatar-preview" src={String(value)} alt="Avatar" /> : <span style={{ color: 'rgba(255,255,255,.4)' }}>No avatar on file</span>;
      break;
    default:
      input = <input type="text" value={String(value ?? '')} disabled={locked} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <div className={`ms-form-group ${locked ? 'locked' : ''}`}>
      <label>{def.label}{lockedTag}</label>
      {input}
    </div>
  );
}

/* ============================= notification composer ============================= */
function NotificationComposer({ onCancel, onPosted, showToast }: { onCancel: () => void; onPosted: () => void; showToast: (m: string, t?: 'success' | 'error') => void }) {
  const [category, setCategory] = useState(NOTIF_CATEGORIES[0]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const submit = async () => {
    const t = title.trim();
    const d = description.trim();
    if (!t || !d) { showToast('Title and description are both required.', 'error'); return; }
    if (!confirm(`Post this ${category} announcement to everyone now?`)) return;
    try {
      const res = await fetch('/api/manage/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: 'notifications', data: { category, title: t, description: d } }),
      });
      const result = await res.json();
      if (result.success) { showToast('Announcement posted.', 'success'); onPosted(); }
      else showToast(result.message || 'Failed to post.', 'error');
    } catch {
      showToast('Failed to post.', 'error');
    }
  };

  return (
    <div className="ms-modal-backdrop open" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="ms-modal">
        <div className="ms-modal-head">
          <h2>New Announcement</h2>
          <button className="ms-modal-close" onClick={onCancel}><FontAwesomeIcon icon={MANAGE_ICONS.close} /></button>
        </div>
        <div className="ms-modal-body">
          <div className="ms-composer">
            <div>
              <label style={{ display: 'block', marginBottom: 8, fontSize: '.75rem', color: 'rgba(255,255,255,.5)' }}>Category</label>
              <div className="ms-composer-cats">
                {NOTIF_CATEGORIES.map((c) => (
                  <button key={c} type="button" className={`ms-notif-pill ${NOTIF_CAT_CLASS[c]} ${category === c ? 'selected' : ''}`} onClick={() => setCategory(c)}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 8, fontSize: '.75rem', color: 'rgba(255,255,255,.5)' }}>Title</label>
              <input type="text" maxLength={100} placeholder="Short, punchy title…" value={title} onChange={(e) => setTitle(e.target.value)} />
              <div className={`ms-composer-charcount ${title.length >= 100 ? 'over' : ''}`}>{title.length} / 100</div>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 8, fontSize: '.75rem', color: 'rgba(255,255,255,.5)' }}>Description</label>
              <textarea rows={5} placeholder="What's this about?" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 8, fontSize: '.75rem', color: 'rgba(255,255,255,.5)' }}>Preview</label>
              <div className="ms-notif-preview">
                <span className={`ms-notif-pill ${NOTIF_CAT_CLASS[category]}`}>{category}</span>
                <div className="ms-notif-preview-title">{title || 'Untitled'}</div>
                <div className="ms-notif-preview-desc">{description || 'No description yet.'}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="ms-modal-footer">
          <button className="mbtn" onClick={onCancel}>Cancel</button>
          <button className="mbtn primary" onClick={submit}>Save</button>
        </div>
      </div>
    </div>
  );
}