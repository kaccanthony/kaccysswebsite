// FILE: app/(app)/managesession/ManageSessionInteractive.tsx
'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPen, faTrash, faTimes, faCrown, faPlus, faEnvelopeOpenText,
  faMagnifyingGlass, faXmark, faClipboard,
} from '@fortawesome/free-solid-svg-icons';
import { saveSession, deleteSession } from './actions';
import ToastStack, { type ToastEntry, type ToastKind } from '@/components/ToastStack';
import QuickAddTrainee from './QuickAddTrainee';
import GlobalQuickFillTrainee from './GlobalQuickFillTrainee';
import { parseTraineePaste, looksLikeSameDate, checkRequiredSessionFields, checkIdentityFields, checkIdentityFieldFormats } from './parseTraineePaste';
import { lookupKnownTrainee, searchKnownTrainees, validateHostRank, resolveHostByDiscordId, type KnownTraineeMatch } from './traineeActions';
import { useModalVisibility } from '@/lib/useModalVisibility';
import type { SiteTimezoneMode } from '@/lib/siteTimezone';
import { findDuplicateAssignments } from './duplicateAssignments';
import { countSessionTraineeSlots, MAX_SESSION_TRAINEES } from '@/lib/session/traineeLimit';

const DRAFT_KEY = 'managesession_draft';
const SESSION_VIRTUALIZATION_THRESHOLD = 50;
const SESSION_VIRTUAL_OVERSCAN = 8;
const ESTIMATED_SESSION_ROW_HEIGHT = 68;
const estimateSessionRowHeight = () => ESTIMATED_SESSION_ROW_HEIGHT;
const PRIMARY_ROLE_CODES = ['HOST', 'CH_1', 'CH_2', 'CH_3', 'CH_4', 'AST_1', 'AST_2', 'AST_3', 'AST_4'];
function DuplicateWarning({ visible, label }: { visible: boolean; label: string }) {
  return visible ? <span className="duplicate-warning" role="status" aria-label={label} title={label}>Duplicate</span> : null;
}

export interface StaffOption {
  name: string;
  staff_rank: string;
  op_dept: boolean;
  host_auth: boolean;
  cohost_auth: boolean;
  asst_auth: boolean;
  comm_dept: boolean;
  eventh_auth: boolean;
  eventch_auth: boolean;
  ih_auth: boolean;
}

export interface StaffChildRow {
  role: string;
  staff_name: string;
  attended: boolean;
  notes: string | null;
}

export interface TraineeChildRow {
  slot_number: number;
  is_standby: boolean;
  trainee_roblox_username: string | null;
  trainee_discord: string | null;
  trainee_discord_id: string | null;
  zone: number | null;
  note: string | null;
  trainer_name: string | null;
  attended: boolean;
}

export interface SessionRow {
  session_id: number;
  session_name: string | null;
  session_desc: string | null;
  session_status: string;
  session_booked: boolean;
  session_duration: string | null;
  num_slots: number;
  session_date: string;
  session_time: string;
  trainee_timer: number;
  trainer_assignment_mode: string;
  additional_notes: string | null;
  staffRows: StaffChildRow[];
  traineeRows: TraineeChildRow[];
}

// Reads a primary role's assigned name from the session_staff rows, e.g.
// findPrimaryStaff(rows, 'HOST') matches both 'HOST' and 'HOST, IH'.
export function findPrimaryStaff(staffRows: StaffChildRow[], roleCode: string): string {
  return staffRows.find((r) => r.role === roleCode || r.role.startsWith(`${roleCode},`))?.staff_name ?? '';
}
export function hasIH(staffRows: StaffChildRow[], roleCode: string): boolean {
  return staffRows.find((r) => r.role === roleCode || r.role.startsWith(`${roleCode},`))?.role.includes('IH') ?? false;
}
export function getHostName(s: SessionRow): string {
  return findPrimaryStaff(s.staffRows, 'HOST');
}

// Fixed display order for optgroups — Host Authorized and Event Authorized
// slotted in next to their same-tier counterpart (Head Staff / Co-Host)
// since they weren't in your explicit list but share the same [HS]/[ST]
// prefix grouping from lib/roles.ts.
const RANK_DISPLAY_ORDER = [
  'Operations Manager',
  'Community Manager',
  'Head Staff',
  'Host Authorized',
  'Co-Host Authorized',
  'Event Authorized',
  'Assistant Authorized',
];

function groupByRank(list: StaffOption[]): Record<string, StaffOption[]> {
  const grouped: Record<string, StaffOption[]> = {};
  for (const s of list) (grouped[s.staff_rank] ??= []).push(s);
  return grouped;
}

export function StaffSelect({
  name, staff, authKey, defaultValue, onChange, selectRef,
}: {
  name: string;
  staff: StaffOption[];
  authKey: 'host_auth' | 'cohost_auth' | 'asst_auth';
  defaultValue?: string | null;
  onChange?: () => void;
  selectRef?: React.RefObject<HTMLSelectElement | null>;
}) {
  const eligible = staff.filter((s) => s[authKey]);
  const grouped = groupByRank(eligible);

  return (
    <select ref={selectRef} className="staff-select" name={name} defaultValue={defaultValue ?? ''} onChange={onChange}>
      <option value="">— None —</option>
      {RANK_DISPLAY_ORDER.map((rank) =>
        grouped[rank]?.length ? (
          <optgroup key={rank} label={rank}>
            {grouped[rank].map((s) => (
              <option key={s.name} value={s.name}>{s.name}</option>
            ))}
          </optgroup>
        ) : null
      )}
    </select>
  );
}

// Colon is derived from digit count, never stored as a real character —
// this is what avoids the "trapped colon" backspace problem entirely.
function formatTimeDisplay(digits: string): string {
  if (digits.length === 0) return '';
  if (digits.length === 1) return digits;
  if (digits.length === 2) return `${digits}:`;
  return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
}

// Accepts DD/MM/YYYY, MM/DD/YYYY, or YYYY-MM-DD, with either '-' or '/' as
// the separator. Returns every valid interpretation as an ISO date string —
// when the input is genuinely ambiguous (both day<=12 and month<=12), both
// readings are returned and either one matches.
function parseFlexibleDate(query: string): string[] {
  const m = query.match(/^(\d{1,4})[-/](\d{1,2})[-/](\d{1,4})$/);
  if (!m) return [];
  const [, a, b, c] = m;
  const results: string[] = [];

  // YYYY-MM-DD — first part is clearly a year
  if (a.length === 4) {
    const year = parseInt(a, 10);
    const month = parseInt(b, 10);
    const day = parseInt(c, 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      results.push(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    }
    return results;
  }

  // DD/MM/YYYY or MM/DD/YYYY — last part is the year (2 or 4 digits)
  const n1 = parseInt(a, 10);
  const n2 = parseInt(b, 10);
  const year = c.length === 2 ? 2000 + parseInt(c, 10) : parseInt(c, 10);

  if (n1 >= 1 && n1 <= 31 && n2 >= 1 && n2 <= 12) {
    results.push(`${year}-${String(n2).padStart(2, '0')}-${String(n1).padStart(2, '0')}`); // DD/MM
  }
  if (n2 >= 1 && n2 <= 31 && n1 >= 1 && n1 <= 12) {
    const candidate = `${year}-${String(n1).padStart(2, '0')}-${String(n2).padStart(2, '0')}`; // MM/DD
    if (!results.includes(candidate)) results.push(candidate);
  }

  return results;
}

// Accepts 24-hour "HH:MM" or "HHMM" (colon optional), spaces stripped.
function parseFlexibleTime(query: string): string | null {
  const cleaned = query.replace(/\s+/g, '');
  const m = cleaned.match(/^(\d{1,2}):?(\d{2})$/);
  if (!m) return null;
  const hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (hh > 23 || mm > 59) return null;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function statusBadgeClass(status: string) {
  const map: Record<string, string> = {
    Requested: 'badge-request',
    Scheduled: 'badge-scheduled',
    Booked: 'badge-booked',
    Cancelled: 'badge-cancelled',
    Postponed: 'badge-postponed',
  };
  return map[status] ?? 'badge-scheduled';
}

const SessionTableRow = memo(function SessionTableRow({
  session,
  canManage,
  canDelete,
  onEdit,
  onDelete,
  timezoneMode,
  virtualIndex,
  measureElement,
}: {
  session: SessionRow;
  canManage: boolean;
  canDelete: boolean;
  onEdit: (session: SessionRow) => void;
  onDelete: (session: SessionRow) => void;
  timezoneMode: SiteTimezoneMode;
  virtualIndex?: number;
  measureElement?: (node: HTMLTableRowElement | null) => void;
}) {
  const handleEdit = useCallback(() => onEdit(session), [onEdit, session]);
  const handleDelete = useCallback(() => onDelete(session), [onDelete, session]);
  const filled = useMemo(
    () => session.traineeRows.reduce((count, trainee) => count + (trainee.is_standby ? 0 : 1), 0),
    [session.traineeRows]
  );
  const dateLabel = useMemo(
    () => new Date(`${session.session_date}T00:00:00`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
    [session.session_date]
  );
  const timeLabel = `${session.session_time.slice(0, 5)} ${timezoneMode}`;
  const virtual = virtualIndex !== undefined;

  return (
    <tr
      ref={virtual ? measureElement : undefined}
      data-index={virtualIndex}
      className={virtual ? 'session-virtual-row' : undefined}
    >
      <td className="td-id">#{session.session_id}</td>
      <td className="td-name">
        <div className="td-name-inner">
          <span className="session-name">{session.session_name || '—'}</span>
          {session.session_desc && <span className="session-desc">{session.session_desc.slice(0, 55)}</span>}
        </div>
      </td>
      <td><span className={`badge ${statusBadgeClass(session.session_status)}`}>{session.session_status}</span></td>
      <td className="td-host">
        <div className="td-host-inner">
          <FontAwesomeIcon icon={faCrown} className="td-host-icon" /> {getHostName(session)}
        </div>
      </td>
      <td className="td-date">
        <span className="date-main">{dateLabel}</span>
        <span className="date-time">{timeLabel}</span>
      </td>
      <td><span className={`slots-pill ${filled >= session.num_slots ? 'slots-full' : ''}`}>{filled}/{session.num_slots}</span></td>
      <td className="td-dur">{session.session_duration} min</td>
      {canManage && (
        <td className="td-actions">
          <div className="td-actions-inner">
            <QuickAddTrainee sessionId={session.session_id} />
            <button className="action-btn" title="Edit" onClick={handleEdit}>
              <FontAwesomeIcon icon={faPen} />
            </button>
            {canDelete && (
              <button className="action-btn danger" title="Delete" onClick={handleDelete}>
                <FontAwesomeIcon icon={faTrash} />
              </button>
            )}
          </div>
        </td>
      )}
    </tr>
  );
});

function SessionTable({
  sessions,
  canManage,
  canDelete,
  onEdit,
  onDelete,
  timezoneMode,
}: {
  sessions: SessionRow[];
  canManage: boolean;
  canDelete: boolean;
  onEdit: (session: SessionRow) => void;
  onDelete: (session: SessionRow) => void;
  timezoneMode: SiteTimezoneMode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualized = sessions.length > SESSION_VIRTUALIZATION_THRESHOLD;
  const getItemKey = useCallback((index: number) => sessions[index]?.session_id ?? index, [sessions]);
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLTableRowElement>({
    count: virtualized ? sessions.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: estimateSessionRowHeight,
    getItemKey,
    overscan: SESSION_VIRTUAL_OVERSCAN,
  });
  const virtualRows = virtualized ? virtualizer.getVirtualItems() : [];
  const firstVirtualRow = virtualRows[0];
  const lastVirtualRow = virtualRows[virtualRows.length - 1];
  const topSpacerHeight = firstVirtualRow?.start ?? 0;
  const bottomSpacerHeight = lastVirtualRow
    ? Math.max(0, virtualizer.getTotalSize() - lastVirtualRow.end)
    : 0;
  const columnCount = canManage ? 8 : 7;

  return (
    <div ref={scrollRef} className={`table-wrap ${virtualized ? 'is-virtualized' : ''}`}>
      <table className="session-table">
        <thead>
          <tr>
            <th>ID</th><th>Session</th><th>Status</th><th>Host</th>
            <th>Date &amp; Time</th><th>Slots</th><th>Duration</th>
            {canManage && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {virtualized ? (
            <>
              {topSpacerHeight > 0 && (
                <tr className="session-virtual-spacer" aria-hidden="true">
                  <td colSpan={columnCount} style={{ height: topSpacerHeight }} />
                </tr>
              )}
              {virtualRows.map((virtualRow) => {
                const session = sessions[virtualRow.index];
                return (
                  <SessionTableRow
                    key={session.session_id}
                    session={session}
                    canManage={canManage}
                    canDelete={canDelete}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    timezoneMode={timezoneMode}
                    virtualIndex={virtualRow.index}
                    measureElement={virtualizer.measureElement}
                  />
                );
              })}
              {bottomSpacerHeight > 0 && (
                <tr className="session-virtual-spacer" aria-hidden="true">
                  <td colSpan={columnCount} style={{ height: bottomSpacerHeight }} />
                </tr>
              )}
            </>
          ) : (
            sessions.map((session) => (
              <SessionTableRow
                key={session.session_id}
                session={session}
                canManage={canManage}
                canDelete={canDelete}
                onEdit={onEdit}
                onDelete={onDelete}
                timezoneMode={timezoneMode}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function ManageSessionInteractive({
  sessions,
  staff,
  rawRole,
  permLevel,
  timezoneMode,
}: {
  sessions: SessionRow[];
  staff: StaffOption[];
  rawRole: string;
  permLevel: number;
  timezoneMode: SiteTimezoneMode;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const { shouldRender, visible } = useModalVisibility(modalOpen);
  const [editing, setEditing] = useState<SessionRow | null>(null);
  const [numSlots, setNumSlots] = useState(4);
  const [reservedSlots, setReservedSlots] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const dismissToast = useCallback((id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);
  const showToast = useCallback((message: string, kind: ToastKind) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, message, kind, actorName: 'Manage Sessions' }]);
  }, []);
  const [statusValue, setStatusValue] = useState('Requested');
  const [bookedValue, setBookedValue] = useState(false);
  const [timeDigits, setTimeDigits] = useState(''); // raw digits only, e.g. "1430" — colon is derived, never stored
  const [additionalStaffRows, setAdditionalStaffRows] = useState<{ name: string; role: string }[]>([]);
  const [duplicateFields, setDuplicateFields] = useState<Set<string>>(() => new Set());
  const [hasInternal, setHasInternal] = useState(false);

  // Inline quick-fill — one slot's panel open at a time, rendered directly
  // in that slot's own card (no separate modal-on-top-of-modal anymore).
  const [quickFillSlot, setQuickFillSlot] = useState<number | null>(null);
  const [quickFillMode, setQuickFillMode] = useState<'search' | 'paste'>('search');
  const [pasteText, setPasteText] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [pasteWarning, setPasteWarning] = useState<string | null>(null);
  const [pasteLoading, setPasteLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<KnownTraineeMatch[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);
  const pendingDraftFillRef = useRef<Record<string, string> | null>(null);

  const updateDuplicateWarnings = useCallback(() => {
    if (!formRef.current) return;
    const next = findDuplicateAssignments(new FormData(formRef.current));
    setDuplicateFields((current) => current.size === next.size && [...next].every((field) => current.has(field)) ? current : next);
  }, []);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [hostFilter, setHostFilter] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  const isRequestMode = rawRole === 'Head Staff' && permLevel < 20;

  const filteredSessions = useMemo(() => {
    const q = search.trim().toLowerCase();
    const h = hostFilter.trim().toLowerCase();
    const dateMatches = parseFlexibleDate(search.trim());
    const timeMatch = parseFlexibleTime(search.trim());

    return sessions.filter((s) => {
      if (statusFilter && s.session_status !== statusFilter) return false;
      if (h && !getHostName(s).toLowerCase().includes(h)) return false;
      if (q) {
        const matchesId = String(s.session_id).includes(q);
        const matchesHost = getHostName(s).toLowerCase().includes(q);
        const matchesName = (s.session_name ?? '').toLowerCase().includes(q);
        const matchesDate = dateMatches.includes(s.session_date);
        const matchesTime = timeMatch !== null && s.session_time.slice(0, 5) === timeMatch;
        if (!matchesId && !matchesHost && !matchesName && !matchesDate && !matchesTime) return false;
      }
      return true;
    });
  }, [sessions, search, statusFilter, hostFilter]);

  const suggestions = search.trim() ? filteredSessions.slice(0, 6) : [];

  const hasActiveFilter = search || statusFilter || hostFilter;

  function clearFilters() {
    setSearch('');
    setStatusFilter('');
    setHostFilter('');
  }

  function openAdd() {
    setEditing(null);
    setStatusValue('Requested');
    setBookedValue(false);
    setAdditionalStaffRows([]);
    setHasInternal(false);
    setReservedSlots(0);

    const raw = typeof window !== 'undefined' ? localStorage.getItem(DRAFT_KEY) : null;
    if (raw) {
      try {
        const data = JSON.parse(raw) as Record<string, string>;
        setNumSlots(Math.max(4, Math.min(10, parseInt(data.num_slots, 10) || 4)));
        setReservedSlots(Math.max(0, Math.min(10, parseInt(data.reserved_slots, 10) || 0)));
        if (data.session_status) setStatusValue(data.session_status);
        setBookedValue(data.session_booked === 'on');
        setTimeDigits((data.session_time ?? '').replace(/\D/g, '').slice(0, 4));
        if (data.__additionalStaffRows) {
          try {
            setAdditionalStaffRows(JSON.parse(data.__additionalStaffRows));
          } catch {
            setAdditionalStaffRows([]);
          }
        }
        pendingDraftFillRef.current = data; // rest gets filled once the right number of trainee rows exist
      } catch {
        setNumSlots(4);
        setReservedSlots(0);
        setTimeDigits('');
      }
    } else {
      setNumSlots(4);
      setReservedSlots(0);
      setTimeDigits('');
    }

    setModalOpen(true);
  }

  const openEdit = useCallback((s: SessionRow) => {
    setEditing(s);
    setNumSlots(s.num_slots);
    setReservedSlots(s.traineeRows.filter((row) => row.is_standby).length);
    setStatusValue(s.session_status);
    setBookedValue(s.session_booked);
    setTimeDigits(s.session_time.replace(/\D/g, '').slice(0, 4));

    // Anything in staffRows that ISN'T one of the 9 primary role slots is
    // additional staff — restore those as dynamic rows (role text with the
    // "Add T. " prefix stripped back off for display/editing).
    const additional = s.staffRows
      .filter((r) => !PRIMARY_ROLE_CODES.some((code) => r.role === code || r.role.startsWith(`${code},`)))
      .map((r) => ({ name: r.staff_name, role: r.role.replace(/^Add T\.\s*/, '') }));
    setAdditionalStaffRows(additional);
    setHasInternal(hasIH(s.staffRows, 'CH_3') || hasIH(s.staffRows, 'CH_4'));

    setModalOpen(true);
  }, []);

  const requestDelete = useCallback((session: SessionRow) => {
    setDeleteTarget({ id: session.session_id, name: session.session_name || 'this session' });
  }, []);

  function handleTimeChange(e: React.ChangeEvent<HTMLInputElement>) {
    setTimeDigits(e.target.value.replace(/\D/g, '').slice(0, 4));
  }

  function handleTimeKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Always chop one raw digit, regardless of where the (visual-only)
    // colon sits — this is what makes "14:" -> "1" happen in a single
    // press instead of getting stuck removing just the colon first.
    if (e.key === 'Backspace') {
      e.preventDefault();
      setTimeDigits((prev) => prev.slice(0, -1));
    }
  }

  // ── Paste-prefill: parse the pasted block, look up known_trainees if
  // identity info is missing/partial, and write directly into that
  // trainee slot's DOM fields (same imperative pattern as the draft-fill
  // effect below — these are uncontrolled inputs, not React state). ──
  function setTraineeField(n: number, name: string, value: string) {
    if (!formRef.current) return;
    const el = formRef.current.elements.namedItem(`trainee_${n}_${name}`);
    if (el instanceof HTMLInputElement) el.value = value;
  }

  function closeQuickFill() {
    setQuickFillSlot(null);
    setPasteText('');
    setPasteError(null);
    setPasteWarning(null);
    setSearchQuery('');
    setSearchResults([]);
  }

  async function handlePasteFill() {
    if (quickFillSlot === null || !formRef.current) return;
    setPasteError(null);
    setPasteWarning(null);

    const parsed = parseTraineePaste(pasteText);

    const reqCheck = checkRequiredSessionFields(parsed);
    if (!reqCheck.ok) {
      setPasteError(`Missing required field(s): ${reqCheck.missing.join(', ')}.`);
      return;
    }

    const idCheck = checkIdentityFields(parsed.discordId, parsed.discordUsername, parsed.robloxUsername);
    if (!idCheck.anyProvided) {
      setPasteError('Please input any of the fields: Discord ID, Discord Username, Roblox Username.');
      return;
    }

    const formatCheck = checkIdentityFieldFormats(parsed.discordId, parsed.discordUsername, parsed.robloxUsername);
    if (!formatCheck.ok) {
      setPasteError(formatCheck.errors.join(' '));
      return;
    }

    setPasteLoading(true);

    let resolvedHost = parsed.host;
    if (parsed.hostDiscordId) {
      const { name, error: idError } = await resolveHostByDiscordId(parsed.hostDiscordId);
      if (idError || !name) {
        setPasteLoading(false);
        setPasteError(idError ?? 'Could not resolve the Host mention.');
        return;
      }
      resolvedHost = name;
    } else {
      const rankError = await validateHostRank(parsed.host, parsed.hostPrefix);
      if (rankError) {
        setPasteLoading(false);
        setPasteError(rankError);
        return;
      }
    }

    let robloxUsername = parsed.robloxUsername;
    let discordUsername = parsed.discordUsername;
    let discordId = parsed.discordId;

    // Only look up / require full identity if something's actually missing —
    // a complete paste never needs to touch known_trainees at all.
    if (!idCheck.ok) {
      const match = await lookupKnownTrainee(discordId, discordUsername);
      if (match) {
        discordId = match.discordId ?? discordId;
        discordUsername = match.discordUsername || discordUsername;
        robloxUsername = match.robloxUsername ?? robloxUsername;
      } else {
        const stillMissing = checkIdentityFields(discordId, discordUsername, robloxUsername).missing;
        setPasteLoading(false);
        setPasteError(`This trainee isn't in known_trainees yet — please also fill in: ${stillMissing.join(', ')}.`);
        return;
      }
    }
    setPasteLoading(false);

    // Soft cross-check only — never blocks filling the form.
    const form = formRef.current;
    const currentHost = (form.elements.namedItem('host') as HTMLSelectElement | null)?.value ?? '';
    const currentDate = (form.elements.namedItem('session_date') as HTMLInputElement | null)?.value ?? '';
    const warnings: string[] = [];
    if (currentHost && resolvedHost.toLowerCase() !== currentHost.toLowerCase()) {
      warnings.push(`Pasted host "${resolvedHost}" doesn't match this session's host "${currentHost}".`);
    }
    if (!looksLikeSameDate(parsed.dateTime, currentDate)) {
      warnings.push(`Pasted date "${parsed.dateTime}" doesn't look like it matches this session's date.`);
    }

    const n = quickFillSlot;
    setTraineeField(n, 'roblox', robloxUsername);
    setTraineeField(n, 'discord', discordUsername);
    setTraineeField(n, 'discord_id', discordId);
    setTraineeField(n, 'zone', parsed.zone);
    if (parsed.notes) setTraineeField(n, 'note', parsed.notes);
    updateDuplicateWarnings();

    if (warnings.length > 0) {
      setPasteWarning(warnings.join(' '));
      return; // leave panel open so they can see the warning before closing
    }
    closeQuickFill();
  }

  // Debounced live search against known_trainees while typing.
  useEffect(() => {
    if (quickFillMode !== 'search' || quickFillSlot === null || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    const timeout = setTimeout(async () => {
      const results = await searchKnownTrainees(searchQuery);
      setSearchResults(results);
      setSearchLoading(false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery, quickFillMode, quickFillSlot]);

  function handleSearchPick(match: KnownTraineeMatch) {
    if (quickFillSlot === null) return;
    setTraineeField(quickFillSlot, 'roblox', match.robloxUsername ?? '');
    setTraineeField(quickFillSlot, 'discord', match.discordUsername);
    setTraineeField(quickFillSlot, 'discord_id', match.discordId ?? '');
    updateDuplicateWarnings();
    closeQuickFill();
  }

  // Phase 2 of draft restore — runs once the DOM has caught up to the
  // restored numSlots, so trainee_5+ fields actually exist to fill in.
  useEffect(() => {
    if (!modalOpen || editing || !pendingDraftFillRef.current || !formRef.current) return;
    const data = pendingDraftFillRef.current;
    const form = formRef.current;

    for (const [key, value] of Object.entries(data)) {
      // session_status/session_booked/session_time are all controlled
      // React state now — setting them here would be immediately
      // overwritten by React's own render, they're handled in openAdd instead.
      if (
        key === 'session_status' || key === 'session_booked' || key === 'session_time' || key === 'num_slots' || key === 'reserved_slots' || key === 'action' ||
        key === 'additional_staff_name' || key === 'additional_staff_role' || key === '__additionalStaffRows'
      ) continue;
      const el = form.elements.namedItem(key);
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
        el.value = value;
      }
    }
    pendingDraftFillRef.current = null;
  }, [modalOpen, editing, numSlots, reservedSlots]);

  useEffect(() => {
    if (!modalOpen || !shouldRender) return;
    const frame = requestAnimationFrame(updateDuplicateWarnings);
    return () => cancelAnimationFrame(frame);
  }, [modalOpen, shouldRender, editing, numSlots, reservedSlots, additionalStaffRows, updateDuplicateWarnings]);

  // Autosave every change to localStorage — Add mode only. Editing an
  // existing session already has safe data sitting in the DB.
  function handleFormChange() {
    updateDuplicateWarnings();
    if (editing || !formRef.current) return;
    const entries = Array.from(new FormData(formRef.current).entries());
    const data: Record<string, string> = {};
    for (const [key, value] of entries) {
      // additional_staff_name/role repeat per row — FormData.entries() would
      // collapse them to just the last one in a flat object, so they're
      // saved separately below via additionalStaffRows state instead.
      if (key === 'additional_staff_name' || key === 'additional_staff_role') continue;
      if (typeof value === 'string') data[key] = value;
    }
    data.__additionalStaffRows = JSON.stringify(additionalStaffRows);
    localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
  }

  async function handleSave(formData: FormData) {
    try {
      const result = await saveSession(formData);
      if (result.success) {
        localStorage.removeItem(DRAFT_KEY);
        setModalOpen(false);
      }
      showToast(result.message, result.success ? 'success' : 'error');
    } catch {
      showToast('Could not save session. Please try again.', 'error');
    }
  }

  async function handleDelete(formData: FormData) {
    try {
      const result = await deleteSession(formData);
      if (result.success) {
        localStorage.removeItem(DRAFT_KEY);
        setDeleteTarget(null);
      }
      showToast(result.message, result.success ? 'success' : 'error');
    } catch {
      showToast('Could not delete session. Please try again.', 'error');
    }
  }

  const standbyRows = editing?.traineeRows
    .filter((row) => row.is_standby)
    .sort((a, b) => a.slot_number - b.slot_number) ?? [];
  const traineeFieldRows = [
    ...Array.from({ length: numSlots }, (_, i) => ({
      fieldIndex: i + 1,
      label: `Trainee ${i + 1}`,
      isReserved: false,
      defaultRow: editing?.traineeRows.find((row) => !row.is_standby && row.slot_number === i + 1),
    })),
    ...Array.from({ length: reservedSlots }, (_, i) => ({
      fieldIndex: numSlots + i + 1,
      label: `Standby / Reserved ${i + 1}`,
      isReserved: true,
      defaultRow: standbyRows[i],
    })),
  ];

  return (
    <>
      <div className="page-header">
        <div>
          <div className="section-label">Manage Sessions</div>
          <p className="section-sub">
            {hasActiveFilter
              ? `${filteredSessions.length} of ${sessions.length} session${sessions.length !== 1 ? 's' : ''}`
              : `${sessions.length} session${sessions.length !== 1 ? 's' : ''} total`}
          </p>
        </div>
        {permLevel >= 10 && (
          <div className="page-header-actions">
            <GlobalQuickFillTrainee />
            <button className="btn-primary" onClick={openAdd}>
              <FontAwesomeIcon icon={isRequestMode ? faEnvelopeOpenText : faPlus} />
              {isRequestMode ? ' Request Session' : ' Add Session'}
            </button>
          </div>
        )}
      </div>

      <div className="filter-bar">
        <div className="search-wrap">
          <FontAwesomeIcon icon={faMagnifyingGlass} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Search by ID, host, name, date (DD/MM or MM/DD), or time (24h)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 150)} // delay so a suggestion click registers first
            autoComplete="off"
          />
          {searchFocused && suggestions.length > 0 && (
            <div className="search-suggestions">
              {suggestions.map((s) => (
                <button
                  type="button"
                  key={s.session_id}
                  className="search-suggestion-item"
                  onMouseDown={() => {
                    openEdit(s);
                    setSearchFocused(false);
                  }}
                >
                  <span className="suggestion-name">{s.session_name || `Session #${s.session_id}`}</span>
                  <span className="suggestion-meta">
                    #{s.session_id} · {getHostName(s)} · {new Date(`${s.session_date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} {s.session_time.slice(0, 5)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <select className="filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          {['Requested', 'Scheduled', 'Booked', 'Cancelled', 'Postponed'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <input
          type="text"
          className="filter-input"
          placeholder="Filter by host…"
          value={hostFilter}
          onChange={(e) => setHostFilter(e.target.value)}
        />
        {hasActiveFilter && (
          <button type="button" className="btn-clear-link" onClick={clearFilters}>
            <FontAwesomeIcon icon={faXmark} /> Clear
          </button>
        )}
      </div>

      {filteredSessions.length === 0 ? (
        <div className="table-wrap">
          <div className="empty-state"><p>{hasActiveFilter ? 'No sessions match your filters.' : 'No sessions found.'}</p></div>
        </div>
      ) : (
        <SessionTable
          sessions={filteredSessions}
          canManage={permLevel >= 10}
          canDelete={permLevel >= 15}
          onEdit={openEdit}
          onDelete={requestDelete}
          timezoneMode={timezoneMode}
        />
      )}

      {/* ══ ADD / EDIT MODAL ══ */}
      {shouldRender && (
        <div className="modal-backdrop" onClick={() => setModalOpen(false)}>
          <div className={`modal-box gb-popup-scale${visible ? ' visible-lightbox' : ''}`} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2 className="modal-title">{editing ? 'Edit Session' : isRequestMode ? 'Request Session' : 'Add Session'}</h2>
                <button className="modal-close-btn" onClick={() => setModalOpen(false)}><FontAwesomeIcon icon={faTimes} /></button>
              </div>

              <form
                ref={formRef}
                action={handleSave}
                onChange={handleFormChange}
                onSubmit={(event) => {
                  const duplicates = findDuplicateAssignments(new FormData(event.currentTarget));
                  if (duplicates.size === 0) return;
                  event.preventDefault();
                  setDuplicateFields(duplicates);
                }}
                className="modal-form"
              >
                <input type="hidden" name="action" value={editing ? 'edit' : 'add'} />
                <input type="hidden" name="reserved_slots" value={reservedSlots} />
                {editing && <input type="hidden" name="session_id" value={editing.session_id} />}

                {!editing && (
                  <div className="form-group">
                    <label>Custom Session ID <span className="label-hint">(optional — leave blank to auto-assign)</span></label>
                    <input type="number" name="custom_session_id" min={1} placeholder="Auto-assign" />
                  </div>
                )}

                <div className="form-row">
                  <div className="form-group flex2">
                    <label>Session Name*</label>
                    <input type="text" name="session_name" required defaultValue={editing?.session_name ?? 'PS x YSS SCR Shift : SG Practice'} placeholder="e.g. Training Session #67" />
                  </div>
                  <div className="form-group">
                    <label>Status*</label>
                    <select
                      name="session_status"
                      value={statusValue}
                      onChange={(e) => {
                        const v = e.target.value;
                        setStatusValue(v);
                        if (v === 'Requested') setBookedValue(false); // can't be booked while still just requested
                      }}
                    >
                      <option value="Requested">Requested</option>
                      <option value="Booked">Booked</option>
                      <option value="Scheduled">Scheduled</option>
                      <option value="Cancelled">Cancelled</option>
                      <option value="Postponed">Postponed</option>
                    </select>
                  </div>
                  <div className="form-group form-check-group">
                    <label>Booked?</label>
                    <label className={`toggle-wrap${statusValue === 'Requested' ? ' toggle-disabled' : ''}`}>
                      <input
                        type="checkbox"
                        name="session_booked"
                        checked={bookedValue}
                        disabled={statusValue === 'Requested'}
                        onChange={(e) => setBookedValue(e.target.checked)}
                      />
                      <span className="toggle-track"><span className="toggle-thumb" /></span>
                    </label>
                  </div>
                </div>

                <div className="form-group">
                  <label>Description</label>
                  <textarea name="session_desc" rows={2} defaultValue={editing?.session_desc ?? ''} placeholder="Short session description…" />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Date*</label>
                    <input type="date" name="session_date" required defaultValue={editing?.session_date ?? ''} />
                  </div>
                  <div className="form-group">
                    <label>TIME* ({timezoneMode})</label>
                    <input
                      type="text"
                      name="session_time"
                      inputMode="numeric"
                      maxLength={5}
                      placeholder="HH:MM"
                      required
                      value={formatTimeDisplay(timeDigits)}
                      onChange={handleTimeChange}
                      onKeyDown={handleTimeKeyDown}
                    />
                  </div>
                  <div className="form-group">
                    <label>EXP. DUR* (min)</label>
                    <input type="number" name="session_duration" min={60} max={180} step={5} placeholder="60" defaultValue={editing?.session_duration ?? ''} />
                  </div>
                  <div className="form-group">
                    <label>SLOTS*</label>
                    <input
                      type="number" name="num_slots" min={4} max={10} placeholder="4"
                      value={numSlots}
                      onChange={(e) => setNumSlots(Math.max(4, Math.min(10, parseInt(e.target.value, 10) || 4)))}
                    />
                  </div>
                  <div className="form-group">
                    <label>TR. Timer* (min)</label>
                    <input type="number" name="trainee_timer" min={8} max={20} placeholder="15" defaultValue={editing?.trainee_timer ?? ''} />
                  </div>
                </div>

                <div className="form-divider"><span>Staff Assignment</span></div>

                <label className="internal-toggle">
                  <input type="checkbox" checked={hasInternal} onChange={(e) => setHasInternal(e.target.checked)} />
                  Session has internal?
                </label>

                <div className="form-row">
                  <div className="form-group flex2">
                    <label className="assignment-label"><FontAwesomeIcon icon={faCrown} style={{ color: 'rgba(255,210,80,.7)', fontSize: '.7rem', marginRight: 4 }} /> Host* <DuplicateWarning visible={duplicateFields.has('host')} label="Duplicate staff" /></label>
                    <StaffSelect name="host" staff={staff} authKey="host_auth" defaultValue={editing ? findPrimaryStaff(editing.staffRows, 'HOST') : ''} />
                  </div>
                </div>

                <div className="form-row">
                  {(['co_host1', 'co_host2', 'co_host3', 'co_host4_supervisor'] as const).map((f, i) => {
                    const code = ['CH_1', 'CH_2', 'CH_3', 'CH_4'][i];
                    const ihField = i === 2 ? 'co_host3_ih' : i === 3 ? 'co_host4_ih' : null;
                    return (
                      <div className="form-group" key={f}>
                        <label className="assignment-label">{i < 3 ? `Co-Host ${i + 1}` : 'Co-Host 4 / SV'} <DuplicateWarning visible={duplicateFields.has(f)} label="Duplicate staff" /></label>
                        <StaffSelect name={f} staff={staff} authKey="cohost_auth" defaultValue={editing ? findPrimaryStaff(editing.staffRows, code) : ''} />
                        {ihField && hasInternal && (
                          <label className="ih-check">
                            <input type="checkbox" name={ihField} defaultChecked={editing ? hasIH(editing.staffRows, code) : false} />
                            Also Internal Helper
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>

                {hasInternal && (
                  <p className="internal-hint">
                    Add standalone Internal Helpers below using <strong>&quot;IH&quot;</strong> or
                    <strong> &quot;Internal Helper&quot;</strong>. The first fills Co-Host 4 / SV; any others remain Additional Staff.
                  </p>
                )}

                <div className="form-row">
                  {(['assistant_1', 'assistant_2', 'assistant_3', 'assistant_4'] as const).map((f, i) => {
                    const code = ['AST_1', 'AST_2', 'AST_3', 'AST_4'][i];
                    return (
                      <div className="form-group" key={f}>
                        <label className="assignment-label">Assistant {i + 1} <DuplicateWarning visible={duplicateFields.has(f)} label="Duplicate staff" /></label>
                        <StaffSelect name={f} staff={staff} authKey="asst_auth" defaultValue={editing ? findPrimaryStaff(editing.staffRows, code) : ''} />
                      </div>
                    );
                  })}
                </div>

                <div className="form-group">
                  <label className="assignment-label">Additional Staff <DuplicateWarning visible={duplicateFields.has('additional_staff_name')} label="Duplicate staff" /></label>
                  {additionalStaffRows.map((row, i) => (
                    <div className="additional-staff-row" key={i}>
                      <input
                        type="text"
                        name="additional_staff_name"
                        placeholder="Name"
                        value={row.name}
                        onChange={(e) => {
                          const next = [...additionalStaffRows];
                          next[i] = { ...next[i], name: e.target.value };
                          setAdditionalStaffRows(next);
                        }}
                      />
                      <input
                        type="text"
                        name="additional_staff_role"
                        placeholder="Role (e.g. Observer, IH)"
                        value={row.role}
                        onChange={(e) => {
                          const next = [...additionalStaffRows];
                          next[i] = { ...next[i], role: e.target.value };
                          setAdditionalStaffRows(next);
                        }}
                      />
                      <button type="button" className="row-remove-btn" onClick={() => setAdditionalStaffRows(additionalStaffRows.filter((_, j) => j !== i))}>
                        <FontAwesomeIcon icon={faTimes} />
                      </button>
                    </div>
                  ))}
                  <button type="button" className="btn-ghost btn-add-row" onClick={() => setAdditionalStaffRows([...additionalStaffRows, { name: '', role: '' }])}>
                    <FontAwesomeIcon icon={faPlus} /> Add Staff
                  </button>
                </div>

                <div className="form-divider"><span>Trainee Assignment</span></div>

                {traineeFieldRows.map(({ fieldIndex: n, label, isReserved, defaultRow: t }) => {
                  const panelOpen = quickFillSlot === n;
                  return (
                    <div className="trainee-slot" key={n}>
                      {isReserved && <input type="hidden" name={`trainee_${n}_standby`} value="on" />}
                      <div className="trainee-slot-header">
                        <div className="trainee-slot-label">{label}</div>
                        <div className="trainee-slot-header-right">
                          <button
                            type="button"
                            className={`btn-paste${panelOpen ? ' active' : ''}`}
                            onClick={() => (panelOpen ? closeQuickFill() : (setQuickFillSlot(n), setQuickFillMode('search')))}
                          >
                            <FontAwesomeIcon icon={faMagnifyingGlass} /> Quick Fill
                          </button>
                        </div>
                      </div>

                      {/* ══ Inline quick-fill panel — search or paste, right in the slot ══ */}
                      {panelOpen && (
                        <div className="quick-fill-panel">
                          <div className="quick-fill-tabs">
                            <button type="button" className={quickFillMode === 'search' ? 'active' : ''} onClick={() => setQuickFillMode('search')}>
                              <FontAwesomeIcon icon={faMagnifyingGlass} /> Search
                            </button>
                            <button type="button" className={quickFillMode === 'paste' ? 'active' : ''} onClick={() => setQuickFillMode('paste')}>
                              <FontAwesomeIcon icon={faClipboard} /> Paste
                            </button>
                          </div>

                          {quickFillMode === 'search' ? (
                            <>
                              <input
                                type="text"
                                className="quick-fill-search-input"
                                placeholder="Search known trainees by Discord or Roblox name…"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                autoFocus
                              />
                              {searchLoading && <div className="quick-fill-hint">Searching…</div>}
                              {!searchLoading && searchQuery.trim().length >= 2 && searchResults.length === 0 && (
                                <div className="quick-fill-hint">No matches in known_trainees — try Paste instead to add them.</div>
                              )}
                              {searchResults.length > 0 && (
                                <div className="quick-fill-results">
                                  {searchResults.map((r) => (
                                    <button type="button" key={r.discordId ?? r.discordUsername} className="quick-fill-result" onClick={() => handleSearchPick(r)}>
                                      <span className="qfr-discord">{r.discordUsername}</span>
                                      {r.robloxUsername && <span className="qfr-roblox">{r.robloxUsername}</span>}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </>
                          ) : (
                            <>
                              <textarea
                                className="paste-textarea"
                                rows={7}
                                placeholder={'[Trainee discord ID]\n[Trainee discord username]\n[Trainee roblox username]\n`Host:` [HOST]\n`Date/Time:` DD/MM/YYYY HH:MM\n`Position:` [Position]\n`Zone:` [Zone]\n`Trainee Notes:` [optional]'}
                                value={pasteText}
                                onChange={(e) => setPasteText(e.target.value)}
                              />
                              {pasteError && <div className="alert alert-error">{pasteError}</div>}
                              {pasteWarning && <div className="alert paste-warning">{pasteWarning}</div>}
                              <button type="button" className="btn-primary quick-fill-paste-btn" disabled={pasteLoading} onClick={handlePasteFill}>
                                {pasteLoading ? 'Checking…' : 'Fill Trainee'}
                              </button>
                            </>
                          )}
                        </div>
                      )}

                      <div className="form-row">
                        <div className="form-group flex2">
                          <label className="assignment-label">Roblox Username <DuplicateWarning visible={duplicateFields.has(`trainee_${n}_roblox`)} label="Duplicate trainee" /></label>
                          <input type="text" name={`trainee_${n}_roblox`} defaultValue={t?.trainee_roblox_username ?? ''} />
                        </div>
                        <div className="form-group flex2">
                          <label className="assignment-label">Discord Username <DuplicateWarning visible={duplicateFields.has(`trainee_${n}_discord`)} label="Duplicate trainee" /></label>
                          <input type="text" name={`trainee_${n}_discord`} defaultValue={t?.trainee_discord ?? ''} />
                        </div>
                        <div className="form-group">
                          <label className="assignment-label">Discord ID <DuplicateWarning visible={duplicateFields.has(`trainee_${n}_discord_id`)} label="Duplicate trainee" /></label>
                          <input type="text" name={`trainee_${n}_discord_id`} defaultValue={t?.trainee_discord_id ?? ''} />
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-group flex2">
                          <label>Note</label>
                          <input type="text" name={`trainee_${n}_note`} defaultValue={t?.note ?? ''} />
                        </div>
                        <div className="form-group flex2">
                          <label>Zone</label>
                          <input type="number" name={`trainee_${n}_zone`} defaultValue={t?.zone ?? ''} />
                        </div>
                      </div>
                    </div>
                  );
                })}

                <div className="reserved-slot-actions">
                  <span className="trainee-capacity-label" role="status" style={{ alignSelf: 'center', color: 'rgba(255,255,255,.5)', fontSize: '.72rem' }}>
                    {countSessionTraineeSlots(numSlots, reservedSlots)}/{MAX_SESSION_TRAINEES} trainee slots
                  </span>
                  <button
                    type="button"
                    className="btn-ghost btn-add-row"
                    disabled={reservedSlots >= 10 || countSessionTraineeSlots(numSlots, reservedSlots) >= MAX_SESSION_TRAINEES}
                    title={countSessionTraineeSlots(numSlots, reservedSlots) >= MAX_SESSION_TRAINEES ? `Maximum ${MAX_SESSION_TRAINEES} trainee slots per session.` : undefined}
                    onClick={() => setReservedSlots((count) => Math.min(10, count + 1))}
                  >
                    <FontAwesomeIcon icon={faPlus} /> Add standby/reserved slot
                  </button>
                  {reservedSlots > 0 && (
                    <button
                      type="button"
                      className="btn-ghost btn-add-row"
                      onClick={() => setReservedSlots((count) => Math.max(0, count - 1))}
                    >
                      Remove last reserved slot
                    </button>
                  )}
                </div>

                <div className="modal-footer">
                  <button type="button" className="btn-ghost" onClick={() => setModalOpen(false)}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={duplicateFields.size > 0} title={duplicateFields.size > 0 ? 'Remove duplicate assignments before saving.' : undefined}>{editing ? 'Save Changes' : isRequestMode ? 'Submit Request' : 'Add Session'}</button>
                </div>
              </form>
            
          </div>
        </div>
      )}

      {/* ══ DELETE CONFIRM MODAL ══ */}
      {deleteTarget && (
        <div className="modal-backdrop" onClick={() => setDeleteTarget(null)}>
          <div className="modal-box modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Delete Session</h2>
              <button className="modal-close-btn" onClick={() => setDeleteTarget(null)}><FontAwesomeIcon icon={faTimes} /></button>
            </div>
            <p className="delete-msg">Are you sure you want to delete &quot;{deleteTarget.name}&quot;?</p>
            <form action={handleDelete}>
              <input type="hidden" name="session_id" value={deleteTarget.id} />
              <div className="modal-footer">
                <button type="button" className="btn-ghost" onClick={() => setDeleteTarget(null)}>Cancel</button>
                <button type="submit" className="btn-danger">Delete</button>
              </div>
            </form>
          </div>
        </div>
      )}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
