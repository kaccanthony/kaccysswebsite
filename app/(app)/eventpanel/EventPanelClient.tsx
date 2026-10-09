'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './eventpanel.module.css';
import { EVENT_TYPES, type EventType } from '@/lib/events/types';
import { EVENT_ERROR_CODES, eventError } from '@/lib/events/errors';
import ToastStack, { type ToastEntry, type ToastKind } from '@/components/ToastStack';
import { setEventRunTiming } from './actions';

type Participant = { id: string; name: string; rounds: string[]; rank: string; attended: boolean };
type Draft = {
  type: EventType; date: string; time: string; timezone: 'BST' | 'GMT'; game: string; description: string;
  host: string; additionalStaff: string; cohosts: string[]; start: string; end: string;
  roundCount: number; participants: Participant[]; concluded: boolean;
};
export type EventSeed = Partial<Draft>;

const TYPES: readonly EventType[] = EVENT_TYPES;
const STORAGE_KEY = 'yss-event-panel-draft-v1';
const BASE_RATE = 0.35;
const MINUTES_MIN = 45;
const MINUTES_MAX = 180;

function participant(id = crypto.randomUUID()): Participant {
  return { id, name: '', rounds: Array(10).fill(''), rank: '', attended: false };
}
function emptyDraft(): Draft {
  return { type: TYPES[0], date: '', time: '', timezone: 'BST', game: '', description: '', host: '', additionalStaff: '',
    cohosts: ['', '', ''], start: '', end: '', roundCount: 10, participants: [participant('initial-1'), participant('initial-2'), participant('initial-3')], concluded: false };
}
function clock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 3600)).padStart(2, '0')}:${String(Math.floor(total / 60) % 60).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
function dateTimeLabel(value: string, timezone: Draft['timezone']) {
  if (!value) return 'Not recorded';
  const d = new Date(new Date(value).getTime() + (timezone === 'BST' ? 3600000 : 0));
  return Number.isNaN(d.getTime()) ? 'Not recorded' : `${d.toISOString().slice(0, 16).replace('T', ' ')} ${timezone}`;
}
function dateTimeInput(value: string, timezone: Draft['timezone']) {
  if (!value) return '';
  return new Date(new Date(value).getTime() + (timezone === 'BST' ? 3600000 : 0)).toISOString().slice(0, 16);
}
function numeric(value: string) {
  if (value.trim() === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export default function EventPanelClient({ eventRunId, initialSeed }: { eventRunId?: number; initialSeed?: EventSeed }) {
  const router = useRouter();
  const storageKey = eventRunId ? `${STORAGE_KEY}-${eventRunId}` : STORAGE_KEY;
  const seededType = initialSeed?.type;
  const siteTimezone = initialSeed?.timezone;
  const [draft, setDraft] = useState<Draft>(() => ({ ...emptyDraft(), ...initialSeed }));
  const [hydrated, setHydrated] = useState(false);
  const [now, setNow] = useState(0);
  const [panelOpenedAt, setPanelOpenedAt] = useState(0);
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const dismissToast = useCallback((id: number) => setToasts(current => current.filter(toast => toast.id !== id)), []);
  const showToast = useCallback((message: string, kind: ToastKind) => {
    setToasts(current => [...current, { id: Date.now() + Math.random(), message, kind, actorName: 'Event Panel' }]);
  }, []);
  const previousTimezone = useRef(siteTimezone);
  useEffect(() => {
    if (siteTimezone && previousTimezone.current && siteTimezone !== previousTimezone.current) {
      showToast(`Site time zone changed to ${siteTimezone}. Timer times updated.`, 'info');
    }
    previousTimezone.current = siteTimezone;
  }, [siteTimezone, showToast]);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const parsed = JSON.parse(saved) as Draft;
          if (TYPES.includes(parsed.type) && Array.isArray(parsed.participants))
            setDraft({ ...parsed, type: seededType ?? parsed.type, timezone: siteTimezone ?? parsed.timezone });
        }
      } catch { /* An invalid local draft starts fresh. */ }
      setHydrated(true);
    });
  }, [storageKey, seededType, siteTimezone]);
  useEffect(() => {
    const refreshOnFocus = () => router.refresh();
    window.addEventListener('focus', refreshOnFocus);
    return () => window.removeEventListener('focus', refreshOnFocus);
  }, [router]);
  useEffect(() => { if (hydrated) localStorage.setItem(storageKey, JSON.stringify(draft)); }, [draft, hydrated, storageKey]);
  useEffect(() => {
    queueMicrotask(() => { const opened = Date.now(); setPanelOpenedAt(opened); setNow(opened); });
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const timed = draft.type !== 'Creative Collab Event - Static';
  const ranked = draft.type !== 'Chill Event';
  const roundsMode = ranked && draft.type !== 'Creative Collab Event - Static';
  const named = draft.participants.filter(p => p.name.trim());
  const durationMs = draft.start ? Math.max(0, (draft.end ? new Date(draft.end).getTime() : now || new Date(draft.start).getTime()) - new Date(draft.start).getTime()) : 0;
  const minutes = durationMs / 60000;
  const hours = durationMs / 3600000;
  const multiplier = hours <= 1 ? 1 : 1 + BASE_RATE * (Math.sqrt(hours) - 1);
  const considered = !!draft.start && !!draft.end && minutes >= MINUTES_MIN && minutes <= MINUTES_MAX && !!draft.host.trim() && named.length >= 3;
  const metadataComplete = !!draft.date && !!draft.time && !!draft.game.trim() && !!draft.host.trim();
  const canConclude = metadataComplete && (timed ? considered : named.length > 0);
  const missingStaticRanks = draft.type === 'Creative Collab Event - Static' && named.some(p => numeric(p.rank) === null);
  const completionIssue = !draft.date || !draft.time ? eventError('PERR-02', 'Set the event date and time.')
    : !draft.game.trim() || !draft.host.trim() ? eventError('ERR_002', 'Set the game and host.')
    : named.length === 0 ? eventError('PERR-04', 'Add participants before concluding.')
    : missingStaticRanks ? eventError('PERR-05', 'Each static leaderboard participant needs a valid rank and points.')
    : timed && !considered ? eventError('DAB-01', 'End the event after 45 minutes, within 3 hours, with at least three participants.')
    : '';

  const results = useMemo(() => {
    const count = named.length;
    const rows = named.map(p => {
      const entered = p.rounds.slice(0, draft.roundCount).map(numeric);
      const total = roundsMode ? entered.reduce<number>((sum, n) => sum + (n ?? count + 1), 0) : null;
      return { ...p, total, finalRank: 0, base: 0, points: 0 };
    });
    if (roundsMode) {
      for (const row of rows) row.finalRank = 1 + rows.filter(other => (other.total ?? Infinity) < (row.total ?? Infinity)).length;
    } else if (ranked) {
      for (const row of rows) row.finalRank = numeric(row.rank) ?? 0;
    }
    for (const row of rows) {
      if (ranked && row.finalRank > 0 && row.finalRank <= count) {
        row.base = 1 + Math.floor((count - row.finalRank) * 1.5);
        row.points = roundsMode ? Math.max(row.base, Math.round(row.base * multiplier)) : row.base;
      } else if (!ranked && row.attended) {
        row.base = 3;
        row.points = Math.round((3 + Math.max(0, hours - 1) * 1.5) * 10) / 10;
      }
    }
    return rows;
  }, [named, draft.roundCount, roundsMode, ranked, multiplier, hours]);

  const ordered = [...results].filter(p => !ranked || p.finalRank > 0).sort((a, b) => ranked ? a.finalRank - b.finalRank : Number(b.attended) - Number(a.attended));
  const titleDate = draft.date ? draft.date.split('-').reverse().join('/') : 'DD/MM/YYYY';
  const title = `${titleDate} | ${draft.time || 'HH:MM'} ${draft.timezone} | ${draft.host || 'HOST NAME'} | ${draft.game || 'GAME NAME'} | ${draft.type}`;
  const resultLines = ordered.length ? ordered.map(p => ranked
    ? `${p.finalRank === 1 ? '🥇' : p.finalRank === 2 ? '🥈' : p.finalRank === 3 ? '🥉' : `#${p.finalRank}`} ${p.name} — ${p.points} ${p.points === 1 ? 'point' : 'points'}`
    : `${p.attended ? '✓' : '○'} ${p.name} — ${p.points} ${p.points === 1 ? 'point' : 'points'}`).join('\n') : 'Add participants to see results.';
  const resultsText = `${draft.type === 'Chill Event' ? '🏆 CHILL EVENT PARTICIPATION RESULTS' : '🏆 EVENT RESULTS'}\n\n${resultLines}${roundsMode ? `\n\n🔥 Multiplier: x${multiplier.toFixed(2)}\n⏱ Runtime: ${hours.toFixed(2)} hours` : ''}`;
  const reportText = `==================== TO WHOM IT IS CONCERNED ====================\nHost: ${title}\nCo-Host: ${draft.cohosts.filter(Boolean).join(', ') || 'None'}\n\n${resultsText}\n================================================================`;

  function update<K extends keyof Draft>(key: K, value: Draft[K]) { setDraft(d => ({ ...d, [key]: value, concluded: false })); }
  function updateParticipant(id: string, patch: Partial<Participant>) {
    setDraft(d => ({ ...d, concluded: false, participants: d.participants.map(p => p.id === id ? { ...p, ...patch } : p) }));
  }
  async function saveTiming(start: string, end: string, concluded = false) {
    if (eventRunId) {
      const result = await setEventRunTiming(eventRunId, start, end, concluded);
      if (result.error) { showToast(result.error, 'error'); return false; }
      window.dispatchEvent(new Event('ongoing-activity-changed'));
    }
    return true;
  }
  async function recordTime(key: 'start' | 'end') {
    const value = new Date().toISOString();
    if (!await saveTiming(key === 'start' ? value : draft.start, key === 'end' ? value : '')) return;
    setDraft(d => ({ ...d, [key]: value, end: key === 'start' ? '' : value, concluded: false }));
  }
  async function manualTime(key: 'start' | 'end', value: string) {
    const timestamp = value ? new Date(`${value}:00Z`).getTime() - (draft.timezone === 'BST' ? 3600000 : 0) : 0;
    const next = value && Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
    if (!await saveTiming(key === 'start' ? next : draft.start, key === 'end' ? next : draft.end)) return;
    setDraft(d => ({ ...d, [key]: next, concluded: false }));
  }
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); showToast('Copied to clipboard.', 'success'); }
    catch { showToast('Clipboard unavailable. Select and copy the text below.', 'error'); }
  }
  async function conclude() {
    if (!canConclude || completionIssue) { showToast(completionIssue || eventError('DAB-01'), 'error'); return; }
    if (!await saveTiming(draft.start, draft.end, true)) return;
    setDraft(d => ({ ...d, concluded: true }));
    showToast(eventRunId ? 'Event concluded. Copy the report to share it.' : 'Concluded in this local draft. Copy the report to share it.', 'success');
  }

  return <div className={styles.page}>
    <div className={styles.heading}><div><p className={styles.eyebrow}>Community department / event workspace{eventRunId ? ` / Run #${eventRunId}` : ''}</p><h1>Event panel</h1><p className={styles.subtitle}>Plan, run, score, and prepare the event report.</p></div><div className={styles.headingRight}><span className={`${styles.status} ${draft.concluded || draft.end ? styles.done : draft.start ? styles.live : ''}`}>{draft.concluded ? 'Concluded locally' : draft.end ? 'Event ended' : draft.start ? 'Event running' : 'Draft'}</span><span className={styles.localNote}>Edits saved in this browser</span></div></div>
    <div className={styles.titleStrip}>{title}</div>

    <section className={styles.panel}><div className={styles.panelTitle}><span>Event details</span></div><div className={styles.detailsGrid}>
      <div className={styles.cell}><label className={styles.label}>Event type<select className={styles.input} value={draft.type} disabled={Boolean(eventRunId)} onChange={e => update('type', e.target.value as EventType)}>{TYPES.map(t => <option key={t}>{t}</option>)}</select></label><div className={styles.twoFields}><label className={styles.label}>Session date<input className={styles.input} type="date" value={draft.date} onChange={e => update('date', e.target.value)} /></label><label className={styles.label}>Session time<input className={styles.input} type="time" value={draft.time} onChange={e => update('time', e.target.value)} /></label></div><label className={styles.label}>Site time zone<input className={styles.input} value={draft.timezone} readOnly /></label></div>
      <div className={styles.cell}><label className={styles.label}>Game name<input className={styles.input} value={draft.game} placeholder="Enter game name" onChange={e => update('game', e.target.value)} /></label><p className={styles.help}>This appears in the event title and report.</p></div>
      <div className={styles.cell}><label className={styles.label}>Event description<textarea className={`${styles.input} ${styles.textarea}`} value={draft.description} placeholder="What will happen in this event?" onChange={e => update('description', e.target.value)} /></label></div>
    </div></section>

    <section className={styles.panel}><div className={styles.panelTitle}><span>Event staff panel</span></div><div className={styles.staffGrid}>
      <div className={styles.staffLeft}><div className={styles.twoFields}><label className={styles.label}>Event host<input className={styles.input} value={draft.host} placeholder="Host Discord name" onChange={e => update('host', e.target.value)} /></label><label className={styles.label}>Additional staff<input className={styles.input} value={draft.additionalStaff} placeholder="Discord name" onChange={e => update('additionalStaff', e.target.value)} /></label></div><div className={styles.cohostGrid}>{draft.cohosts.map((name, i) => <label className={styles.label} key={i}>Co-host {i + 1}<input className={styles.input} value={name} placeholder="Discord name" onChange={e => update('cohosts', draft.cohosts.map((n, j) => j === i ? e.target.value : n))} /></label>)}</div><div className={styles.requirements}><div className={styles.miniHeading}>Requirements</div><div className={styles.metricGrid}><div className={styles.metric}><span>Minimum</span><strong>{timed ? '00:45:00' : '—'}</strong></div><div className={styles.metric}><span>Maximum</span><strong>{timed ? '03:00:00' : '—'}</strong></div><div className={styles.metric}><span>Considered?</span><strong className={considered ? styles.good : styles.muted}>{timed ? considered ? 'Yes' : 'No' : 'No timer rule'}</strong></div><div className={styles.metric}><span>Participants</span><strong>{named.length}</strong></div></div></div></div>
       <div className={styles.staffRight}>{timed ? <><div className={styles.trackerHeader}><div><div className={styles.miniHeading}>Time tracker</div><p className={styles.help}>Start and end use the selected {draft.timezone} time zone.{!ranked ? ' Chill points use a separate time bonus.' : ''}</p></div><div className={styles.multiplier}><span>Multiplier</span><strong>×{multiplier.toFixed(2)}</strong></div></div><div className={styles.timerRows}><div className={styles.timerRow}><button className={styles.iconButton} onClick={() => recordTime('start')} aria-label="Record event start">▶</button><label className={styles.label}>Event start<input className={styles.input} type="datetime-local" value={dateTimeInput(draft.start, draft.timezone)} onChange={e => manualTime('start', e.target.value)} /></label><span className={styles.timeLabel}>{dateTimeLabel(draft.start, draft.timezone)}</span></div><div className={styles.timerRow}><button className={styles.iconButton} onClick={() => recordTime('end')} disabled={!draft.start} aria-label="Record event end">■</button><label className={styles.label}>Event end<input className={styles.input} type="datetime-local" value={dateTimeInput(draft.end, draft.timezone)} onChange={e => manualTime('end', e.target.value)} /></label><span className={styles.timeLabel}>{dateTimeLabel(draft.end, draft.timezone)}</span></div></div><div className={styles.runtimeGrid}><div className={styles.metric}><span>Event runtime</span><strong>{hours.toFixed(2)} hours <small>· {Math.floor(minutes)} min</small></strong></div><div className={styles.metric}><span>Panel runtime <small>since opening</small></span><strong className={styles.runtime}>{clock(panelOpenedAt ? now - panelOpenedAt : 0)}</strong></div></div></> : <div className={styles.staticNote}><div className={styles.miniHeading}>Static leaderboard event</div><p>Enter each participant’s final leaderboard rank below. This event uses the rank point formula without a timer or multiplier.</p><button className={styles.secondaryButton} onClick={() => recordTime(draft.start && !draft.end ? 'end' : 'start')}>{draft.start && !draft.end ? 'End event' : 'Start event'}</button></div>}</div>
    </div></section>

    <section className={styles.panel}><div className={styles.panelTitle}><span>Participant panel</span><span className={styles.titleMeta}>{roundsMode ? 'Round positions · lower is better' : ranked ? 'Final leaderboard ranks' : 'Attendance and participation points'}</span></div><div className={styles.participantBody}>{roundsMode && <div className={styles.tableControls}><label className={styles.label}>Rounds used<select className={styles.input} value={draft.roundCount} onChange={e => update('roundCount', Number(e.target.value))}>{Array.from({ length: 10 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}</select></label><p>Blank round = position {named.length + 1}. Tied totals share the same final rank.</p></div>}<div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Participant</th>{roundsMode && Array.from({ length: draft.roundCount }, (_, i) => <th key={i}>R{i + 1}</th>)}{roundsMode && <th>Position total</th>}{!roundsMode && ranked && <th>Leaderboard rank</th>}{!ranked && <th>Attended</th>}{ranked && <th>Final rank</th>}<th>Base pts</th><th>Final pts</th><th><span className={styles.srOnly}>Remove</span></th></tr></thead><tbody>{draft.participants.map(p => { const result = results.find(r => r.id === p.id); return <tr key={p.id}><td className={styles.nameCell}><input className={styles.tableInput} value={p.name} placeholder="Discord name" aria-label="Participant name" onChange={e => updateParticipant(p.id, { name: e.target.value })} /></td>{roundsMode && Array.from({ length: draft.roundCount }, (_, i) => <td key={i}><input className={styles.tableInput} type="number" min="1" step="1" value={p.rounds[i]} aria-label={`Round ${i + 1} position for ${p.name || 'participant'}`} onChange={e => updateParticipant(p.id, { rounds: p.rounds.map((v, j) => j === i ? e.target.value : v) })} /></td>)}{roundsMode && <td>{result?.total ?? '—'}</td>}{!roundsMode && ranked && <td><input className={styles.tableInput} type="number" min="1" step="1" value={p.rank} aria-label={`Leaderboard rank for ${p.name || 'participant'}`} onChange={e => updateParticipant(p.id, { rank: e.target.value })} /></td>}{!ranked && <td><input className={styles.checkbox} type="checkbox" checked={p.attended} aria-label={`Attended: ${p.name || 'participant'}`} onChange={e => updateParticipant(p.id, { attended: e.target.checked })} /></td>}{ranked && <td>{result?.finalRank || '—'}</td>}<td>{result?.base ?? '—'}</td><td className={styles.points}>{result?.points ?? '—'}</td><td><button className={styles.remove} aria-label={`Remove ${p.name || 'participant'}`} onClick={() => setDraft(d => ({ ...d, concluded: false, participants: d.participants.filter(row => row.id !== p.id) }))}>×</button></td></tr>; })}</tbody></table></div><button className={styles.addButton} onClick={() => setDraft(d => ({ ...d, concluded: false, participants: [...d.participants, participant()] }))}>+ Add unallocated participant</button></div></section>

    <section className={styles.panel}><div className={styles.panelTitle}><span>Conclusion panel</span></div><div className={styles.conclusionGrid}><div className={styles.output}><div className={styles.outputHeading}><div><strong>Send to #comm. lounge</strong><span>Staff report</span></div><button className={styles.secondaryButton} onClick={() => copy(reportText)}>Copy report</button></div><pre>{reportText}</pre></div><div className={styles.output}><div className={styles.outputHeading}><div><strong>Event results</strong><span>Participant breakdown</span></div><button className={styles.secondaryButton} onClick={() => copy(resultsText)}>Copy results</button></div><pre>{resultsText}</pre></div><div className={styles.concludeBox}><div className={styles.miniHeading}>Ready to conclude?</div><p>{completionIssue || 'The event requirements are met.'}</p><button className={styles.primaryButton} disabled={!canConclude || Boolean(completionIssue)} onClick={conclude}>{draft.concluded ? 'Concluded locally' : 'Conclude event'}</button><p className={styles.help}>This draft stays in this browser. Conclusion does not upload scores or notify Discord.</p></div></div><details className={styles.errorReference}><summary>Workbook error code reference</summary><dl>{Object.entries(EVENT_ERROR_CODES).map(([code, meaning]) => <div key={code}><dt>{code}</dt><dd>{meaning}</dd></div>)}</dl></details></section>
    <ToastStack toasts={toasts} onDismiss={dismissToast} />
  </div>;
}
