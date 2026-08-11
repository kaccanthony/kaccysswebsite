// FILE: app/(app)/managesession/ManageSessionInteractive.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPen, faTrash, faTimes, faCrown, faPlus, faEnvelopeOpenText,
  faMagnifyingGlass, faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { saveSession, deleteSession } from './actions';

const DRAFT_KEY = 'managesession_draft';

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
  host: string;
  co_host1: string | null;
  co_host2: string | null;
  co_host3: string | null;
  co_host4_supervisor: string | null;
  assistant_1: string | null;
  assistant_2: string | null;
  assistant_3: string | null;
  assistant_4: string | null;
  additional_staff: string | null;
  [key: string]: unknown; // trainee_N_* fields
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

function StaffSelect({
  name, staff, authKey, defaultValue,
}: {
  name: string;
  staff: StaffOption[];
  authKey: 'host_auth' | 'cohost_auth' | 'asst_auth';
  defaultValue?: string | null;
}) {
  const eligible = staff.filter((s) => s[authKey]);
  const grouped = groupByRank(eligible);

  return (
    <select className="staff-select" name={name} defaultValue={defaultValue ?? ''}>
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

export default function ManageSessionInteractive({
  sessions,
  staff,
  rawRole,
  permLevel,
  success,
}: {
  sessions: SessionRow[];
  staff: StaffOption[];
  rawRole: string;
  permLevel: number;
  success?: string;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SessionRow | null>(null);
  const [numSlots, setNumSlots] = useState(4);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [statusValue, setStatusValue] = useState('Requested');
  const [bookedValue, setBookedValue] = useState(false);
  const [timeDigits, setTimeDigits] = useState(''); // raw digits only, e.g. "1430" — colon is derived, never stored

  const formRef = useRef<HTMLFormElement>(null);
  const pendingDraftFillRef = useRef<Record<string, string> | null>(null);

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
      if (h && !s.host.toLowerCase().includes(h)) return false;
      if (q) {
        const matchesId = String(s.session_id).includes(q);
        const matchesHost = s.host.toLowerCase().includes(q);
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

    const raw = typeof window !== 'undefined' ? localStorage.getItem(DRAFT_KEY) : null;
    if (raw) {
      try {
        const data = JSON.parse(raw) as Record<string, string>;
        setNumSlots(Math.max(4, Math.min(10, parseInt(data.num_slots, 10) || 4)));
        if (data.session_status) setStatusValue(data.session_status);
        setBookedValue(data.session_booked === 'on');
        setTimeDigits((data.session_time ?? '').replace(/\D/g, '').slice(0, 4));
        pendingDraftFillRef.current = data; // rest gets filled once the right number of trainee rows exist
      } catch {
        setNumSlots(4);
        setTimeDigits('');
      }
    } else {
      setNumSlots(4);
      setTimeDigits('');
    }

    setModalOpen(true);
  }

  function openEdit(s: SessionRow) {
    setEditing(s);
    setNumSlots(s.num_slots);
    setStatusValue(s.session_status);
    setBookedValue(s.session_booked);
    setTimeDigits(s.session_time.replace(/\D/g, '').slice(0, 4));
    setModalOpen(true);
  }

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
      if (key === 'session_status' || key === 'session_booked' || key === 'session_time' || key === 'num_slots' || key === 'action') continue;
      const el = form.elements.namedItem(key);
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
        el.value = value;
      }
    }
    pendingDraftFillRef.current = null;
  }, [modalOpen, editing, numSlots]);

  // Autosave every change to localStorage — Add mode only. Editing an
  // existing session already has safe data sitting in the DB.
  function handleFormChange() {
    if (editing || !formRef.current) return;
    const entries = Array.from(new FormData(formRef.current).entries());
    const data: Record<string, string> = {};
    for (const [key, value] of entries) {
      if (typeof value === 'string') data[key] = value;
    }
    localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
  }

  // Confirmed success (redirected back with ?success=...) means whatever
  // was in progress actually saved — safe to clear the draft.
  useEffect(() => {
    if (success) {
      localStorage.removeItem(DRAFT_KEY);
    }
  }, [success]);

  const slotArray = Array.from({ length: numSlots }, (_, i) => i + 1);

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
          <button className="btn-primary" onClick={openAdd}>
            <FontAwesomeIcon icon={isRequestMode ? faEnvelopeOpenText : faPlus} />
            {isRequestMode ? ' Request Session' : ' Add Session'}
          </button>
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
                    #{s.session_id} · {s.host} · {new Date(`${s.session_date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} {s.session_time.slice(0, 5)}
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

      <div className="table-wrap">
        {filteredSessions.length === 0 ? (
          <div className="empty-state"><p>{hasActiveFilter ? 'No sessions match your filters.' : 'No sessions found.'}</p></div>
        ) : (
          <table className="session-table">
            <thead>
              <tr>
                <th>ID</th><th>Session</th><th>Status</th><th>Host</th>
                <th>Date &amp; Time</th><th>Slots</th><th>Duration</th>
                {permLevel >= 10 && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filteredSessions.map((s) => {
                const filled = Array.from({ length: 10 }, (_, i) => s[`trainee_${i + 1}_name`]).filter(Boolean).length;
                return (
                  <tr key={s.session_id}>
                    <td className="td-id">#{s.session_id}</td>
                    <td className="td-name">
                      <div className="td-name-inner">
                        <span className="session-name">{s.session_name || '—'}</span>
                        {s.session_desc && <span className="session-desc">{s.session_desc.slice(0, 55)}</span>}
                      </div>
                    </td>
                    <td><span className={`badge ${statusBadgeClass(s.session_status)}`}>{s.session_status}</span></td>
                    <td className="td-host">
                      <div className="td-host-inner">
                        <FontAwesomeIcon icon={faCrown} className="td-host-icon" /> {s.host}
                      </div>
                    </td>
                    <td className="td-date">
                      <span className="date-main">
                        {new Date(`${s.session_date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                      <span className="date-time">
                        {new Date(`${s.session_date}T${s.session_time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </td>
                    <td><span className={`slots-pill ${filled >= s.num_slots ? 'slots-full' : ''}`}>{filled}/{s.num_slots}</span></td>
                    <td className="td-dur">{s.session_duration} min</td>
                    {permLevel >= 10 && (
                      <td className="td-actions">
                        <div className="td-actions-inner">
                          <button className="action-btn" title="Edit" onClick={() => openEdit(s)}>
                            <FontAwesomeIcon icon={faPen} />
                          </button>
                          {permLevel >= 15 && (
                            <button
                              className="action-btn danger"
                              title="Delete"
                              onClick={() => setDeleteTarget({ id: s.session_id, name: s.session_name || 'this session' })}
                            >
                              <FontAwesomeIcon icon={faTrash} />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ══ ADD / EDIT MODAL ══ */}
      {modalOpen && (
        <div className="modal-backdrop" onClick={() => setModalOpen(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{editing ? 'Edit Session' : isRequestMode ? 'Request Session' : 'Add Session'}</h2>
              <button className="modal-close-btn" onClick={() => setModalOpen(false)}><FontAwesomeIcon icon={faTimes} /></button>
            </div>

            <form ref={formRef} action={saveSession} onChange={handleFormChange} className="modal-form">
              <input type="hidden" name="action" value={editing ? 'edit' : 'add'} />
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
                  <label>TIME* (BST)</label>
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

              <div className="form-row">
                <div className="form-group flex2">
                  <label><FontAwesomeIcon icon={faCrown} style={{ color: 'rgba(255,210,80,.7)', fontSize: '.7rem', marginRight: 4 }} /> Host*</label>
                  <StaffSelect name="host" staff={staff} authKey="host_auth" defaultValue={editing?.host} />
                </div>
              </div>

              <div className="form-row">
                {(['co_host1', 'co_host2', 'co_host3', 'co_host4_supervisor'] as const).map((f, i) => (
                  <div className="form-group" key={f}>
                    <label>{i < 3 ? `Co-Host ${i + 1}` : 'Co-Host 4 / SV'}</label>
                    <StaffSelect name={f} staff={staff} authKey="cohost_auth" defaultValue={editing?.[f] as string} />
                  </div>
                ))}
              </div>

              <div className="form-row">
                {(['assistant_1', 'assistant_2', 'assistant_3', 'assistant_4'] as const).map((f, i) => (
                  <div className="form-group" key={f}>
                    <label>Assistant {i + 1}</label>
                    <StaffSelect name={f} staff={staff} authKey="asst_auth" defaultValue={editing?.[f] as string} />
                  </div>
                ))}
              </div>

              <div className="form-group">
                <label>Additional Staff <span className="label-hint">(include role after name)</span></label>
                <input type="text" name="additional_staff" defaultValue={editing?.additional_staff ?? ''} placeholder="e.g. Yoshi5336 [Observer]" />
              </div>

              <div className="form-divider"><span>Trainee Assignment</span></div>

              {slotArray.map((n) => (
                <div className="trainee-slot" key={n}>
                  <div className="trainee-slot-label">Trainee {n}</div>
                  <div className="form-row">
                    <div className="form-group flex2">
                      <label>Roblox Username</label>
                      <input type="text" name={`trainee_${n}_name`} defaultValue={(editing?.[`trainee_${n}_name`] as string) ?? ''} />
                    </div>
                    <div className="form-group flex2">
                      <label>Discord Username</label>
                      <input type="text" name={`trainee_${n}_discord`} defaultValue={(editing?.[`trainee_${n}_discord`] as string) ?? ''} />
                    </div>
                    <div className="form-group">
                      <label>Discord ID</label>
                      <input type="text" name={`trainee_${n}_discord_id`} defaultValue={(editing?.[`trainee_${n}_discord_id`] as string) ?? ''} />
                    </div>
                    <div className="form-group">
                      <label>Zone</label>
                      <input type="number" name={`trainee_${n}_zone`} defaultValue={(editing?.[`trainee_${n}_zone`] as number) ?? ''} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Note</label>
                    <input type="text" name={`trainee_${n}_note`} defaultValue={(editing?.[`trainee_${n}_note`] as string) ?? ''} />
                  </div>
                </div>
              ))}

              <div className="modal-footer">
                <button type="button" className="btn-ghost" onClick={() => setModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary">{editing ? 'Save Changes' : isRequestMode ? 'Submit Request' : 'Add Session'}</button>
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
            <form action={deleteSession}>
              <input type="hidden" name="session_id" value={deleteTarget.id} />
              <div className="modal-footer">
                <button type="button" className="btn-ghost" onClick={() => setDeleteTarget(null)}>Cancel</button>
                <button type="submit" className="btn-danger">Delete</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}