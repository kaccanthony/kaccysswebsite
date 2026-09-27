'use client';
// FILE: app/(app)/setup/SetupSessionInteractive.tsx

import { useCallback, useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlay, faClock, faHourglassHalf, faIdBadge, faCrown, faUserTie, faUserGear, faUser,
  faGraduationCap, faNoteSticky, faXmark, faMagnifyingGlass, faPaste, faCalendarDay,
} from '@fortawesome/free-solid-svg-icons';
import {
  StaffSelect, findPrimaryStaff, hasIH,
  type SessionRow, type StaffOption, type StaffChildRow,
} from '../managesession/ManageSessionInteractive';
import { parseTraineePaste, looksLikeSameDate, checkRequiredSessionFields, checkIdentityFields, checkIdentityFieldFormats } from '../managesession/parseTraineePaste';
import { lookupKnownTrainee, validateHostRank, resolveHostByDiscordId } from '../managesession/traineeActions';
import { searchTraineeCandidates, type TraineeSuggestion } from '@/lib/profileSearch';
import { confirmAndStartSession } from './actions';
import { findDuplicateAssignments } from '../managesession/duplicateAssignments';
import type { SiteTimezoneMode } from '@/lib/siteTimezone';

function statusClass(status: string) {
  return `detail-status--${status.toLowerCase()}`;
}

function additionalStaffFrom(staffRows: StaffChildRow[]) {
  return staffRows
    .filter((r) => r.role.startsWith('Add T. '))
    .map((r) => ({ name: r.staff_name, roleName: r.role.slice('Add T. '.length) }));
}

function DuplicateWarning({ visible }: { visible: boolean }) {
  return visible ? <span className="setup-duplicate-warning" role="status">Duplicate</span> : null;
}

/** Round-robin distribution of trainees across host + co-hosts, for auto trainer mode. */
function computeAutoDistribution(numSlots: number, pool: string[]): string[] {
  const names = pool.filter(Boolean);
  if (names.length === 0) return Array(numSlots).fill('');
  return Array.from({ length: numSlots }, (_, i) => names[i % names.length]);
}

export default function SetupSessionInteractive({
  sessions,
  staff,
  initialSelectedId,
  timezoneMode,
}: {
  sessions: SessionRow[];
  staff: StaffOption[];
  initialSelectedId?: number;
  timezoneMode: SiteTimezoneMode;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(
    initialSelectedId ?? sessions[0]?.session_id ?? null
  );
  const [modalOpen, setModalOpen] = useState(false);

  const selected = sessions.find((s) => s.session_id === selectedId) ?? null;

  return (
    <div className="layout-grid">
      <div className="panel-left">
        <div className="panel-head">
          <span className="panel-label">Your Sessions Today</span>
          <span className="session-count">{sessions.length}</span>
        </div>
        <div className="session-list">
          {sessions.length === 0 ? (
            <div className="empty-state">
              <FontAwesomeIcon icon={faCalendarDay} />
              <p>No sessions assigned to you today.</p>
            </div>
          ) : (
            sessions.map((s) => {
              const host = findPrimaryStaff(s.staffRows, 'HOST');
              const filled = s.traineeRows.filter((t) => !t.is_standby && (t.trainee_discord || t.trainee_roblox_username)).length;
              return (
                <button
                  key={s.session_id}
                  type="button"
                  className={`sesh-card${s.session_id === selectedId ? ' active' : ''}`}
                  onClick={() => setSelectedId(s.session_id)}
                >
                  <div className="sesh-card-top">
                    <span className="sesh-card-name">{s.session_name || `Session #${s.session_id}`}</span>
                    <span className={`sesh-card-status ${statusClass(s.session_status)}`}>{s.session_status}</span>
                  </div>
                  <div className="sesh-card-meta">
                    <span><FontAwesomeIcon icon={faClock} /> {s.session_time.slice(0, 5)} {timezoneMode}</span>
                    <span><FontAwesomeIcon icon={faCrown} /> {host ?? '—'}</span>
                    <span><FontAwesomeIcon icon={faGraduationCap} /> {filled}/{s.num_slots}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="panel-right">
        {!selected ? (
          <div className="empty-state">
            <FontAwesomeIcon icon={faCalendarDay} />
            <p>Select a session on the left to view its details.</p>
          </div>
        ) : (
          <SessionDetail session={selected} timezoneMode={timezoneMode} onSetup={() => setModalOpen(true)} />
        )}
      </div>

      {modalOpen && selected && (
        <SetupModal session={selected} staff={staff} timezoneMode={timezoneMode} onClose={() => setModalOpen(false)} />
      )}
    </div>
  );
}

// ── Detail panel — was setupsesh_detail_partial.php's renderDetailPanel ──
function SessionDetail({
  session: s,
  timezoneMode,
  onSetup,
}: {
  session: SessionRow;
  timezoneMode: SiteTimezoneMode;
  onSetup: () => void;
}) {
  const chips: { icon: typeof faCrown; label: string; name: string }[] = [];
  const host = findPrimaryStaff(s.staffRows, 'HOST');
  if (host) chips.push({ icon: faCrown, label: 'Host', name: host });
  for (const roleBase of ['CH_1', 'CH_2', 'CH_3', 'CH_4'] as const) {
    const match = findPrimaryStaff(s.staffRows, roleBase);
    if (match) chips.push({ icon: roleBase === 'CH_4' ? faUserGear : faUserTie, label: roleBase === 'CH_4' ? 'Supervisor' : 'Co-Host', name: match });
  }
  for (const roleBase of ['AST_1', 'AST_2', 'AST_3', 'AST_4'] as const) {
    const match = findPrimaryStaff(s.staffRows, roleBase);
    if (match) chips.push({ icon: faUser, label: 'Asst', name: match });
  }
  for (const extra of additionalStaffFrom(s.staffRows)) {
    chips.push({ icon: faUser, label: extra.roleName, name: extra.name });
  }

  const assignedTrainees = s.traineeRows.filter((t) => t.trainee_discord || t.trainee_roblox_username);
  const trainees = assignedTrainees.filter((t) => !t.is_standby);
  const reservedTrainees = assignedTrainees.filter((t) => t.is_standby);
  const filled = trainees.length;

  return (
    <>
      <div className="detail-header">
        <div className={`detail-status ${statusClass(s.session_status)}`}>{s.session_status}</div>
        <h2 className="detail-name">{s.session_name || 'Unnamed Session'}</h2>
        <div className="detail-time-row">
          <span><FontAwesomeIcon icon={faClock} /> {s.session_time.slice(0, 5)} {timezoneMode}</span>
          <span><FontAwesomeIcon icon={faHourglassHalf} /> {s.session_duration} min</span>
          <span><FontAwesomeIcon icon={faIdBadge} /> #{s.session_id}</span>
        </div>
      </div>

      <div className="detail-stats">
        <div className="dstat">
          <div className="dstat-val">{filled}/{s.num_slots}</div>
          <div className="dstat-label">Trainees</div>
        </div>
        <div className="dstat">
          <div className="dstat-val">{s.session_duration}m</div>
          <div className="dstat-label">Duration</div>
        </div>
        <div className="dstat">
          <div className="dstat-val">{s.session_time.slice(0, 5)}</div>
          <div className="dstat-label">Start ({timezoneMode})</div>
        </div>
      </div>

      {s.session_desc && <div className="detail-desc">{s.session_desc}</div>}

      <div className="detail-section">
        <div className="detail-section-label">Host &amp; Staff</div>
        <div className="detail-staff-chips">
          {chips.length === 0 ? (
            <span className="no-staff-msg">No staff assigned yet</span>
          ) : (
            chips.map((c, i) => (
              <span className="staff-chip" key={i}>
                <FontAwesomeIcon icon={c.icon} /> {c.name}
                <span className="staff-chip-role">{c.label}</span>
              </span>
            ))
          )}
        </div>
      </div>

      {trainees.length > 0 && (
        <div className="detail-section">
          <div className="detail-section-label">Trainees ({trainees.length})</div>
          <div className="trainee-chips">
            {trainees.map((t) => (
              <div className="trainee-chip" key={t.slot_number}>
                <div className="trainee-chip-avatar"><FontAwesomeIcon icon={faGraduationCap} /></div>
                <div className="trainee-chip-info">
                  <div className="trainee-chip-name">{t.trainee_roblox_username || t.trainee_discord}</div>
                  {t.zone != null && <div className="trainee-chip-zone">Zone {t.zone}</div>}
                </div>
                {t.note && (
                  <div className="trainee-chip-note" title={t.note}>
                    <FontAwesomeIcon icon={faNoteSticky} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {reservedTrainees.length > 0 && (
        <div className="detail-section">
          <div className="detail-section-label">Standby / Reserved ({reservedTrainees.length})</div>
          <div className="trainee-chips">
            {reservedTrainees.map((t) => (
              <div className="trainee-chip trainee-chip--reserved" key={t.slot_number}>
                <div className="trainee-chip-avatar"><FontAwesomeIcon icon={faHourglassHalf} /></div>
                <div className="trainee-chip-info">
                  <div className="trainee-chip-name">{t.trainee_roblox_username || t.trainee_discord}</div>
                  {t.zone != null && <div className="trainee-chip-zone">Zone {t.zone}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="detail-actions">
        <button type="button" className="btn-setup" onClick={onSetup}>
          <FontAwesomeIcon icon={faPlay} /> Setup Session
        </button>
      </div>
    </>
  );
}

// ── Setup modal ──────────────────────────────────────────────────────────
function SetupModal({
  session, staff, timezoneMode, onClose,
}: {
  session: SessionRow;
  staff: StaffOption[];
  timezoneMode: SiteTimezoneMode;
  onClose: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [duplicateFields, setDuplicateFields] = useState<Set<string>>(() => new Set());
  const updateDuplicateWarnings = useCallback(() => {
    if (formRef.current) setDuplicateFields(findDuplicateAssignments(new FormData(formRef.current)));
  }, []);
  const [trainerMode, setTrainerMode] = useState<'auto' | 'manual'>('auto');
  const [reservedSlots, setReservedSlots] = useState(
    () => session.traineeRows.filter((row) => row.is_standby).length
  );
  const [additionalRows, setAdditionalRows] = useState(() =>
    additionalStaffFrom(session.staffRows).map((r, i) => ({ key: i, ...r }))
  );
  useEffect(() => {
    const frame = requestAnimationFrame(updateDuplicateWarnings);
    return () => cancelAnimationFrame(frame);
  }, [updateDuplicateWarnings, reservedSlots, additionalRows]);
  const nextRowKey = useRef(additionalRows.length);

  // live host/co-host values feed the auto-distribution preview — read
  // straight off the DOM via refs rather than fully controlling every select,
  // to avoid re-plumbing StaffSelect as a controlled component.
  const hostRef = useRef<HTMLSelectElement>(null);
  const ch1Ref = useRef<HTMLSelectElement>(null);
  const ch2Ref = useRef<HTMLSelectElement>(null);
  const ch3Ref = useRef<HTMLSelectElement>(null);
  const [autoPreview, setAutoPreview] = useState<string[]>([]);

  function recomputeAutoPreview() {
    const pool = [hostRef.current?.value, ch1Ref.current?.value, ch2Ref.current?.value, ch3Ref.current?.value].filter(
      (v): v is string => !!v
    );
    setAutoPreview(computeAutoDistribution(session.num_slots + reservedSlots, pool));
  }

  function changeReservedSlots(delta: number) {
    const nextCount = Math.max(0, Math.min(10, reservedSlots + delta));
    setReservedSlots(nextCount);
    const pool = [hostRef.current?.value, ch1Ref.current?.value, ch2Ref.current?.value, ch3Ref.current?.value].filter(
      (value): value is string => !!value
    );
    setAutoPreview(computeAutoDistribution(session.num_slots + nextCount, pool));
  }

  function addAdditionalRow() {
    setAdditionalRows((rows) => [...rows, { key: nextRowKey.current++, name: '', roleName: '' }]);
  }
  function removeAdditionalRow(key: number) {
    setAdditionalRows((rows) => rows.filter((r) => r.key !== key));
  }

  const hostMatch = findPrimaryStaff(session.staffRows, 'HOST');
  const ch1Match = findPrimaryStaff(session.staffRows, 'CH_1');
  const ch2Match = findPrimaryStaff(session.staffRows, 'CH_2');
  const ch3Match = findPrimaryStaff(session.staffRows, 'CH_3');
  const ch4Match = findPrimaryStaff(session.staffRows, 'CH_4');
  const ast = (['AST_1', 'AST_2', 'AST_3', 'AST_4'] as const).map((r) => findPrimaryStaff(session.staffRows, r));

  const standbyRows = session.traineeRows
    .filter((row) => row.is_standby)
    .sort((a, b) => a.slot_number - b.slot_number);
  const traineeFieldRows = [
    ...Array.from({ length: session.num_slots }, (_, i) => ({
      fieldIndex: i + 1,
      label: `Trainee ${i + 1}`,
      isReserved: false,
      defaultRow: session.traineeRows.find((row) => !row.is_standby && row.slot_number === i + 1),
    })),
    ...Array.from({ length: reservedSlots }, (_, i) => ({
      fieldIndex: session.num_slots + i + 1,
      label: `Standby / Reserved ${i + 1}`,
      isReserved: true,
      defaultRow: standbyRows[i],
    })),
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-eyebrow">#{session.session_id} · {session.session_time.slice(0, 5)} {timezoneMode}</div>
            <div className="modal-title">{session.session_name || 'Setup Session'}</div>
          </div>
          <button type="button" className="modal-close" onClick={onClose}><FontAwesomeIcon icon={faXmark} /></button>
        </div>

        <div className="modal-body">
          <div className="modal-info-banner">
            <span className="mib-icon"><FontAwesomeIcon icon={faIdBadge} /></span>
            <span>Confirm staff and trainees below, then start the session — it&apos;ll move to the live Active Session view.</span>
          </div>

          <form
            ref={formRef}
            action={confirmAndStartSession}
            onChange={updateDuplicateWarnings}
            onSubmit={(event) => {
              const duplicates = findDuplicateAssignments(new FormData(event.currentTarget));
              if (duplicates.size === 0) return;
              event.preventDefault();
              setDuplicateFields(duplicates);
            }}
            className="modal-form-setup"
          >
            <input type="hidden" name="session_id" value={session.session_id} />
            <input type="hidden" name="num_slots" value={session.num_slots} />
            <input type="hidden" name="reserved_slots" value={reservedSlots} />
            <input type="hidden" name="trainer_assignment_mode" value={trainerMode} />

            <div className="modal-section-label">Staff Assignment</div>
            {duplicateFields.size > 0 && <div className="setup-duplicate-alert" role="alert">Remove duplicate staff or trainee identities before starting.</div>}
            <div className="staff-grid">
              <div className={`staff-field${duplicateFields.has('host') ? ' setup-duplicate' : ''}`}>
                <label className="staff-label"><FontAwesomeIcon icon={faCrown} className="staff-icon" /> Host* <DuplicateWarning visible={duplicateFields.has('host')} /></label>
                <StaffSelect
                  name="host"
                  staff={staff}
                  authKey="host_auth"
                  defaultValue={hostMatch}
                  onChange={recomputeAutoPreview}
                  selectRef={hostRef}
                />
              </div>
              <div className={`staff-field${duplicateFields.has('co_host1') ? ' setup-duplicate' : ''}`}>
                <label className="staff-label">Co-Host 1 <DuplicateWarning visible={duplicateFields.has('co_host1')} /></label>
                <StaffSelect name="co_host1" staff={staff} authKey="cohost_auth" defaultValue={ch1Match} onChange={recomputeAutoPreview} selectRef={ch1Ref} />
              </div>
              <div className={`staff-field${duplicateFields.has('co_host2') ? ' setup-duplicate' : ''}`}>
                <label className="staff-label">Co-Host 2 <DuplicateWarning visible={duplicateFields.has('co_host2')} /></label>
                <StaffSelect name="co_host2" staff={staff} authKey="cohost_auth" defaultValue={ch2Match} onChange={recomputeAutoPreview} selectRef={ch2Ref} />
              </div>
              <div className={`staff-field${duplicateFields.has('co_host3') ? ' setup-duplicate' : ''}`}>
                <label className="staff-label">Co-Host 3 <DuplicateWarning visible={duplicateFields.has('co_host3')} /></label>
                <StaffSelect name="co_host3" staff={staff} authKey="cohost_auth" defaultValue={ch3Match} onChange={recomputeAutoPreview} selectRef={ch3Ref} />
                <label className="ih-check">
                  <input type="checkbox" name="co_host3_ih" defaultChecked={hasIH(session.staffRows, 'CH_3')} /> Internal Helper
                </label>
              </div>
              <div className={`staff-field${duplicateFields.has('co_host4_supervisor') ? ' setup-duplicate' : ''}`}>
                <label className="staff-label">Co-Host 4 / SV <DuplicateWarning visible={duplicateFields.has('co_host4_supervisor')} /></label>
                <StaffSelect name="co_host4_supervisor" staff={staff} authKey="cohost_auth" defaultValue={ch4Match} />
                <label className="ih-check">
                  <input type="checkbox" name="co_host4_ih" defaultChecked={hasIH(session.staffRows, 'CH_4')} /> Internal Helper
                </label>
              </div>
              {ast.map((match, i) => (
                <div className={`staff-field${duplicateFields.has(`assistant_${i + 1}`) ? ' setup-duplicate' : ''}`} key={i}>
                  <label className="staff-label">Assistant {i + 1} <DuplicateWarning visible={duplicateFields.has(`assistant_${i + 1}`)} /></label>
                  <StaffSelect name={`assistant_${i + 1}`} staff={staff} authKey="asst_auth" defaultValue={match} />
                </div>
              ))}
            </div>

            <div className="staff-field" style={{ marginTop: 10 }}>
              <label className="staff-label">Additional Staff (first standalone IH fills Co-Host 4 / SV) <DuplicateWarning visible={duplicateFields.has('additional_staff_name')} /></label>
              {additionalRows.map((row) => (
                <div className={`additional-staff-row${duplicateFields.has('additional_staff_name') ? ' setup-duplicate' : ''}`} key={row.key}>
                  <input type="text" name="additional_staff_name" defaultValue={row.name} placeholder="Staff name" list="setup-staff-names" />
                  <input type="text" name="additional_staff_role" defaultValue={row.roleName} placeholder="Role — e.g. Internal Helper" />
                  <button type="button" className="row-remove-btn" onClick={() => removeAdditionalRow(row.key)}>
                    <FontAwesomeIcon icon={faXmark} />
                  </button>
                </div>
              ))}
              <button type="button" className="btn-add-row" onClick={addAdditionalRow}>+ Add Staff</button>
              <datalist id="setup-staff-names">
                {staff.map((s) => <option key={s.name} value={s.name} />)}
              </datalist>
            </div>

            <div className="modal-section-label" style={{ marginTop: 18 }}>
              Trainee Assignment
              <div className="trainer-mode-toggle">
                <button type="button" className={trainerMode === 'auto' ? 'active' : ''} onClick={() => { setTrainerMode('auto'); recomputeAutoPreview(); }}>Auto</button>
                <button type="button" className={trainerMode === 'manual' ? 'active' : ''} onClick={() => setTrainerMode('manual')}>Manual</button>
              </div>
            </div>

            {traineeFieldRows.map(({ fieldIndex: n, label, isReserved, defaultRow: t }) => {
              return (
                <TraineeRow
                  key={n}
                  n={n}
                  label={label}
                  isReserved={isReserved}
                  defaultRow={t}
                  trainerMode={trainerMode}
                  autoTrainer={autoPreview[n - 1] ?? ''}
                  sessionDateISO={session.session_date}
                  sessionHost={findPrimaryStaff(session.staffRows, 'HOST')}
                  duplicateFields={duplicateFields}
                  onIdentityChange={updateDuplicateWarnings}
                />
              );
            })}

            <div className="reserved-slot-actions">
              <button
                type="button"
                className="btn-add-row"
                disabled={reservedSlots >= 10}
                onClick={() => changeReservedSlots(1)}
              >
                + Add standby/reserved slot
              </button>
              {reservedSlots > 0 && (
                <button
                  type="button"
                  className="btn-add-row"
                  onClick={() => changeReservedSlots(-1)}
                >
                  Remove last reserved slot
                </button>
              )}
            </div>

            <div className="modal-footer">
              <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn-primary">
                <FontAwesomeIcon icon={faPlay} /> Start Session
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── One trainee row, with quick-fill (search known trainees, or paste) ──
function TraineeRow({
  n, label, isReserved, defaultRow, trainerMode, autoTrainer, sessionDateISO, sessionHost, duplicateFields, onIdentityChange,
}: {
  n: number;
  label: string;
  isReserved: boolean;
  defaultRow?: SessionRow['traineeRows'][number];
  trainerMode: 'auto' | 'manual';
  autoTrainer: string;
  sessionDateISO: string;
  sessionHost: string;
  duplicateFields: Set<string>;
  onIdentityChange: () => void;
}) {
  const robloxRef = useRef<HTMLInputElement>(null);
  const discordRef = useRef<HTMLInputElement>(null);
  const discordIdRef = useRef<HTMLInputElement>(null);
  const zoneRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLInputElement>(null);
  const trainerRef = useRef<HTMLInputElement>(null);

  const [quickFillOpen, setQuickFillOpen] = useState(false);
  const [quickFillTab, setQuickFillTab] = useState<'search' | 'paste'>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TraineeSuggestion[]>([]);
  const [pasteText, setPasteText] = useState('');
  const [pasteWarning, setPasteWarning] = useState<string | null>(null);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [pasteLoading, setPasteLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleSearchChange(v: string) {
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (v.trim().length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setResults(await searchTraineeCandidates(v));
    }, 250);
  }

  function applyMatch(m: TraineeSuggestion) {
    if (discordRef.current) discordRef.current.value = m.discordUsername;
    if (discordIdRef.current && m.discordId) discordIdRef.current.value = m.discordId;
    if (robloxRef.current && m.robloxUsername) robloxRef.current.value = m.robloxUsername;
    onIdentityChange();
    setQuickFillOpen(false);
    setResults([]);
    setQuery('');
  }

  async function applyPaste() {
    setPasteError(null);
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
    setPasteLoading(false);

    if (discordIdRef.current) discordIdRef.current.value = parsed.discordId;
    if (discordRef.current) discordRef.current.value = parsed.discordUsername;
    if (robloxRef.current) robloxRef.current.value = parsed.robloxUsername;
    if (zoneRef.current) zoneRef.current.value = parsed.zone;
    if (noteRef.current) noteRef.current.value = parsed.notes;
    onIdentityChange();

    const warnings: string[] = [];
    if (!looksLikeSameDate(parsed.dateTime, sessionDateISO)) {
      warnings.push("This paste's date doesn't look like it matches this session — double check before starting.");
    }
    if (sessionHost && resolvedHost.toLowerCase() !== sessionHost.toLowerCase()) {
      warnings.push(`Pasted host "${resolvedHost}" doesn't match this session's host "${sessionHost}".`);
    }
    setPasteWarning(warnings.length ? warnings.join(' ') : null);

    setQuickFillOpen(false);
    setPasteText('');
  }

  async function handleDiscordBlur() {
    if (!discordRef.current?.value) return;
    const match = await lookupKnownTrainee(discordIdRef.current?.value ?? '', discordRef.current.value);
    if (match && robloxRef.current && !robloxRef.current.value) {
      robloxRef.current.value = match.robloxUsername ?? '';
      onIdentityChange();
    }
  }

  return (
    <div className="trainee-slot">
      {isReserved && <input type="hidden" name={`trainee_${n}_standby`} value="on" />}
      <div className="trainee-slot-header">
        <span className="trainee-slot-label">{label} <DuplicateWarning visible={['roblox', 'discord', 'discord_id'].some((field) => duplicateFields.has(`trainee_${n}_${field}`))} /></span>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button type="button" className="btn-paste" onClick={() => setQuickFillOpen((o) => !o)}>
            <FontAwesomeIcon icon={faMagnifyingGlass} /> Quick-fill
          </button>
        </div>
      </div>

      {quickFillOpen && (
        <div className="quick-fill-panel">
          <div className="quick-fill-tabs">
            <button type="button" className={quickFillTab === 'search' ? 'active' : ''} onClick={() => setQuickFillTab('search')}>
              <FontAwesomeIcon icon={faMagnifyingGlass} /> Search
            </button>
            <button type="button" className={quickFillTab === 'paste' ? 'active' : ''} onClick={() => setQuickFillTab('paste')}>
              <FontAwesomeIcon icon={faPaste} /> Paste
            </button>
          </div>
          {quickFillTab === 'search' ? (
            <>
              <input
                type="text"
                className="trainee-input"
                placeholder="Search known trainees…"
                value={query}
                onChange={(e) => handleSearchChange(e.target.value)}
                autoFocus
              />
              {results.length > 0 && (
                <div className="search-suggestions">
                  {results.map((m, i) => (
                    <button type="button" key={i} className="search-suggestion-item" onClick={() => applyMatch(m)}>
                      <span className="suggestion-name">{m.discordUsername}</span>
                      <span className="suggestion-meta">
                        {m.robloxUsername ?? 'no Roblox linked'} · {m.source === 'profile' ? 'has account' : 'from a past session'}
                      </span>
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
                placeholder={'[Discord ID]\n[Discord username]\n[Roblox username]\n`Host:` ...\n`Date/Time:` ...\n`Position:` ...\n`Zone:` ...\n`Trainee Notes:` ...'}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
              />
              {pasteError && <div className="alert alert-error">{pasteError}</div>}
              <button type="button" className="btn-paste" disabled={pasteLoading} onClick={applyPaste}>
                {pasteLoading ? 'Checking…' : 'Apply'}
              </button>
            </>
          )}
        </div>
      )}

      {pasteWarning && <div className="paste-warning" style={{ padding: '8px 10px', borderRadius: 8, fontSize: '.75rem', marginTop: 6 }}>{pasteWarning}</div>}

      <div className="trainee-row-input-grid">
        <span className="trainee-row-num">{n}</span>
        <input ref={robloxRef} className={`trainee-input${duplicateFields.has(`trainee_${n}_roblox`) ? ' setup-duplicate' : ''}`} aria-invalid={duplicateFields.has(`trainee_${n}_roblox`)} type="text" name={`trainee_${n}_roblox`} defaultValue={defaultRow?.trainee_roblox_username ?? ''} placeholder="Roblox username" />
        <input ref={discordRef} className={`trainee-input${duplicateFields.has(`trainee_${n}_discord`) ? ' setup-duplicate' : ''}`} aria-invalid={duplicateFields.has(`trainee_${n}_discord`)} type="text" name={`trainee_${n}_discord`} defaultValue={defaultRow?.trainee_discord ?? ''} placeholder="Discord username" onBlur={handleDiscordBlur} />
        <input ref={discordIdRef} className={`trainee-input${duplicateFields.has(`trainee_${n}_discord_id`) ? ' setup-duplicate' : ''}`} aria-invalid={duplicateFields.has(`trainee_${n}_discord_id`)} type="text" name={`trainee_${n}_discord_id`} defaultValue={defaultRow?.trainee_discord_id ?? ''} placeholder="Discord ID" />
        <input ref={zoneRef} className="trainee-zone-field" type="number" name={`trainee_${n}_zone`} defaultValue={defaultRow?.zone ?? ''} placeholder="Zone" />
      </div>
      <div className="trainee-row-input-grid" style={{ marginTop: 6 }}>
        <span className="trainee-row-num" />
        {trainerMode === 'auto' ? (
          <input className="trainee-input" type="text" name={`trainee_${n}_trainer`} value={autoTrainer} readOnly placeholder="Trainer (auto)" />
        ) : (
          <input ref={trainerRef} className="trainee-input" type="text" name={`trainee_${n}_trainer`} defaultValue={defaultRow?.trainer_name ?? ''} placeholder="Trainer" list="setup-staff-names" />
        )}
        <input ref={noteRef} className="trainee-input" type="text" name={`trainee_${n}_note`} defaultValue={defaultRow?.note ?? ''} placeholder="Note" style={{ gridColumn: 'span 2' }} />
      </div>
    </div>
  );
}
