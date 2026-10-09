'use client';

import { useEffect, useState } from 'react';
import { lookupKnownTrainee, searchKnownTrainees, type KnownTraineeMatch } from '@/app/(app)/managesession/traineeActions';
import { checkIdentityFieldFormats, parseTraineePaste } from '@/app/(app)/managesession/parseTraineePaste';
import type { Attendee } from './ManageEventsClient';
import styles from './manageevents.module.css';

export default function EventAttendeeQuickFill({ label, onFill, onError }: { label: string; onFill: (attendee: Attendee) => void; onError: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'search' | 'paste'>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<KnownTraineeMatch[]>([]);
  const [paste, setPaste] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || mode !== 'search' || query.trim().length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      const matches = await searchKnownTrainees(query);
      if (!cancelled) { setResults(matches); setLoading(false); }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [open, mode, query]);

  function close() { setOpen(false); setQuery(''); setResults([]); setPaste(''); setLoading(false); }
  function fill(match: KnownTraineeMatch) {
    const attendee = {
      discord_id: match.discordId ?? '',
      discord_username: match.discordUsername,
      roblox_username: match.robloxUsername ?? '',
    };
    onFill(attendee);
    close();
  }
  async function fillPaste() {
    const parsed = parseTraineePaste(paste);
    let { discordId, discordUsername, robloxUsername } = parsed;
    if (!discordId && !discordUsername && !robloxUsername) { onError('Paste a Discord ID, Discord username, and Roblox username on separate lines.'); return; }
    if (!discordId || !discordUsername || !robloxUsername) {
      setLoading(true);
      const match = await lookupKnownTrainee(discordId, discordUsername);
      setLoading(false);
      if (match) {
        discordId ||= match.discordId ?? '';
        discordUsername ||= match.discordUsername;
        robloxUsername ||= match.robloxUsername ?? '';
      }
    }
    if (!discordId || !discordUsername || !robloxUsername) { onError('The known trainee record is incomplete. Enter all three fields manually.'); return; }
    const format = checkIdentityFieldFormats(discordId, discordUsername, robloxUsername);
    if (!format.ok) { onError(format.errors.join(' ')); return; }
    onFill({ discord_id: discordId, discord_username: discordUsername, roblox_username: robloxUsername });
    close();
  }

  return <div className={styles.quickFillWrap}>
    <div className={styles.attendeeHead}><span>{label}</span><button type="button" className={`${styles.quickFillToggle} ${open ? styles.quickFillActive : ''}`} onClick={() => open ? close() : setOpen(true)}>⌕ Quick Fill</button></div>
    {open && <div className={styles.quickFillPanel}>
      <div className={styles.quickFillTabs}><button type="button" className={mode === 'search' ? styles.quickFillActive : ''} onClick={() => { setMode('search'); setLoading(false); }}>Search</button><button type="button" className={mode === 'paste' ? styles.quickFillActive : ''} onClick={() => { setMode('paste'); setLoading(false); }}>Paste</button></div>
      {mode === 'search' ? <>
        <input className={styles.quickFillInput} value={query} onChange={e => { setQuery(e.target.value); setResults([]); setLoading(false); }} placeholder="Search known trainees by Discord or Roblox name…" autoFocus />
        {loading && <div className={styles.hint}>Searching…</div>}
        {!loading && query.trim().length >= 2 && results.length === 0 && <div className={styles.hint}>No matches. Try Paste or enter the details manually.</div>}
        <div className={styles.quickFillResults}>{results.map(match => <button type="button" key={match.discordId ?? match.discordUsername} onClick={() => fill(match)}><span>{match.discordUsername}</span><small>{match.robloxUsername || 'Roblox name missing'}</small></button>)}</div>
      </> : <>
        <textarea className={styles.quickFillInput} rows={4} value={paste} onChange={e => setPaste(e.target.value)} placeholder={'Discord ID\nDiscord username\nRoblox username'} />
        <button type="button" className={styles.ghost} disabled={loading} onClick={fillPaste}>{loading ? 'Checking…' : 'Fill attendee'}</button>
      </>}
    </div>}
  </div>;
}
