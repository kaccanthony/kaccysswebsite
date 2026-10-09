'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useModalVisibility } from '@/lib/useModalVisibility';
import { deleteEvent, saveEvent } from './actions';
import EventAttendeeQuickFill from './EventAttendeeQuickFill';
import { EVENT_TYPES, eventLayoutHint, isEventType, suggestedEventType, type EventType } from '@/lib/events/types';
import { eventError } from '@/lib/events/errors';
import ToastStack, { type ToastEntry, type ToastKind } from '@/components/ToastStack';
import styles from './manageevents.module.css';

export type Attendee = { discord_id: string; discord_username: string; roblox_username: string };
type AdditionalStaff = { name: string; role: string };
export type EventRow = {
  event_id: number; event_status: string; event_type: string | null; host: string; co_hosts: string | null;
  event_name: string; event_date: string; event_time: string; game_or_location: string;
  event_details: string; event_additional_notes: string | null;
  event_attendees: string | null; event_attendees_data: Attendee[] | null;
  event_additional_staff: AdditionalStaff[] | null;
};
export type StaffOption = { name: string; host: boolean; cohost: boolean };
const STATUSES = ['Requested', 'Scheduled', 'Published', 'Cancelled', 'Postponed'];
const blank = (): Attendee => ({ discord_id: '', discord_username: '', roblox_username: '' });

function initialAttendees(event: EventRow | null): Attendee[] {
  if (!event) return Array.from({ length: 4 }, blank);
  if (Array.isArray(event.event_attendees_data) && event.event_attendees_data.length)
    return padAttendees(event.event_attendees_data.map(row => ({ ...blank(), ...row })));
  // Older rows used a freeform text list. Keep the names visible for editing.
  const names = (event.event_attendees ?? '').split(/[\n,;]+/).map(name => name.trim()).filter(Boolean);
  return padAttendees(names.map(discord_username => ({ ...blank(), discord_username })));
}
function padAttendees(rows: Attendee[]) { return [...rows, ...Array.from({ length: Math.max(0, 4 - rows.length) }, blank)]; }
function initialCoHosts(event: EventRow | null) { return (event?.co_hosts ?? '').split(/[,;\n]/).map(value => value.trim()).filter(Boolean); }

export default function ManageEventsClient({ events, staff, gameSuggestions, timezoneMode, loadError }: {
  events: EventRow[]; staff: StaffOption[]; gameSuggestions: string[]; timezoneMode: string; loadError: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [hostFilter, setHostFilter] = useState('');
  const [editing, setEditing] = useState<EventRow | null>(null);
  const [selectedType, setSelectedType] = useState<EventType>(EVENT_TYPES[0]);
  const [open, setOpen] = useState(false);
  const { shouldRender, visible } = useModalVisibility(open);
  const [attendees, setAttendees] = useState<Attendee[]>(() => Array.from({ length: 4 }, blank));
  const [coHosts, setCoHosts] = useState<string[]>([]);
  const [additionalStaff, setAdditionalStaff] = useState<AdditionalStaff[]>([]);
  const [toasts, setToasts] = useState<ToastEntry[]>(() => loadError ? [{ id: 0, message: eventError('ERR_001', `Could not load events. Apply database/manage_events.sql if the new columns are missing. ${loadError}`), kind: 'error', actorName: 'Manage Events' }] : []);
  const dismissToast = useCallback((id: number) => setToasts(current => current.filter(toast => toast.id !== id)), []);
  const showToast = useCallback((message: string, kind: ToastKind) => {
    setToasts(current => [...current, { id: Date.now() + Math.random(), message, kind, actorName: 'Manage Events' }]);
  }, []);
  const [deleting, setDeleting] = useState<EventRow | null>(null);

  const filtered = useMemo(() => events.filter(event => {
    const q = search.trim().toLowerCase();
    if (statusFilter && event.event_status !== statusFilter) return false;
    if (hostFilter && !event.host.toLowerCase().includes(hostFilter.toLowerCase())) return false;
    return !q || [String(event.event_id), event.event_name, event.event_type ?? '', event.host, event.co_hosts ?? '',
      event.event_date, event.event_time, event.game_or_location, event.event_attendees ?? '']
      .some(value => value.toLowerCase().includes(q));
  }), [events, search, statusFilter, hostFilter]);

  function show(event: EventRow | null) {
    setEditing(event);
    setSelectedType(event?.event_type && isEventType(event.event_type) ? event.event_type : suggestedEventType(event?.event_name ?? ''));
    setAttendees(initialAttendees(event));
    setCoHosts(initialCoHosts(event));
    setAdditionalStaff(Array.isArray(event?.event_additional_staff) ? event.event_additional_staff.map(row => ({ ...row })) : []);
    setOpen(true);
  }
  function changeAttendee(index: number, field: keyof Attendee, value: string) {
    setAttendees(rows => rows.map((row, i) => i === index ? { ...row, [field]: value } : row));
  }
  function submit(formData: FormData) {
    formData.set('action', editing ? 'edit' : 'add');
    if (editing) formData.set('event_id', String(editing.event_id));
    formData.set('attendees_json', JSON.stringify(attendees));
    formData.set('co_hosts', coHosts.filter(Boolean).join(', '));
    formData.set('additional_staff_json', JSON.stringify(additionalStaff));
    startTransition(async () => {
      try {
        const result = await saveEvent(formData);
        if (result.success) { setOpen(false); router.refresh(); }
        showToast(result.message, result.success ? 'success' : 'error');
      } catch { showToast('Could not save event. Please try again.', 'error'); }
    });
  }
  function confirmDelete() {
    if (!deleting) return;
    const id = deleting.event_id;
    startTransition(async () => {
      try {
        const result = await deleteEvent(id);
        if (result.success) { setDeleting(null); router.refresh(); }
        showToast(result.message, result.success ? 'success' : 'error');
      } catch { showToast('Could not delete event. Please try again.', 'error'); }
    });
  }

  return <div className={styles.page}>
    <header className={styles.pageHeader}>
      <div><h1 className="section-label">Manage Events</h1><p className="section-sub">Schedule and update community events.</p></div>
      <button type="button" className={styles.primary} onClick={() => show(null)}>+ Add Event</button>
    </header>
    <div className={styles.filters}>
      <input aria-label="Search events" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search ID, event, host, date, game, or attendee…" />
      <select aria-label="Filter by status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="">All statuses</option>{STATUSES.map(status => <option key={status}>{status}</option>)}</select>
      <input aria-label="Filter by host" value={hostFilter} onChange={e => setHostFilter(e.target.value)} placeholder="Filter by host…" />
      {(search || statusFilter || hostFilter) && <button type="button" className={styles.ghost} onClick={() => { setSearch(''); setStatusFilter(''); setHostFilter(''); }}>Clear</button>}
    </div>
    <div className={styles.tableWrap}><table className={styles.table}>
      <thead><tr><th>ID</th><th>Event</th><th>Type</th><th>Host</th><th>Date & time</th><th>Game / location</th><th>Attendees</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>{filtered.length ? filtered.map(event => <tr key={event.event_id}>
        <td className={styles.muted}>#{event.event_id}</td>
        <td><strong>{event.event_name}</strong><small>{event.event_details}</small></td>
        <td>{event.event_type ?? 'Not set'}</td>
        <td>{event.host}</td>
        <td>{event.event_date.split('-').reverse().join('/')}<small>{event.event_time.slice(0, 5)} {timezoneMode}</small></td>
        <td>{event.game_or_location}</td>
        <td>{Array.isArray(event.event_attendees_data) && event.event_attendees_data.length ? event.event_attendees_data.length : (event.event_attendees ?? '').split(/[\n,;]+/).filter(Boolean).length}</td>
        <td><span className={`${styles.badge} ${styles[event.event_status.toLowerCase()] ?? ''}`}>{event.event_status}</span></td>
        <td><div className={styles.actions}><button type="button" className={styles.edit} onClick={() => show(event)}>Edit</button><button type="button" className={styles.delete} onClick={() => setDeleting(event)}>Delete</button></div></td>
      </tr>) : <tr><td colSpan={9} className={styles.empty}>{loadError ? 'Events could not be loaded.' : 'No matching events.'}</td></tr>}</tbody>
    </table></div>

    {shouldRender && <div className={styles.backdrop} onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className={`${styles.modal} gb-popup-scale${visible ? ' visible-lightbox' : ''}`} role="dialog" aria-modal="true" aria-labelledby="event-modal-title">
        <div className={styles.modalHeader}><div><span>Community department</span><h2 id="event-modal-title">{editing ? `Edit Event #${editing.event_id}` : 'Add Event'}</h2></div><button type="button" aria-label="Close editor" className={styles.close} onClick={() => setOpen(false)}>×</button></div>
        <form action={submit} className={styles.form} key={editing?.event_id ?? 'new'}>
          <div className={styles.row}><label className={styles.grow}>Event Name*<input name="event_name" required defaultValue={editing?.event_name ?? ''} placeholder="Event name" /></label><label>Status*<select name="event_status" defaultValue={editing?.event_status ?? 'Requested'}>{STATUSES.map(status => <option key={status}>{status}</option>)}</select></label></div>
          <label>Event type*<select name="event_type" required value={selectedType} onChange={e => setSelectedType(e.target.value as EventType)}>{EVENT_TYPES.map(type => <option key={type} value={type}>{type}</option>)}</select></label>
          <p className={styles.typeHint}>{eventLayoutHint(selectedType)}</p>
          <div className={styles.row}><label>Date*<input type="date" name="event_date" required defaultValue={editing?.event_date ?? ''} /></label><label>Time* ({timezoneMode})<input type="time" name="event_time" required defaultValue={editing?.event_time.slice(0, 5) ?? ''} /></label><label className={styles.grow}>Game / Location*<input name="game_or_location" list="known-event-games" required defaultValue={editing?.game_or_location ?? ''} placeholder="Choose a previous game or type a new one" autoComplete="off" /><datalist id="known-event-games">{gameSuggestions.map(game => <option key={game} value={game} />)}</datalist></label></div>
          <label>Event Description*<textarea name="event_details" rows={3} required defaultValue={editing?.event_details ?? ''} /></label>
          <div className={styles.divider}>Event staff</div>
          <label>Host*<select name="host" required defaultValue={editing?.host ?? ''}><option value="">Select event host</option>{editing?.host && !staff.some(person => person.host && person.name === editing.host) && <option value={editing.host}>{editing.host} (current)</option>}{staff.filter(person => person.host).map(person => <option key={person.name} value={person.name}>{person.name}</option>)}</select></label>
          {coHosts.map((name, index) => <div className={styles.row} key={index}><label className={styles.grow}>Co-host {index + 1}<select value={name} onChange={e => setCoHosts(rows => rows.map((row, i) => i === index ? e.target.value : row))}><option value="">Select co-host</option>{name && !staff.some(person => person.cohost && person.name === name) && <option value={name}>{name} (current)</option>}{staff.filter(person => person.cohost).map(person => <option key={person.name} value={person.name}>{person.name}</option>)}</select></label><button type="button" className={styles.remove} aria-label={`Remove co-host ${index + 1}`} onClick={() => setCoHosts(rows => rows.filter((_, i) => i !== index))}>×</button></div>)}
          {coHosts.length < 3 && <button type="button" className={styles.ghost} onClick={() => setCoHosts(rows => [...rows, ''])}>+ Add co-host</button>}
          <div className={styles.staffSubhead}>Additional staff</div>
          {additionalStaff.map((row, index) => <div className={styles.row} key={index}><label className={styles.grow}>Staff name<select value={row.name} required onChange={e => setAdditionalStaff(rows => rows.map((item, i) => i === index ? { ...item, name: e.target.value } : item))}><option value="">Select staff</option>{row.name && !staff.some(person => person.name === row.name) && <option value={row.name}>{row.name} (current)</option>}{staff.map(person => <option key={person.name} value={person.name}>{person.name}</option>)}</select></label><label className={styles.grow}>Role<input value={row.role} required onChange={e => setAdditionalStaff(rows => rows.map((item, i) => i === index ? { ...item, role: e.target.value } : item))} placeholder="e.g. Observer" /></label><button type="button" className={styles.remove} aria-label={`Remove additional staff ${index + 1}`} onClick={() => setAdditionalStaff(rows => rows.filter((_, i) => i !== index))}>×</button></div>)}
          <button type="button" className={styles.ghost} onClick={() => setAdditionalStaff(rows => [...rows, { name: '', role: '' }])}>+ Add staff</button>
          <div className={styles.divider}>Attendees</div>
          <p className={styles.hint}>At least four attendees. Discord ID, Discord username, and Roblox username are required for each.</p>
          <div className={styles.attendeeGrid}>{attendees.map((row, index) => <div className={styles.attendee} key={index}>
            <EventAttendeeQuickFill label={`Attendee ${index + 1}`} onFill={value => setAttendees(rows => rows.map((item, i) => i === index ? value : item))} onError={message => showToast(message, 'error')} />
            <div className={styles.row}><label>Discord ID*<input inputMode="numeric" required value={row.discord_id} onChange={e => changeAttendee(index, 'discord_id', e.target.value)} placeholder="Discord ID" /></label><label className={styles.grow}>Discord username*<input required value={row.discord_username} onChange={e => changeAttendee(index, 'discord_username', e.target.value)} placeholder="Username" /></label><label className={styles.grow}>Roblox username*<input required value={row.roblox_username} onChange={e => changeAttendee(index, 'roblox_username', e.target.value)} placeholder="Roblox username" /></label>{attendees.length > 4 && <button type="button" aria-label={`Remove attendee ${index + 1}`} className={styles.remove} onClick={() => setAttendees(rows => rows.filter((_, i) => i !== index))}>×</button>}</div>
          </div>)}</div>
          <button type="button" className={styles.ghost} onClick={() => setAttendees(rows => [...rows, blank()])}>+ Add attendee</button>
          <div className={styles.footer}><button type="button" className={styles.ghost} onClick={() => setOpen(false)}>Cancel</button><button type="submit" disabled={pending} className={styles.primary}>{pending ? 'Saving…' : editing ? 'Save Changes' : 'Add Event'}</button></div>
        </form>
      </div>
    </div>}
    {deleting && <div className={styles.backdrop} onMouseDown={e => { if (e.target === e.currentTarget) setDeleting(null); }}>
      <div className={`${styles.modal} ${styles.smallModal}`} role="alertdialog" aria-modal="true" aria-labelledby="delete-event-title">
        <div className={styles.modalHeader}><h2 id="delete-event-title">Delete Event?</h2><button type="button" aria-label="Close confirmation" className={styles.close} onClick={() => setDeleting(null)}>×</button></div>
        <p>Delete <strong>{deleting.event_name}</strong> (#{deleting.event_id})? This removes its upcoming schedule entry.</p>
        <div className={styles.footer}><button type="button" className={styles.ghost} onClick={() => setDeleting(null)}>Cancel</button><button type="button" disabled={pending} className={styles.danger} onClick={confirmDelete}>{pending ? 'Deleting…' : 'Delete Event'}</button></div>
      </div>
    </div>}
    <ToastStack toasts={toasts} onDismiss={dismissToast} />
  </div>;
}
