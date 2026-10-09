'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { setupEvent } from './actions';
import type { SiteTimezoneMode } from '@/lib/siteTimezone';
import styles from './eventsetup.module.css';
import { EVENT_TYPES, eventLayoutHint, isEventType, suggestedEventType } from '@/lib/events/types';
import ToastStack, { type ToastEntry } from '@/components/ToastStack';

export type ScheduledEvent = {
  event_id: number; event_type: string | null; event_status: string; host: string; co_hosts: string | null; event_name: string;
  event_date: string; event_time: string; game_or_location: string;
  event_details: string; event_additional_notes: string | null; event_attendees: string | null;
};
type Run = { event_run_id: number; source_event_id: number; event_type: string; status: string };

export default function EventSetupClient({ events, runs, timezoneMode, canHost, initialSelectedId, error, databaseReady }: {
  events: ScheduledEvent[]; runs: Run[]; timezoneMode: SiteTimezoneMode; canHost: boolean;
  initialSelectedId?: number; error?: string; databaseReady: boolean;
}) {
  const [selectedId, setSelectedId] = useState(initialSelectedId ?? events[0]?.event_id ?? null);
  const [modalOpen, setModalOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastEntry[]>(() => error ? [{ id: 0, message: error, kind: 'error', actorName: 'Setup Event' }] : []);
  const dismissToast = useCallback((id: number) => setToasts(current => current.filter(toast => toast.id !== id)), []);
  const previousError = useRef(error);
  useEffect(() => {
    if (error && error !== previousError.current) {
      setToasts(current => [...current, { id: Date.now() + Math.random(), message: error, kind: 'error', actorName: 'Setup Event' }]);
    }
    previousError.current = error;
  }, [error]);
  const selected = events.find(event => event.event_id === selectedId);
  const selectedRun = runs.find(run => run.source_event_id === selectedId);

  return <div className={styles.page}>
    <div className={styles.heading}><p className={styles.eyebrow}>Community department</p><h1>Setup Event</h1><p>Select an assigned event, review its details, then open the event panel.</p></div>
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.panelHead}><span>Your events today</span><span className={styles.count}>{events.length}</span></div>
        <div className={styles.list}>{events.length ? events.map(event => {
          const run = runs.find(item => item.source_event_id === event.event_id);
          return <button type="button" key={event.event_id} className={`${styles.card} ${selectedId === event.event_id ? styles.active : ''}`} onClick={() => setSelectedId(event.event_id)}>
            <span className={styles.cardTop}><strong>{event.event_name}</strong><small>{run?.status ?? event.event_status}</small></span>
            <span className={styles.cardMeta}>{event.event_time.slice(0, 5)} {timezoneMode} · {event.game_or_location}</span>
            <span className={styles.cardMeta}>Host: {event.host}</span>
          </button>;
        }) : <div className={styles.empty}>No events assigned to you today.</div>}</div>
      </aside>

      <section className={styles.details}>
        {!selected ? <div className={styles.empty}>Select an event on the left to review it.</div> : <>
          <div className={styles.badge}>{selectedRun?.status ?? selected.event_status}</div>
          <h2>{selected.event_name}</h2>
          <div className={styles.summary}><span>{selected.event_date.split('-').reverse().join('/')} · {selected.event_time.slice(0, 5)} {timezoneMode}</span><span>Event #{selected.event_id}</span></div>
          <div className={styles.metrics}><div><strong>{selected.game_or_location}</strong><span>Game / location</span></div><div><strong>{selected.host}</strong><span>Event host</span></div><div><strong>{selected.event_type || suggestedEventType(selected.event_name)}</strong><span>Event type</span></div></div>
          <div className={styles.section}><h3>Event description</h3><p>{selected.event_details}</p></div>
          {selected.event_additional_notes && <div className={styles.section}><h3>Additional notes</h3><p>{selected.event_additional_notes}</p></div>}
          {selected.event_attendees && <div className={styles.section}><h3>Planned attendees</h3><p>{selected.event_attendees}</p></div>}
          {selectedRun ? <Link className={styles.startButton} href={`/eventpanel?event_id=${selectedRun.event_run_id}`}>Open event panel →</Link>
            : <button type="button" className={styles.startButton} disabled={!databaseReady || !canHost} onClick={() => setModalOpen(true)}>Setup event →</button>}
          {!canHost && <p className={styles.hint}>Event Host authorization is required to set up an event.</p>}
        </>}
      </section>
    </div>

    {modalOpen && selected && <div className={styles.backdrop} onClick={() => setModalOpen(false)}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="event-setup-title" onClick={event => event.stopPropagation()}>
        <div className={styles.modalHead}><div><span>Event #{selected.event_id}</span><h2 id="event-setup-title">Set up {selected.event_name}</h2></div><button type="button" onClick={() => setModalOpen(false)} aria-label="Close setup">×</button></div>
        <form action={setupEvent} className={styles.modalBody} key={selected.event_id}>
          <input type="hidden" name="event_id" value={selected.event_id} />
          <div className={styles.info}>Confirm the event type. The panel uses the site’s {timezoneMode} setting and the sheet’s rules, with a 0.35 multiplier base rate.</div>
          <label>Event type<select name="event_type" defaultValue={selected.event_type && isEventType(selected.event_type) ? selected.event_type : suggestedEventType(selected.event_name)} disabled={Boolean(selected.event_type && isEventType(selected.event_type))}>{EVENT_TYPES.map(type => <option key={type} value={type}>{type}</option>)}</select></label>
          <p className={styles.info}>{eventLayoutHint(selected.event_type && isEventType(selected.event_type) ? selected.event_type : suggestedEventType(selected.event_name))}</p>
          <p className={styles.info}>Site time zone: <strong>{timezoneMode}</strong></p>
          <div className={styles.ruleBox}><strong>Scoring at a glance</strong><p>Competitive, Speedrun, and Dynamic: round positions, ranks, and duration boost. Static: entered leaderboard ranks. Chill: attendance and a time bonus. Timed events need 45–180 minutes and at least three participants to be considered.</p></div>
          <button type="submit" className={styles.startButton}>Open event panel →</button>
        </form>
      </div>
    </div>}
    <ToastStack toasts={toasts} onDismiss={dismissToast} />
  </div>;
}
