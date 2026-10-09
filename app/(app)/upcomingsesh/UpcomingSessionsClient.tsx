'use client';
// FILE: app/(app)/upcoming/UpcomingSessionsClient.tsx

import { useEffect, useMemo, useState } from 'react';
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
  faMagnifyingGlass,
  faCalendarDays,
  faGamepad,
} from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import type { UpcomingSession } from '@/lib/upcomingSessions';
import type { UpcomingEvent } from '@/lib/upcomingEvents';
import { formatSessionTimes, type RelativeTime } from '@/lib/formatSessionTimes';
import { formatInstantInSiteTimezone } from '@/lib/siteTimezone';
import './upcoming.css';

type ViewMode = 'grid' | 'focus' | 'list' | 'card';
type UpcomingItem =
  | { kind: 'session'; key: string; id: number; title: string; datetimeIso: string | null; timezoneMode: UpcomingSession['timezone_mode']; session: UpcomingSession }
  | { kind: 'event'; key: string; id: number; title: string; datetimeIso: string | null; timezoneMode: UpcomingEvent['timezone_mode']; event: UpcomingEvent };

function itemSummary(item: UpcomingItem) {
  return item.kind === 'session' ? `${item.session.session_duration ?? '—'} min` : item.event.game_or_location;
}

function eventAttendeeRows(event: UpcomingEvent) {
  const rows = event.event_attendees_data.map((person) => ({ name: person.discord_username || person.discord_id,
    sub: [person.roblox_username && `Roblox: ${person.roblox_username}`, person.discord_id && `Discord ID: ${person.discord_id}`].filter(Boolean).join(' · ') }));
  const known = new Set(rows.map((person) => person.name.toLowerCase()));
  for (const name of event.event_attendees) {
    if (!known.has(name.toLowerCase())) rows.push({ name, sub: '' });
  }
  return rows;
}

function itemSearchText(item: UpcomingItem) {
  if (item.kind === 'session') {
    const s = item.session;
    return [item.title, item.datetimeIso, s.session_desc, s.session_status, s.session_duration, s.host, s.cohost1, s.cohost2, s.cohost3, s.supervisor,
      s.assistant1, s.assistant2, s.assistant3, s.assistant4, ...s.additionalStaff,
      ...s.trainees.map((trainee) => `${trainee.discord} ${trainee.zone} ${trainee.trainer}`),
      ...s.reserved_trainees.map((trainee) => `${trainee.discord} ${trainee.zone} ${trainee.trainer}`)].join(' ').toLowerCase();
  }
  const e = item.event;
  return [item.title, item.datetimeIso, e.event_status, e.event_type, e.host, ...e.co_hosts, e.game_or_location, e.event_details,
    e.event_additional_notes, ...e.event_attendees, ...e.event_attendees_data.map((person) => `${person.discord_id} ${person.discord_username} ${person.roblox_username}`),
    ...e.event_additional_staff.map((staff) => `${staff.name} ${staff.role}`)].join(' ').toLowerCase();
}

// ── Shared bits used by every view ──────────────────────────────────────
function PillRow({ item }: { item: UpcomingItem }) {
  if (item.kind === 'event') {
    const event = item.event;
    const attendees = eventAttendeeRows(event).length;
    return <>
      <span className="sesh-pill pill-event"><FontAwesomeIcon icon={faCalendarDays} /> Event · {event.event_type || 'Event'}</span>
      <span className="sesh-pill">{event.event_status}</span>
      <span className="sesh-pill pill-host"><FontAwesomeIcon icon={faUserTie} /> Host: {event.host}</span>
      <span className="sesh-pill"><FontAwesomeIcon icon={faUserGroup} /> Co-Hosts {event.co_hosts.length}</span>
      <span className="sesh-pill"><FontAwesomeIcon icon={faUsers} /> Attendees {attendees}</span>
    </>;
  }
  const s = item.session;
  return (
    <>
      <span className="sesh-pill pill-session"><FontAwesomeIcon icon={faGraduationCap} /> Session</span>
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

function EmptyState({ searching }: { searching: boolean }) {
  return (
    <div className="empty-state">
      <FontAwesomeIcon icon={faCalendarXmark} />
      <div className="empty-title">{searching ? 'No matching results' : 'No upcoming sessions or events'}</div>
      <p>{searching ? 'Try another search term.' : 'Everything scheduled from now onward will show up here.'}</p>
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

  const t = formatSessionTimes(session.session_datetime_iso, session.timezone_mode);
  const startOnly = session.session_datetime_iso
    ? formatInstantInSiteTimezone(new Date(session.session_datetime_iso), session.timezone_mode, {
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
              <div className="dstat-label">Start ({session.timezone_mode})</div>
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

          {session.reserved_trainees.length > 0 && (
            <div className="detail-section">
              <div className="detail-section-label">
                Standby / Reserved ({session.reserved_trainees.length})
              </div>
              <div className="chips">
                {session.reserved_trainees.map((tr, i) => (
                  <div className="trainee-chip trainee-chip--reserved" key={`${tr.discord}-${i}`}>
                    <div className="trainee-chip-avatar">
                      <FontAwesomeIcon icon={faHourglassHalf} />
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

function EventDetailModal({ event, phase, onClose }: { event: UpcomingEvent; phase: 'open' | 'closing'; onClose: () => void }) {
  useEffect(() => {
    const onKey = (key: KeyboardEvent) => { if (key.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const time = formatSessionTimes(event.event_datetime_iso, event.timezone_mode);
  const attendees = eventAttendeeRows(event);
  return (
    <div className={`modal-backdrop ${phase === 'open' ? 'active' : 'closing'}`} style={{ display: 'flex' }} onClick={(click) => { if (click.target === click.currentTarget) onClose(); }}>
      <div className="modal detail-modal" role="dialog" aria-modal="true" aria-label={`${event.event_name} details`}>
        <div className="modal-header">
          <span>Event Details</span>
          <button type="button" className="detail-modal-close" aria-label="Close" onClick={onClose}><FontAwesomeIcon icon={faXmark} /></button>
        </div>
        <div className="detail-modal-body">
          <div className="detail-header">
            <div className="detail-status detail-status--event">{event.event_status}</div>
            <h2 className="detail-name">{event.event_name}</h2>
            <div className="detail-time-row">
              <span><FontAwesomeIcon icon={faClock} /> {time.bst}</span>
              <span>{time.local} your time</span>
              <span><FontAwesomeIcon icon={faCalendarDays} /> {event.event_type || 'Event'}</span>
              <span><FontAwesomeIcon icon={faIdBadge} /> #{event.event_id}</span>
            </div>
          </div>
          <div className="detail-stats event-detail-stats">
            <div className="dstat"><div className="dstat-val">{event.game_or_location || '—'}</div><div className="dstat-label">Game / Location</div></div>
            <div className="dstat"><div className="dstat-val">{attendees.length}</div><div className="dstat-label">Attendees</div></div>
          </div>
          <div className="detail-section"><div className="detail-section-label">Event Description</div><div className="detail-desc">{event.event_details || 'No description provided.'}</div></div>
          {event.event_additional_notes && <div className="detail-section"><div className="detail-section-label">Additional Notes</div><div className="detail-desc">{event.event_additional_notes}</div></div>}
          <div className="detail-section">
            <div className="detail-section-label">Host & Staff</div>
            <div className="detail-staff-chips">
              <span className="staff-chip"><FontAwesomeIcon icon={faCrown} /> {event.host}<span className="staff-chip-role">Host</span></span>
              {event.co_hosts.map((name, index) => <span className="staff-chip" key={`cohost-${index}`}><FontAwesomeIcon icon={faUserTie} /> {name}<span className="staff-chip-role">Co-Host</span></span>)}
              {event.event_additional_staff.map((person, index) => <span className="staff-chip" key={`staff-${index}`}><FontAwesomeIcon icon={faUser} /> {person.name}<span className="staff-chip-role">{person.role || 'Staff'}</span></span>)}
            </div>
          </div>
          <div className="detail-section">
            <div className="detail-section-label">Attendees ({attendees.length})</div>
            {attendees.length ? <div className="chips">{attendees.map((person, index) => <div className="trainee-chip" key={`${person.name}-${index}`}>
              <div className="trainee-chip-avatar"><FontAwesomeIcon icon={faUsers} /></div>
              <div className="trainee-chip-info"><div className="trainee-chip-name">{person.name}</div>{person.sub && <div className="trainee-chip-zone">{person.sub}</div>}</div>
            </div>)}</div> : <span className="no-staff-msg">No attendees listed yet</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────
export default function UpcomingSessionsClient({ sessions, events }: { sessions: UpcomingSession[]; events: UpcomingEvent[] }) {
  const [view, setView] = useState<ViewMode>('grid');
  const [search, setSearch] = useState('');
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [modalPhase, setModalPhase] = useState<'open' | 'closing' | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const items = useMemo<UpcomingItem[]>(() => [
    ...sessions.map((session) => ({ kind: 'session' as const, key: `session-${session.session_id}`, id: session.session_id,
      title: session.session_name || 'Unnamed Session', datetimeIso: session.session_datetime_iso, timezoneMode: session.timezone_mode, session })),
    ...events.map((event) => ({ kind: 'event' as const, key: `event-${event.event_id}`, id: event.event_id,
      title: event.event_name || 'Unnamed Event', datetimeIso: event.event_datetime_iso, timezoneMode: event.timezone_mode, event })),
  ].sort((a, b) => (a.datetimeIso ? Date.parse(a.datetimeIso) : Infinity) -
    (b.datetimeIso ? Date.parse(b.datetimeIso) : Infinity)), [sessions, events]);
  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? items.filter((item) => itemSearchText(item).includes(term)) : items;
  }, [items, search]);

  // relative-time text drifts as real time passes ("in 45 minutes" → "in 44 minutes"),
  // so re-render periodically without touching scroll/selection.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  function openDetail(key: string) {
    setDetailKey(key);
    setModalPhase('open');
  }
  function closeDetail() {
    setModalPhase('closing');
    setTimeout(() => setModalPhase(null), 250);
  }

  const detailItem = items.find((item) => item.key === detailKey) ?? null;

  return (
    <div className="upcoming-page">
      <div className="page-header">
        <div>
          <div className="section-eyebrow">Community Calendar</div>
          <h1 className="section-title">Upcoming</h1>
          <p className="page-sub">
            Sessions and events from right now onward <span className="bst-badge">{items[0]?.timezoneMode ?? 'BST'}</span>
          </p>
        </div>
        <div className="upcoming-controls">
          <label className="upcoming-search">
            <FontAwesomeIcon icon={faMagnifyingGlass} />
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search sessions and events..." aria-label="Search sessions and events" />
          </label>
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
      </div>

      <div>
        {filteredItems.length === 0 ? (
          <EmptyState searching={Boolean(search.trim())} />
        ) : view === 'grid' ? (
          <div className="grid-view">
            {filteredItems.map((item) => {
              const t = formatSessionTimes(item.datetimeIso, item.timezoneMode);
              return (
                <div className={`sesh-tile ${item.kind === 'event' ? 'sesh-tile--event' : ''}`} key={item.key}>
                  <div className="sesh-tile-top">
                    <RelativeBadge relative={t.relative} />
                    <DetailButton onClick={() => openDetail(item.key)} />
                  </div>
                  <div className="sesh-title">{item.title}</div>
                  <div className="sesh-time-line">
                    <span className="bst-time">{t.bst}</span>
                    <span>·</span>
                    <span>{t.local} your time</span>
                    <span>·</span>
                    <span>{item.kind === 'event' && <FontAwesomeIcon icon={faGamepad} />} {itemSummary(item)}</span>
                  </div>
                  <div className="pill-row">
                    <PillRow item={item} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : view === 'card' ? (
          <div className="card-view">
            {filteredItems.map((item) => {
              const t = formatSessionTimes(item.datetimeIso, item.timezoneMode);
              return (
                <div className={`sesh-fullcard ${item.kind === 'event' ? 'sesh-tile--event' : ''}`} key={item.key}>
                  <div className="sesh-tile-top">
                    <RelativeBadge relative={t.relative} />
                    <DetailButton onClick={() => openDetail(item.key)} />
                  </div>
                  <div className="sesh-title">{item.title}</div>
                  <div className="sesh-time-line">
                    <span className="bst-time">{t.bst}</span>
                    <span>·</span>
                    <span>{t.local} your time</span>
                    <span>·</span>
                    <span>{itemSummary(item)}</span>
                  </div>
                  <div className="pill-row">
                    <PillRow item={item} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : view === 'list' ? (
          <div className="list-view">
            {filteredItems.map((item) => {
              const t = formatSessionTimes(item.datetimeIso, item.timezoneMode);
              return (
                <div className="sesh-row" key={item.key}>
                  <div className="sesh-row-time">
                    <span className="bst-time">{t.bst}</span>
                    {t.local} your time
                  </div>
                  <div className="sesh-row-title">
                    <div className="sesh-title">{item.title}</div>
                  </div>
                  <div className="sesh-row-pills">
                    <PillRow item={item} />
                  </div>
                  <div className="sesh-row-relative">
                    <RelativeBadge relative={t.relative} />
                    <DetailButton onClick={() => openDetail(item.key)} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          // focus view
          (() => {
            const focusItem = filteredItems.find((item) => item.key === focusKey) ?? filteredItems[0];
            const ft = formatSessionTimes(focusItem?.datetimeIso ?? null, focusItem?.timezoneMode ?? 'BST');
            return (
              <div className="focus-layout">
                <div className="focus-list">
                  {filteredItems.map((item) => {
                    const t = formatSessionTimes(item.datetimeIso, item.timezoneMode);
                    const active = item.key === focusItem?.key;
                    return (
                      <div
                        className={`focus-card ${active ? 'active' : ''}`}
                        key={item.key}
                        onClick={() => setFocusKey(item.key)}
                      >
                        <div className="sesh-time-line">
                          <span className="bst-time">{t.bst}</span>
                        </div>
                        <div className="sesh-title">{item.title}</div>
                        <RelativeBadge relative={t.relative} />
                      </div>
                    );
                  })}
                </div>
                <div className="focus-detail-panel">
                  {!focusItem ? (
                    <div className="focus-detail-empty">
                      <FontAwesomeIcon icon={faHandPointer} />
                      <p>Select a session or event on the left to view its details.</p>
                    </div>
                  ) : (
                    <>
                      <div className="focus-detail-top">
                        <RelativeBadge relative={ft.relative} />
                        <DetailButton onClick={() => openDetail(focusItem.key)} />
                      </div>
                      <div className="sesh-title">{focusItem.title}</div>
                      <div className="sesh-time-line">
                        <span className="bst-time">{ft.bst}</span>
                        <span>·</span>
                        <span>{ft.local} your time</span>
                        <span>·</span>
                        <span>{itemSummary(focusItem)}</span>
                      </div>
                      <div className="pill-row">
                        <PillRow item={focusItem} />
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })()
        )}
      </div>

      {modalPhase && detailItem?.kind === 'session' && <DetailModal session={detailItem.session} phase={modalPhase} onClose={closeDetail} />}
      {modalPhase && detailItem?.kind === 'event' && <EventDetailModal event={detailItem.event} phase={modalPhase} onClose={closeDetail} />}
    </div>
  );
}
