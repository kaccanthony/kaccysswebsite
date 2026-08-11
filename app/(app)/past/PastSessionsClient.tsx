'use client';
// FILE: app/(app)/past/PastSessionsClient.tsx

import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faHashtag,
  faUserTie,
  faUserGroup,
  faUserShield,
  faPeopleGroup,
  faGraduationCap,
  faFlag,
  faThLarge,
  faBullseye,
  faBars,
  faIdCard,
  faBoxArchive,
  faHandPointer,
} from '@fortawesome/free-solid-svg-icons';
import type { PastSession } from '@/lib/pastSessions';
import { formatSessionDate, statusPillClass } from '@/lib/formatPastDate';
import './past.css';

type ViewMode = 'grid' | 'focus' | 'list' | 'card';

// ── Shared bits used by every view ──────────────────────────────────────
function PillRow({ s }: { s: PastSession }) {
  return (
    <>
      <span className="sesh-pill pill-id">
        <FontAwesomeIcon icon={faHashtag} /> Session {s.session_id}
      </span>
      <span className="sesh-pill pill-host">
        <FontAwesomeIcon icon={faUserTie} /> Host: {s.host || '—'}
      </span>
      <span className={`sesh-pill ${s.cohost_filled >= s.cohost_total ? 'pill-fraction-full' : ''}`}>
        <FontAwesomeIcon icon={faUserGroup} /> Co-Hosts {s.cohost_filled}/{s.cohost_total}
      </span>
      {s.supervisor_name && (
        <span className="sesh-pill pill-supervisor">
          <FontAwesomeIcon icon={faUserShield} /> Supervisor: {s.supervisor_name}
        </span>
      )}
      <span className={`sesh-pill ${s.assistant_filled >= s.assistant_total ? 'pill-fraction-full' : ''}`}>
        <FontAwesomeIcon icon={faPeopleGroup} /> Assistants {s.assistant_filled}/{s.assistant_total}
      </span>
      <span className="sesh-pill">
        <FontAwesomeIcon icon={faGraduationCap} /> {s.trainees_trained.length} trainee
        {s.trainees_trained.length === 1 ? '' : 's'} trained
      </span>
    </>
  );
}

function StatusBadge({ s }: { s: PastSession }) {
  return (
    <span className={`status-badge-pill ${statusPillClass(s.session_status)}`}>
      <FontAwesomeIcon icon={faFlag} /> {s.session_status || 'Unknown'}
    </span>
  );
}

function TraineeListBlock({ s }: { s: PastSession }) {
  if (s.trainees_trained.length === 0) {
    return (
      <div className="trainee-list-block">
        <div className="trainee-list-label">Trainees Trained</div>
        <div className="no-trainees-msg">No trainees were marked as attended for this session.</div>
      </div>
    );
  }
  return (
    <div className="trainee-list-block">
      <div className="trainee-list-label">Trainees Trained ({s.trainees_trained.length})</div>
      <div className="trainee-chip-row">
        {s.trainees_trained.map((t, i) => (
          <span className="trainee-chip-sm" key={i}>
            {t.name || 'Unnamed'}
            {t.zone && <span className="zone-tag"> · Zone {t.zone}</span>}
            <span className="trainer-tag"> · trained by {t.trainer || '—'}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <FontAwesomeIcon icon={faBoxArchive} />
      <div className="empty-title">No past sessions yet</div>
      <p>Concluded and cancelled sessions will show up here once they're archived.</p>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────
export default function PastSessionsClient({ sessions }: { sessions: PastSession[] }) {
  const [view, setView] = useState<ViewMode>('grid');
  const [focusId, setFocusId] = useState<number | null>(sessions[0]?.session_id ?? null);

  return (
    <div className="past-page">
      <div className="page-header">
        <div>
          <div className="section-eyebrow">Session Management</div>
          <h1 className="section-title">Past Sessions</h1>
          <p className="page-sub">Every concluded or cancelled session on record</p>
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

      {sessions.length === 0 ? (
        <EmptyState />
      ) : view === 'grid' ? (
        <div className="grid-view">
          {sessions.map((s) => {
            const d = formatSessionDate(s.session_date);
            return (
              <div className="sesh-tile" key={s.session_id}>
                <div className="sesh-tile-top">
                  <StatusBadge s={s} />
                  <span className="relative-badge">{d.relative}</span>
                </div>
                <div className="sesh-title">{s.session_name || 'Unnamed Session'}</div>
                {s.session_desc && <div className="sesh-desc">{s.session_desc}</div>}
                <div className="sesh-time-line">
                  <span className="bst-time">{d.display}</span>
                </div>
                <div className="pill-row">
                  <PillRow s={s} />
                </div>
                <TraineeListBlock s={s} />
              </div>
            );
          })}
        </div>
      ) : view === 'card' ? (
        <div className="card-view">
          {sessions.map((s) => {
            const d = formatSessionDate(s.session_date);
            return (
              <div className="sesh-fullcard" key={s.session_id}>
                <div className="sesh-tile-top">
                  <StatusBadge s={s} />
                  <span className="relative-badge">{d.relative}</span>
                </div>
                <div className="sesh-title">{s.session_name || 'Unnamed Session'}</div>
                {s.session_desc && <div className="sesh-desc">{s.session_desc}</div>}
                <div className="sesh-time-line">
                  <span className="bst-time">{d.display}</span>
                </div>
                <div className="pill-row">
                  <PillRow s={s} />
                </div>
                <TraineeListBlock s={s} />
              </div>
            );
          })}
        </div>
      ) : view === 'list' ? (
        <div className="list-view">
          {sessions.map((s) => {
            const d = formatSessionDate(s.session_date);
            return (
              <div className="sesh-row" key={s.session_id}>
                <div className="sesh-row-time">
                  <span className="bst-time">{d.display}</span>
                  {d.relative}
                </div>
                <div className="sesh-row-title">
                  <div className="sesh-title">{s.session_name || 'Unnamed Session'}</div>
                  {s.session_desc && <div className="sesh-desc">{s.session_desc}</div>}
                  <TraineeListBlock s={s} />
                </div>
                <div className="sesh-row-pills">
                  <PillRow s={s} />
                </div>
                <div className="sesh-row-relative">
                  <StatusBadge s={s} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // focus view
        (() => {
          const focusSession = sessions.find((s) => s.session_id === focusId) ?? sessions[0];
          const fd = formatSessionDate(focusSession?.session_date ?? null);
          return (
            <div className="focus-layout">
              <div className="focus-list">
                {sessions.map((s) => {
                  const d = formatSessionDate(s.session_date);
                  const active = s.session_id === (focusId ?? sessions[0]?.session_id);
                  return (
                    <div
                      className={`focus-card ${active ? 'active' : ''}`}
                      key={s.session_id}
                      onClick={() => setFocusId(s.session_id)}
                    >
                      <div className="sesh-time-line">
                        <span className="bst-time">{d.display}</span>
                      </div>
                      <div className="sesh-title">{s.session_name || 'Unnamed Session'}</div>
                      <StatusBadge s={s} />
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
                    <div className="sesh-tile-top">
                      <StatusBadge s={focusSession} />
                      <span className="relative-badge">{fd.relative}</span>
                    </div>
                    <div className="sesh-title">{focusSession.session_name || 'Unnamed Session'}</div>
                    {focusSession.session_desc && <div className="sesh-desc">{focusSession.session_desc}</div>}
                    <div className="sesh-time-line">
                      <span className="bst-time">{fd.display}</span>
                    </div>
                    <div className="pill-row">
                      <PillRow s={focusSession} />
                    </div>
                    <TraineeListBlock s={focusSession} />
                  </>
                )}
              </div>
            </div>
          );
        })()
      )}
    </div>
  );
}