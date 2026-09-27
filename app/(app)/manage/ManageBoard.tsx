'use client';
// FILE: app/(app)/manage/ManageBoard.tsx
// Direct port of admin.js + managestaff.js into React/TS. UI/behavior is intentionally
// unchanged — same classes, same layout, same interactions. The only genuinely new thing is
// the optional Supabase Realtime subscription (see useEffect near the bottom) which quietly
// re-fetches the current board when someone else changes a row, instead of the old
// "you only see fresh data if you reload" behaviour.

import { memo, useEffect, useMemo, useRef, useState, useCallback, type ReactNode, type SyntheticEvent } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { createClient } from '@/utils/supabase/client';
import { MANAGE_ICONS } from '@/lib/manageIcons';
import { GROUP_ORDER, type BoardConfig, type ColumnDef } from '@/lib/manageTables';
import ViewAsPanel from '../adminpanel/ViewAsPanel';
import type { ViewAsState } from '@/lib/getCurrentUser';
import './manage.css';
import { postNotification } from '@/app/actions/postNotification';
import { searchProfiles, type ProfileSuggestion } from '@/lib/profileSearch';
import { VIEWABLE_RANKS, labelForRank } from '@/lib/viewAs/rankMap';
import type { SiteTimezoneMode } from '@/lib/siteTimezone';
import { updateSiteTimezone } from '../managesession/actions';

const REALTIME_ENABLED = true; // flip off if you'd rather not run a channel per board
const TIMEZONE_BOARD_KEY = 'site_timezone';

type Row = Record<string, any>;
type ApiJson = { success?: boolean; message?: string; directory?: Record<string, string>; rows?: Row[] };
type Groups = Record<string, [string, BoardConfig][]>;
type SortDirection = 'default' | 'asc' | 'desc';
type TableColumn = { key: string; definition: ColumnDef };

const VIRTUALIZATION_THRESHOLD = 50;
const VIRTUAL_OVERSCAN = 8;
const ESTIMATED_BOARD_ROW_HEIGHT = 49;
const estimateBoardRowHeight = () => ESTIMATED_BOARD_ROW_HEIGHT;

const NOTIF_CATEGORIES = ['Session', 'Event', 'Feedback', 'Website', 'Manager', 'System', 'Admin', 'Update'];
const NOTIF_CAT_CLASS: Record<string, string> = {
  Session: 'cat-session', Event: 'cat-event', Feedback: 'cat-feedback', Website: 'cat-website',
  Manager: 'cat-manager', System: 'cat-system', Admin: 'cat-admin', Update: 'cat-update',
};
const ADMIN_ONLY_CATEGORIES = ['System', 'Admin', 'Update'];

const DEPARTMENT_OPTIONS = [
  { key: 'op_dept', label: 'Operations Department' },
  { key: 'comm_dept', label: 'Community Department' },
  { key: 'ih_auth', label: 'Internal Helper Department' },
  { key: 'host_auth', label: 'Head Staff Department' },
  { key: 'cohost_auth', label: 'Co-Host Authorized Department' },
  { key: 'asst_auth', label: 'Assistant Authorized Department' },
  { key: 'event_auth', label: 'Event Authorized Department' },
  { key: 'developer', label: "Developer's Department" },
];
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

function hideBrokenImage(event: SyntheticEvent<HTMLImageElement>) {
  event.currentTarget.style.display = 'none';
}

function formatStaffRosterJson(raw: any) {
  let parsed: any;
  try { parsed = typeof raw === 'string' ? JSON.parse(raw) : raw; }
  catch { return <span title={String(raw)}>{truncate(String(raw), 40)}</span>; }
  const lines: ReactNode[] = [];
  if (Array.isArray(parsed)) {
    parsed.forEach((entry, index) => {
      if (entry && typeof entry === 'object') {
        const role = entry.role || entry.position || 'Staff';
        const name = entry.name || entry.discord || entry.display_name || entry.discordName || '—';
        lines.push(<div className="ms-json-line" key={index}><b>{role}:</b> {name}</div>);
      } else {
        lines.push(<div className="ms-json-line" key={index}>{String(entry)}</div>);
      }
    });
  } else if (parsed && typeof parsed === 'object') {
    Object.entries(parsed).forEach(([role, name], index) => {
      lines.push(<div className="ms-json-line" key={index}><b>{role}:</b> {typeof name === 'object' ? JSON.stringify(name) : String(name)}</div>);
    });
  }
  if (lines.length === 0) return <span className="ms-empty-value">—</span>;
  return <div className="ms-json-summary">{lines}</div>;
}

function formatRuntimeSeconds(raw: unknown) {
  if (raw === null || raw === undefined || raw === '') return '—';
  const seconds = Number(raw);
  if (!Number.isFinite(seconds)) return String(raw ?? '—');
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function formatUtcTimestamp(raw: unknown) {
  if (raw === null || raw === undefined || raw === '') return '—';
  const date = new Date(String(raw));
  if (Number.isNaN(date.getTime())) return String(raw);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

type CellRenderer = (columnKey: string, definition: ColumnDef, row: Row) => ReactNode;

const ManageTableHeaderCell = memo(function ManageTableHeaderCell({
  column,
  sortColumn,
  sortDirection,
  onSort,
}: {
  column: TableColumn;
  sortColumn: string | null;
  sortDirection: SortDirection;
  onSort: (column: string) => void;
}) {
  const handleSort = useCallback(() => onSort(column.key), [column.key, onSort]);
  const active = sortColumn === column.key && sortDirection !== 'default';
  const icon = active
    ? (sortDirection === 'asc' ? MANAGE_ICONS.sortUp : MANAGE_ICONS.sortDown)
    : MANAGE_ICONS.sort;

  return (
    <th className="ms-sortable-heading" onClick={handleSort}>
      {column.definition.label}{' '}
      <FontAwesomeIcon icon={icon} className={`ms-sort-icon ${active ? 'active' : ''}`} />
    </th>
  );
});

const ManageTableRow = memo(function ManageTableRow({
  row,
  columns,
  readOnly,
  noDelete,
  renderCell,
  onEdit,
  onDelete,
  virtualIndex,
  measureElement,
}: {
  row: Row;
  columns: readonly TableColumn[];
  readOnly: boolean;
  noDelete: boolean;
  renderCell: CellRenderer;
  onEdit: (row: Row) => void;
  onDelete: (row: Row) => void;
  virtualIndex?: number;
  measureElement?: (node: HTMLTableRowElement | null) => void;
}) {
  const handleEdit = useCallback(() => onEdit(row), [onEdit, row]);
  const handleDelete = useCallback(() => onDelete(row), [onDelete, row]);
  const virtual = virtualIndex !== undefined;

  return (
    <tr
      ref={virtual ? measureElement : undefined}
      data-index={virtualIndex}
      className={virtual ? 'ms-virtual-row' : undefined}
    >
      {columns.map((column) => (
        <td key={column.key}>{renderCell(column.key, column.definition, row)}</td>
      ))}
      {!readOnly && (
        <td className="ms-actions-cell">
          <div className="ms-row-actions">
            <button type="button" className="ms-row-btn" title="Edit" onClick={handleEdit}>
              <FontAwesomeIcon icon={MANAGE_ICONS.pen} />
            </button>
            {!noDelete && (
              <button type="button" className="ms-row-btn danger" title="Delete" onClick={handleDelete}>
                <FontAwesomeIcon icon={MANAGE_ICONS.trash} />
              </button>
            )}
          </div>
        </td>
      )}
    </tr>
  );
});

function ManageBoardTable({
  rows,
  columns,
  primaryKey,
  readOnly,
  noDelete,
  sortColumn,
  sortDirection,
  renderCell,
  onSort,
  onEdit,
  onDelete,
}: {
  rows: Row[];
  columns: readonly TableColumn[];
  primaryKey: string;
  readOnly: boolean;
  noDelete: boolean;
  sortColumn: string | null;
  sortDirection: SortDirection;
  renderCell: CellRenderer;
  onSort: (column: string) => void;
  onEdit: (row: Row) => void;
  onDelete: (row: Row) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualized = rows.length > VIRTUALIZATION_THRESHOLD;
  const getItemKey = useCallback(
    (index: number) => String(rows[index]?.[primaryKey] ?? index),
    [primaryKey, rows]
  );
  const rowVirtualizer = useVirtualizer<HTMLDivElement, HTMLTableRowElement>({
    count: virtualized ? rows.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: estimateBoardRowHeight,
    getItemKey,
    overscan: VIRTUAL_OVERSCAN,
  });
  const virtualRows = virtualized ? rowVirtualizer.getVirtualItems() : [];
  const firstVirtualRow = virtualRows[0];
  const lastVirtualRow = virtualRows[virtualRows.length - 1];
  const topSpacerHeight = firstVirtualRow?.start ?? 0;
  const bottomSpacerHeight = lastVirtualRow
    ? Math.max(0, rowVirtualizer.getTotalSize() - lastVirtualRow.end)
    : 0;
  const columnCount = columns.length + (readOnly ? 0 : 1);

  return (
    <div
      ref={scrollRef}
      className={`ms-board-table-wrap ${virtualized ? 'is-virtualized' : ''}`}
      data-virtualized={virtualized ? 'true' : 'false'}
    >
      <table className={`ms-board-table ${virtualized ? 'is-virtualized' : ''}`}>
        <thead>
          <tr>
            {columns.map((column) => (
              <ManageTableHeaderCell
                key={column.key}
                column={column}
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={onSort}
              />
            ))}
            {!readOnly && <th className="ms-actions-heading" />}
          </tr>
        </thead>
        <tbody>
          {virtualized ? (
            <>
              {topSpacerHeight > 0 && (
                <tr className="ms-virtual-spacer" aria-hidden="true">
                  <td colSpan={columnCount} style={{ height: topSpacerHeight }} />
                </tr>
              )}
              {virtualRows.map((virtualRow) => {
                const row = rows[virtualRow.index];
                return (
                  <ManageTableRow
                    key={String(row[primaryKey] ?? virtualRow.key)}
                    row={row}
                    columns={columns}
                    readOnly={readOnly}
                    noDelete={noDelete}
                    renderCell={renderCell}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    virtualIndex={virtualRow.index}
                    measureElement={rowVirtualizer.measureElement}
                  />
                );
              })}
              {bottomSpacerHeight > 0 && (
                <tr className="ms-virtual-spacer" aria-hidden="true">
                  <td colSpan={columnCount} style={{ height: bottomSpacerHeight }} />
                </tr>
              )}
            </>
          ) : (
            rows.map((row, index) => (
              <ManageTableRow
                key={String(row[primaryKey] ?? index)}
                row={row}
                columns={columns}
                readOnly={readOnly}
                noDelete={noDelete}
                renderCell={renderCell}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

interface ToastMsg { id: number; message: string; type: 'success' | 'error'; show: boolean; }

export default function ManageBoard({
  permLevel, groups, title, viewingAs, timezoneMode = 'BST', canManageTimezone = false,
  initialTimezonePanel = false, timezoneFeedback = null,
}: {
  permLevel: number;
  groups: Groups;
  title?: string;
  viewingAs?: ViewAsState | null;
  timezoneMode?: SiteTimezoneMode;
  canManageTimezone?: boolean;
  initialTimezonePanel?: boolean;
  timezoneFeedback?: { type: 'success' | 'error'; message: string } | null;
}) {
  const supabase = useMemo(() => createClient(), []);

  const allBoards = useMemo(() => {
    const flat: [string, BoardConfig][] = [];
    for (const g of GROUP_ORDER) flat.push(...(groups[g] ?? []));
    return flat;
  }, [groups]);

  const [currentTable, setCurrentTable] = useState<string | null>(initialTimezonePanel && canManageTimezone ? TIMEZONE_BOARD_KEY : allBoards[0]?.[0] ?? null);
  const cfg: BoardConfig | null = currentTable ? allBoards.find(([k]) => k === currentTable)?.[1] ?? null : null;
  const showingTimezone = canManageTimezone && currentTable === TIMEZONE_BOARD_KEY;
  const tableColumns = useMemo<TableColumn[]>(
    () => cfg ? Object.entries(cfg.columns).map(([key, definition]) => ({ key, definition })) : [],
    [cfg]
  );

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortState, setSortState] = useState<{ col: string | null; dir: SortDirection }>({ col: null, dir: 'default' });
  const [directory, setDirectory] = useState<Record<string, string>>({});
  const inFlightReads = useRef(new Map<string, Promise<ApiJson>>());
  const readJson = useCallback((url: string): Promise<ApiJson> => {
    const existing = inFlightReads.current.get(url);
    if (existing) return existing;
    const request = fetch(url).then((response) => response.json() as Promise<ApiJson>).finally(() => {
      inFlightReads.current.delete(url);
    });
    inFlightReads.current.set(url, request);
    return request;
  }, []);
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
      const data = await readJson('/api/manage/directory');
      if (data.success && data.directory) setDirectory(data.directory);
    } catch {
      /* resolveId columns just fall back to raw ids */
    }
  }, [readJson]);

  const loadBoard = useCallback(
    async (table: string, boardCfg: BoardConfig) => {
      setLoading(true);
      setLoadError(null);
      setContentPhase('leaving');
      try {
        const url = table === 'staff_directory' ? endpointFor(table) : `${endpointFor(table)}?table=${encodeURIComponent(table)}`;
        const data = await readJson(url);
        if (!data.success) {
          setLoadError(data.message || 'Failed to load.');
          setRows([]);
        } else {
          setRows(data.rows ?? []);
          if (data.directory) setDirectory((current) => ({ ...current, ...data.directory }));
          else if (needsDirectory(boardCfg)) await loadDirectory();
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
    [loadDirectory, readJson]
  );

  const selectBoard = (table: string) => {
    setCurrentTable(table);
    setSearchTerm('');
    setSortState({ col: null, dir: 'default' });
    if (table === TIMEZONE_BOARD_KEY) setContentPhase('visible');
    const boardCfg = allBoards.find(([k]) => k === table)?.[1];
    if (boardCfg && !boardCfg.comingSoon && boardCfg.displayMode !== 'view_as') loadBoard(table, boardCfg);
  };

  useEffect(() => {
    if (currentTable && cfg && !cfg.comingSoon && cfg.displayMode !== 'view_as') loadBoard(currentTable, cfg);
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

  const toggleSort = useCallback((col: string) => {
    setSortState((s) => {
      if (s.col !== col) return { col, dir: 'asc' };
      if (s.dir === 'asc') return { col, dir: 'desc' };
      if (s.dir === 'desc') return { col: null, dir: 'default' };
      return { col, dir: 'asc' };
    });
  }, []);

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
      const res = await fetch(`/api/session/${sessionId}/bell/conclude`, {
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
  const formatCellFor = useCallback<CellRenderer>((col, def, row) => {
    const rawValue = row[col];
    const idKey = String(rawValue ?? '');
    const resolvedValue = def.resolveId
      ? directory[`${col}:${idKey}`] ?? directory[idKey]
      : undefined;
    const value = resolvedValue ?? rawValue;
    if (col === 'session_runtime_actual') return formatRuntimeSeconds(value);
    if (col === 'started_at' || col === 'ended_at') return formatUtcTimestamp(value);
    const unresolved = !!def.resolveId
      && !resolvedValue
      && rawValue !== null
      && rawValue !== undefined
      && rawValue !== '';
    if (unresolved) {
      return <span className="ms-unresolved-id" title="No matching profile/archived record found">{String(value)}</span>;
    }
    if (def.type === 'discord_avatar') {
      if (!value) return <span className="ms-empty-value">—</span>;
      // eslint-disable-next-line @next/next/no-img-element
      return <img className="ms-avatar-thumb" src={value} alt="Avatar" onError={hideBrokenImage} />;
    }
    if (value === null || value === undefined || value === '') {
      return <span className="ms-empty-value">—</span>;
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
  }, [directory]);

  const openRecordEditor = useCallback((row: Row) => {
    setRecordModal({ open: true, row });
  }, []);

  const requestRecordDelete = useCallback((row: Row) => {
    setConfirmDeleteRow(row);
  }, []);

  // ── record modal field builder ──
  const fieldEditableNow = useCallback((def: ColumnDef, isEdit: boolean) => {
    if (isEdit && def.editableOnUpdate === false) return false;
    if (!isEdit && def.editableOnCreate === false) return false;
    if (def.minLevel && permLevel < def.minLevel) return false;
    return true;
  }, [permLevel]);

  return (
    <>
      <div className="ms-layout">
        {/* ── Sidebar ── */}
        <aside className="ms-sidebar" ref={sidebarRef}>
          <div className="ms-board-indicator" style={{ transform: `translateY(${indicator.top}px)`, height: indicator.height, opacity: indicator.visible ? 1 : 0 }} />
          <div className="ms-sidebar-title">{title ?? `Manage ${permLevel >= 20 ? 'Everything' : 'Staff'}`}</div>
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
          {canManageTimezone && (
            <div>
              <div className="ms-group-label">Site Settings</div>
              <button
                type="button"
                data-table={TIMEZONE_BOARD_KEY}
                className={`ms-board-btn ${showingTimezone ? 'active' : ''}`}
                onClick={() => selectBoard(TIMEZONE_BOARD_KEY)}
              >
                <span className="ms-board-dot" />
                Session &amp; Event Timezone
              </button>
            </div>
          )}
        </aside>

        {/* ── Main board area ── */}
        <main className="ms-main">
          <div className="ms-board-header">
            <div>
              <h1 className="ms-board-title">{showingTimezone ? 'Session and Event Timezone' : cfg ? cfg.label : 'Select a board'}</h1>
              <p className="ms-board-sub">
                {showingTimezone
                  ? 'Change when the UK switches between BST and GMT.'
                  : !cfg
                  ? 'Pick something from the sidebar to get started.'
                  : cfg.displayMode === 'view_as'
                  ? 'Temporarily browse the site as a different rank or person.'
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
              {cfg && !cfg.comingSoon && cfg.displayMode !== 'view_as' && (
                <input
                  type="text"
                  className="ms-search-input"
                  placeholder="Search this board…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              )}
              {cfg && !cfg.comingSoon && !cfg.readOnly && !cfg.noCreate && cfg.displayMode !== 'view_as' && (
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
            {showingTimezone ? (
              <TimezonePanel timezoneMode={timezoneMode} feedback={timezoneFeedback} />
            ) : !cfg ? null : cfg.displayMode === 'view_as' ? (
            <ViewAsPanel viewingAs={viewingAs ?? null} />
            ) : cfg.comingSoon ?  (
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
                  <ManageBoardTable
                    rows={sortedRows}
                    columns={tableColumns}
                    primaryKey={cfg.primaryKey}
                    readOnly={!!cfg.readOnly}
                    noDelete={!!cfg.noDelete}
                    sortColumn={sortState.col}
                    sortDirection={sortState.dir}
                    renderCell={formatCellFor}
                    onSort={toggleSort}
                    onEdit={openRecordEditor}
                    onDelete={requestRecordDelete}
                  />
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
          timezoneMode={timezoneMode}
          fieldEditableNow={fieldEditableNow}
          onCancel={() => setRecordModal({ open: false, row: null })}
          onSave={(data) => saveRecord(data, !!recordModal.row, recordModal.row?.[cfg.primaryKey])}
        />
      )}

      {/* ── Notification composer ── */}
      {composerOpen && cfg && (
        <NotificationComposer
          permLevel={permLevel}
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

function TimezonePanel({
  timezoneMode, feedback,
}: {
  timezoneMode: SiteTimezoneMode;
  feedback: { type: 'success' | 'error'; message: string } | null;
}) {
  return (
    <>
      {feedback && <div className={`timezone-feedback ${feedback.type}`} role="status">{feedback.message}</div>}
      <form
        action={updateSiteTimezone}
        className="timezone-control"
        onSubmit={(event) => {
          const nextMode = timezoneMode === 'BST' ? 'GMT' : 'BST';
          if (!window.confirm(
            `Change site timezone from ${timezoneMode} to ${nextMode}? Existing session and event clock values stay unchanged, but their UTC interpretation shifts by one hour.`
          )) event.preventDefault();
        }}
      >
        <div>
          <strong>Session and event timezone</strong>
          <span>Supabase remains UTC. Site wall-clock mode: {timezoneMode}.</span>
        </div>
        <input type="hidden" name="timezone_mode" value={timezoneMode === 'BST' ? 'GMT' : 'BST'} />
        <button
          type="submit"
          className={`timezone-toggle ${timezoneMode.toLowerCase()}`}
          role="switch"
          aria-checked={timezoneMode === 'BST'}
          aria-label={`Change site timezone to ${timezoneMode === 'BST' ? 'GMT' : 'BST'}`}
        >
          <span>GMT</span>
          <i aria-hidden="true" />
          <span>BST</span>
        </button>
      </form>
    </>
  );
}

/* ============================= record modal ============================= */
function RecordModal({
  cfg, row, permLevel, timezoneMode, fieldEditableNow, onCancel, onSave,
}: {
  cfg: BoardConfig;
  row: Row | null;
  permLevel: number;
  timezoneMode: SiteTimezoneMode;
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
            if (col === cfg.primaryKey && isEdit) return <Field key={col} col={col} def={def} value={values[col]} locked timezoneMode={timezoneMode} onChange={() => {}} />;
            if (!isEdit && def.editableOnCreate === false) return null;
            const locked = !fieldEditableNow(def, isEdit);
            return (
              <Field
                key={col}
                col={col}
                def={def}
                value={values[col]}
                locked={locked}
                timezoneMode={timezoneMode}
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

function Field({ col, def, value, locked, timezoneMode, onChange }: { col: string; def: ColumnDef; value: unknown; locked: boolean; timezoneMode: SiteTimezoneMode; onChange: (v: unknown) => void }) {
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
      <label>{def.label}{col === 'event_time' ? ` (${timezoneMode})` : ''}{lockedTag}</label>
      {input}
    </div>
  );
}

/* ============================= notification composer ============================= */
function NotificationComposer({
  permLevel, onCancel, onPosted, showToast,
}: { permLevel: number; onCancel: () => void; onPosted: () => void; showToast: (m: string, t?: 'success' | 'error') => void }) {
  const availableCategories = NOTIF_CATEGORIES.filter((c) => permLevel >= 20 || !ADMIN_ONLY_CATEGORIES.includes(c));

  const [category, setCategory] = useState(availableCategories[0]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [audienceType, setAudienceType] = useState<'everyone' | 'rank' | 'department' | 'users'>('everyone');
  const [audienceRank, setAudienceRank] = useState(VIEWABLE_RANKS[0]);
  const [audienceDept, setAudienceDept] = useState(DEPARTMENT_OPTIONS[0].key);
  const [userQuery, setUserQuery] = useState('');
  const [userResults, setUserResults] = useState<ProfileSuggestion[]>([]);
  const [pickedUsers, setPickedUsers] = useState<ProfileSuggestion[]>([]);
  const [posting, setPosting] = useState(false);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (audienceType !== 'users' || userQuery.trim().length < 2) { setUserResults([]); return; }
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(async () => {
      try { setUserResults(await searchProfiles(userQuery)); } catch { setUserResults([]); }
    }, 250);
    return () => { if (searchDebounce.current) clearTimeout(searchDebounce.current); };
  }, [userQuery, audienceType]);

  function addUser(p: ProfileSuggestion) {
    if (!pickedUsers.some((u) => u.id === p.id)) setPickedUsers((list) => [...list, p]);
    setUserQuery('');
    setUserResults([]);
  }
  function removeUser(id: string) {
    setPickedUsers((list) => list.filter((u) => u.id !== id));
  }

  const submit = async () => {
    const t = title.trim();
    const d = description.trim();
    if (!t || !d) { showToast('Title and description are both required.', 'error'); return; }
    if (audienceType === 'users' && pickedUsers.length === 0) { showToast('Pick at least one recipient.', 'error'); return; }
    if (!confirm(`Post this ${category} announcement now?`)) return;

    setPosting(true);
    try {
      await postNotification({
        category, title: t, description: d, audienceType,
        audienceRank: audienceType === 'rank' ? audienceRank : undefined,
        audienceDepartment: audienceType === 'department' ? audienceDept : undefined,
        userIds: audienceType === 'users' ? pickedUsers.map((u) => u.id) : undefined,
      });
      showToast('Announcement posted.', 'success');
      onPosted();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to post.', 'error');
    } finally {
      setPosting(false);
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
                {availableCategories.map((c) => (
                  <button key={c} type="button" className={`ms-notif-pill ${NOTIF_CAT_CLASS[c]} ${category === c ? 'selected' : ''}`} onClick={() => setCategory(c)}>
                    {c}
                  </button>
                ))}
              </div>
              {permLevel < 20 && (
                <div style={{ fontSize: '.68rem', color: 'rgba(255,255,255,.35)', marginTop: 6 }}>
                  System, Admin, and Update are Admin-only.
                </div>
              )}
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 8, fontSize: '.75rem', color: 'rgba(255,255,255,.5)' }}>Audience</label>
              <div className="ms-composer-cats">
                {(['everyone', 'rank', 'department', 'users'] as const).map((a) => (
                  <button key={a} type="button" className={`ms-audience-pill ${audienceType === a ? 'selected' : ''}`} onClick={() => setAudienceType(a)}>
                    {a === 'everyone' ? 'Everyone' : a === 'rank' ? 'By Rank' : a === 'department' ? 'By Department' : 'Specific Users'}
                  </button>
                ))}
              </div>

              {audienceType === 'rank' && (
                <select value={audienceRank} onChange={(e) => setAudienceRank(e.target.value)} style={{ marginTop: 10, width: '100%' }}>
                  {VIEWABLE_RANKS.map((r) => <option key={r} value={r}>{labelForRank(r)}</option>)}
                </select>
              )}

              {audienceType === 'department' && (
                <select value={audienceDept} onChange={(e) => setAudienceDept(e.target.value)} style={{ marginTop: 10, width: '100%' }}>
                  {DEPARTMENT_OPTIONS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
                </select>
              )}

              {audienceType === 'users' && (
                <div style={{ marginTop: 10 }}>
                  <input
                    type="text"
                    placeholder="Search by Discord or Roblox username…"
                    value={userQuery}
                    onChange={(e) => setUserQuery(e.target.value)}
                  />
                  {userResults.length > 0 && (
                    <div className="ap-search-results">
                      {userResults.map((r) => (
                        <button type="button" key={r.id} className="ap-search-result" onClick={() => addUser(r)}>
                          <span>{r.discordUsername}</span>
                          {r.robloxUsername && <span className="ap-search-result-meta">{r.robloxUsername}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  {pickedUsers.length > 0 && (
                    <div className="ms-composer-cats" style={{ marginTop: 8 }}>
                      {pickedUsers.map((u) => (
                        <span key={u.id} className="ms-notif-pill cat-website" style={{ cursor: 'pointer' }} onClick={() => removeUser(u.id)}>
                          {u.discordUsername} ✕
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
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
          <button className="mbtn primary" disabled={posting} onClick={submit}>Save</button>
        </div>
      </div>
    </div>
  );
}
