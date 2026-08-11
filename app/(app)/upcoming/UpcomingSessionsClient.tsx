'use client';
// FILE: app/(app)/upcoming/UpcomingSessionsClient.tsx

import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faUserTie,
  faUserGroup,
  faUserShield,
  faUsers,
  faGraduationCap,
  faClock,
  faInfoCircle,
  faThLarge,
  faBullseye,
  faBars,
  faIdCard,
  faCalendarXmark,
  faHandPointer,
  faXmark,
  faHourglassHalf,
  faIdBadge,
  faCrown,
  faUserGear,
  faUser,
} from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import type { UpcomingSession } from '@/lib/upcomingSessions';
import { formatSessionTimes, type RelativeTime } from '@/lib/formatSessionTimes';
import './upcoming.css';

type ViewMode = 'grid' | 'focus' | 'list' | 'card';

// ── Shared bits used by every view ──────────────────────────────────────
function PillRow({ s }: { s: UpcomingSession }) {
  return (
    <>
      <span className="sesh-pill pill-host">
        <FontAwesomeIcon icon={faUserTie} /> Host: {s.host || '—'}
      </span>
      <span className={`sesh-pill ${s.cohost_filled >= s.cohost_total ? 'pill-fraction-full' : ''}`}>
        <FontAwesomeIcon icon={faUserGroup} /> Co-Hosts {s.cohost_filled}/{s.cohost_total}
      </span>
      {s.supervisor && (
        <span className="sesh-pill pill-supervisor">
          <FontAwesomeIcon icon={faUserShield} /> Supervisor: {s.supervisor}
        </span>
      )}
      <span className={`sesh-pill ${s.assistant_filled >= s.assistant_total ? 'pill-fraction-full' : ''}`}>
        <FontAwesomeIcon icon={faUsers} /> Assistants {s.assistant_filled}/{s.assistant_total}
      </span>
      <span
        className={`sesh-pill ${s.trainee_filled >= s.trainee_total && s.trainee_total > 0 ? 'pill-fraction-full' : ''}`}
      >
        <FontAwesomeIcon icon={faGraduationCap} /> Trainees {s.trainee_filled}/{s.trainee_total}
      </span>
    </>
  );
}

function RelativeBadge({ relative }: { relative: RelativeTime }) {
  return (
    <span className={`relative-badge ${relative.soon ? 'soon' : ''}`}>
      <FontAwesomeIcon icon={faClock} /> {relative.text}
    </span>
  );
}

function DetailButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="view-details-btn" onClick={onClick} title="View full details">
      <FontAwesomeIcon icon={faInfoCircle} /> Details
    </button>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <FontAwesomeIcon icon={faCalendarXmark} />
      <div className="empty-title">No upcoming sessions</div>
      <p>Everything scheduled from now onward will show up here.</p>
    </div>
  );
}

// ── Detail modal ─────────────────────────────────────────────────────────
interface StaffChip {
  key: string;
  icon: IconDefinition;
  label: string;
  name: string;
}

function getStaffChips(session: UpcomingSession): StaffChip[] {
  const chips: StaffChip[] = [];
  if (session.host) chips.push({ key: 'host', icon: faCrown, label: 'Host', name: session.host });
  if (session.cohost1) chips.push({ key: 'cohost1', icon: faUserTie, label: 'Co-Host', name: session.cohost1 });
  if (session.cohost2) chips.push({ key: 'cohost2', icon: faUserTie, label: 'Co-Host', name: session.cohost2 });
  if (session.cohost3) chips.push({ key: 'cohost3', icon: faUserTie, label: 'Co-Host', name: session.cohost3 });
  if (session.supervisor) chips.push({ key: 'supervisor', icon: faUserGear, label: 'Supervisor', name: session.supervisor });
  if (session.assistant1) chips.push({ key: 'assistant1', icon: faUser, label: 'Asst', name: session.assistant1 });
  if (session.assistant2) chips.push({ key: 'assistant2', icon: faUser, label: 'Asst', name: session.assistant2 });
  if (session.assistant3) chips.push({ key: 'assistant3', icon: faUser, label: 'Asst', name: session.assistant3 });
  if (session.assistant4) chips.push({ key: 'assistant4', icon: faUser, label: 'Asst', name: session.assistant4 });
  session.additionalStaff.forEach((name, i) => chips.push({ key: `additional-${i}`, icon: faUser, label: 'Additional', name }));
  return chips;
}

function DetailModal({
  session,
  phase,
  onClose,
}: {
  session: UpcomingSession | null;
  phase: 'open' | 'closing';
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!session) return null;

  const t = formatSessionTimes(session.session_datetime_iso);
  const startOnly = session.session_datetime_iso
    ? new Date(session.session_datetime_iso).toLocaleString('en-GB', {
        timeZone: 'Europe/London',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : '—';

  const staffChips = getStaffChips(session);

  return (
    <div
      className={`modal-backdrop ${phase === 'open' ? 'active' : 'closing'}`}
      style={{ display: 'flex' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal detail-modal">
        <div className="modal-header">
          <span>Session Details</span>
          <button type="button" className="detail-modal-close" aria-label="Close" onClick={onClose}>
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
        <div className="detail-modal-body">
          <div className="detail-header">
            <div className="detail-status detail-status--upcoming">{session.session_status || 'Upcoming'}</div>
            <h2 className="detail-name">{session.session_name || 'Unnamed Session'}</h2>
            <div className="detail-time-row">
              <span>
                <FontAwesomeIcon icon={faClock} /> {t.bst}
              </span>
              <span>
                <FontAwesomeIcon icon={faHourglassHalf} /> {session.session_duration} min
              </span>
              <span>
                <FontAwesomeIcon icon={faIdBadge} /> #{session.session_id}
              </span>
            </div>
          </div>

          <div className="detail-stats">
            <div className="dstat">
              <div className="dstat-val">
                {session.trainee_filled}/{session.trainee_total}
              </div>
              <div className="dstat-label">Trainees</div>
            </div>
            <div className="dstat">
              <div className="dstat-val">{session.session_duration}m</div>
              <div className="dstat-label">Duration</div>
            </div>
            <div className="dstat">
              <div className="dstat-val">{startOnly}</div>
              <div className="dstat-label">Start (BST)</div>
            </div>
          </div>

          {session.session_desc && (
            <div className="detail-desc">
              {session.session_desc.split('\n').map((line, i) => (
                <span key={i}>
                  {line}
                  <br />
                </span>
              ))}
            </div>
          )}

          <div className="detail-section">
            <div className="detail-section-label">Host & Staff</div>
            <div className="detail-staff-chips">
              {staffChips.length === 0 ? (
                <span className="no-staff-msg">No staff assigned yet</span>
              ) : (
                staffChips.map(({ key, icon, label, name }) => (
                  <span className="staff-chip" key={key}>
                    <FontAwesomeIcon icon={icon} /> {name}
                    <span className="staff-chip-role">{label}</span>
                  </span>
                ))
              )}
            </div>
          </div>

          {session.trainees.length > 0 && (
            <div className="detail-section">
              <div className="detail-section-label">Trainees ({session.trainees.length})</div>
              <div className="chips">
                {session.trainees.map((tr, i) => (
                  <div className="trainee-chip" key={i}>
                    <div className="trainee-chip-avatar">
                      <FontAwesomeIcon icon={faGraduationCap} />
                    </div>
                    <div className="trainee-chip-info">
                      <div className="trainee-chip-name">{tr.discord || '—'}</div>
                      {tr.zone && <div className="trainee-chip-zone">Zone {tr.zone}</div>}
                      {tr.trainer && <div className="trainee-chip-zone">Trainer: {tr.trainer}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────
export default function UpcomingSessionsClient({ sessions }: { sessions: UpcomingSession[] }) {
  const [view, setView] = useState<ViewMode>('grid');
  const [detailId, setDetailId] = useState<number | null>(null);
  const [modalPhase, setModalPhase] = useState<'open' | 'closing' | null>(null);
  const [focusId, setFocusId] = useState<number | null>(sessions[0]?.session_id ?? null);
  const [, setTick] = useState(0);

  // relative-time text drifts as real time passes ("in 45 minutes" → "in 44 minutes"),
  // so re-render periodically without touching scroll/selection.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  function openDetail(id: number) {
    setDetailId(id);
    setModalPhase('open');
  }
  function closeDetail() {
    setModalPhase('closing');
    setTimeout(() => setModalPhase(null), 250);
  }

  const detailSession = sessions.find((s) => s.session_id === detailId) ?? null;

  return (
    <div className="upcoming-page">
      <div className="page-header">
        <div>
          <div className="section-eyebrow">Session Management</div>
          <h1 className="section-title">Upcoming Sessions</h1>
          <p className="page-sub">
            Every scheduled session from right now onward <span className="bst-badge">BST</span>
          </p>
        </div>
        <div className="view-switcher">
          <button type="button" className={`view-btn ${view === 'grid' ? 'active' : ''}`} onClick={() => setView('grid')} title="Grid view">
            <FontAwesomeIcon icon={faThLarge} /> Grid
          </button>
          <button type="button" className={`view-btn ${view === 'focus' ? 'active' : ''}`} onClick={() => setView('focus')} title="Focus view">
            <FontAwesomeIcon icon={faBullseye} /> Focus
          </button>
          <button type="button" className={`view-btn ${view === 'list' ? 'active' : ''}`} onClick={() => setView('list')} title="List view">
            <FontAwesomeIcon icon={faBars} /> List
          </button>
          <button type="button" className={`view-btn ${view === 'card' ? 'active' : ''}`} onClick={() => setView('card')} title="Card view">
            <FontAwesomeIcon icon={faIdCard} /> Card
          </button>
        </div>
      </div>

      <div>
        {sessions.length === 0 ? (
          <EmptyState />
        ) : view === 'grid' ? (
          <div className="grid-view">
            {sessions.map((s) => {
              const t = formatSessionTimes(s.session_datetime_iso);
              return (
                <div className="sesh-tile" key={s.session_id}>
                  <div className="sesh-tile-top">
                    <RelativeBadge relative={t.relative} />
                    <DetailButton onClick={() => openDetail(s.session_id)} />
                  </div>
                  <div className="sesh-title">{s.session_name || 'Unnamed Session'}</div>
                  <div className="sesh-time-line">
                    <span className="bst-time">{t.bst}</span>
                    <span>·</span>
                    <span>{t.local} your time</span>
                    <span>·</span>
                    <span>{s.session_duration} min</span>
                  </div>
                  <div className="pill-row">
                    <PillRow s={s} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : view === 'card' ? (
          <div className="card-view">
            {sessions.map((s) => {
              const t = formatSessionTimes(s.session_datetime_iso);
              return (
                <div className="sesh-fullcard" key={s.session_id}>
                  <div className="sesh-tile-top">
                    <RelativeBadge relative={t.relative} />
                    <DetailButton onClick={() => openDetail(s.session_id)} />
                  </div>
                  <div className="sesh-title">{s.session_name || 'Unnamed Session'}</div>
                  <div className="sesh-time-line">
                    <span className="bst-time">{t.bst}</span>
                    <span>·</span>
                    <span>{t.local} your time</span>
                    <span>·</span>
                    <span>{s.session_duration} min duration</span>
                  </div>
                  <div className="pill-row">
                    <PillRow s={s} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : view === 'list' ? (
          <div className="list-view">
            {sessions.map((s) => {
              const t = formatSessionTimes(s.session_datetime_iso);
              return (
                <div className="sesh-row" key={s.session_id}>
                  <div className="sesh-row-time">
                    <span className="bst-time">{t.bst}</span>
                    {t.local} your time
                  </div>
                  <div className="sesh-row-title">
                    <div className="sesh-title">{s.session_name || 'Unnamed Session'}</div>
                  </div>
                  <div className="sesh-row-pills">
                    <PillRow s={s} />
                  </div>
                  <div className="sesh-row-relative">
                    <RelativeBadge relative={t.relative} />
                    <DetailButton onClick={() => openDetail(s.session_id)} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          // focus view
          (() => {
            const focusSession = sessions.find((s) => s.session_id === focusId) ?? sessions[0];
            const ft = formatSessionTimes(focusSession?.session_datetime_iso ?? null);
            return (
              <div className="focus-layout">
                <div className="focus-list">
                  {sessions.map((s) => {
                    const t = formatSessionTimes(s.session_datetime_iso);
                    const active = s.session_id === (focusId ?? sessions[0]?.session_id);
                    return (
                      <div
                        className={`focus-card ${active ? 'active' : ''}`}
                        key={s.session_id}
                        onClick={() => setFocusId(s.session_id)}
                      >
                        <div className="sesh-time-line">
                          <span className="bst-time">{t.bst}</span>
                        </div>
                        <div className="sesh-title">{s.session_name || 'Unnamed Session'}</div>
                        <RelativeBadge relative={t.relative} />
                      </div>
                    );
                  })}
                </div>
                <div className="focus-detail-panel">
                  {!focusSession ? (
                    <div className="focus-detail-empty">
                      <FontAwesomeIcon icon={faHandPointer} />
                      <p>Select a session on the left to view its details.</p>
                    </div>
                  ) : (
                    <>
                      <div className="focus-detail-top">
                        <RelativeBadge relative={ft.relative} />
                        <DetailButton onClick={() => openDetail(focusSession.session_id)} />
                      </div>
                      <div className="sesh-title">{focusSession.session_name || 'Unnamed Session'}</div>
                      <div className="sesh-time-line">
                        <span className="bst-time">{ft.bst}</span>
                        <span>·</span>
                        <span>{ft.local} your time</span>
                        <span>·</span>
                        <span>{focusSession.session_duration} min duration</span>
                      </div>
                      <div className="pill-row">
                        <PillRow s={focusSession} />
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })()
        )}
      </div>

      {modalPhase && <DetailModal session={detailSession} phase={modalPhase} onClose={closeDetail} />}
    </div>
  );
}