'use client';
// components/ViewAsPicker.tsx
import { useState, useTransition, useEffect, useRef } from 'react';
import { startViewAs, stopViewAs } from '@/app/actions/viewAs';
import { searchStaffForViewAs, type StaffLookupResult } from '@/lib/viewAs/staffLookup';
import { VIEWABLE_RANKS, labelForRank, DEFAULT_VIEW_AS_AUTHS, AUTH_FLAG_LABELS, type ViewAsAuthFlags } from '@/lib/viewAs/rankMap';
import type { ViewAsState } from '@/lib/getCurrentUser';

export default function ViewAsPicker({ viewingAs }: { viewingAs: ViewAsState | null }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'rank' | 'person'>('rank');
  const [rank, setRank] = useState(VIEWABLE_RANKS[0]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StaffLookupResult[]>([]);
  const [selected, setSelected] = useState<StaffLookupResult | null>(null);
  const [auths, setAuths] = useState<ViewAsAuthFlags>(DEFAULT_VIEW_AS_AUTHS);
  const [reason, setReason] = useState('');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (mode !== 'person' || query.trim().length < 2) { setResults([]); return; }
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(async () => {
      try { setResults(await searchStaffForViewAs(query)); } catch { setResults([]); }
    }, 250);
  }, [query, mode]);

  function toggleAuth(key: keyof ViewAsAuthFlags) {
    setAuths((a) => ({ ...a, [key]: !a[key] }));
  }

  function pickPerson(r: StaffLookupResult) {
    setSelected(r);
    setQuery(r.discordUsername);
    setResults([]);
    setAuths(r.auths); // baseline from their real row — still freely editable after
  }

  if (viewingAs) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.78rem', color: '#ffe3c2' }}>
        <span>
          Viewing as <strong>{viewingAs.personLabel ?? labelForRank(viewingAs.rank)}</strong>
        </span>
        <button
          disabled={pending}
          onClick={() => startTransition(async () => { await stopViewAs(); window.location.reload(); })}
        >
          Exit view-as
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen((o) => !o)}>View as…</button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', right: 0, background: '#141414', border: '1px solid rgba(255,255,255,.18)', borderRadius: 10, padding: 14, width: 320, zIndex: 50 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <button
              onClick={() => { setMode('rank'); setSelected(null); setAuths(DEFAULT_VIEW_AS_AUTHS); }}
              style={{ flex: 1, fontWeight: mode === 'rank' ? 700 : 400, opacity: mode === 'rank' ? 1 : 0.6 }}
            >
              By Rank
            </button>
            <button
              onClick={() => { setMode('person'); setAuths(DEFAULT_VIEW_AS_AUTHS); }}
              style={{ flex: 1, fontWeight: mode === 'person' ? 700 : 400, opacity: mode === 'person' ? 1 : 0.6 }}
            >
              By Person
            </button>
          </div>

          {mode === 'rank' ? (
            <>
              <label style={{ fontSize: '.68rem', color: 'rgba(255,255,255,.55)' }}>Simulate rank</label>
              <select value={rank} onChange={(e) => setRank(e.target.value)} style={{ width: '100%', margin: '6px 0 10px' }}>
                {VIEWABLE_RANKS.map((r) => <option key={r} value={r}>{labelForRank(r)}</option>)}
              </select>
            </>
          ) : (
            <>
              <label style={{ fontSize: '.68rem', color: 'rgba(255,255,255,.55)' }}>Search staff (roster or claimed)</label>
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
                placeholder="Discord username…"
                style={{ width: '100%', margin: '6px 0' }}
              />
              {results.length > 0 && (
                <div style={{ maxHeight: 140, overflowY: 'auto', border: '1px solid rgba(255,255,255,.12)', borderRadius: 6, marginBottom: 10 }}>
                  {results.map((r) => (
                    <button
                      key={`${r.source}-${r.discordId}`}
                      onClick={() => pickPerson(r)}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', fontSize: '.78rem' }}
                    >
                      {r.discordUsername} <span style={{ opacity: 0.5 }}>— {labelForRank(r.staffRank)}{r.source === 'roster' ? ' (unclaimed)' : ''}</span>
                    </button>
                  ))}
                </div>
              )}
              {selected && (
                <div style={{ fontSize: '.74rem', color: '#9be8a5', marginBottom: 10 }}>
                  Selected: {selected.discordUsername} ({labelForRank(selected.staffRank)})
                </div>
              )}
            </>
          )}

          <label style={{ fontSize: '.68rem', color: 'rgba(255,255,255,.55)', display: 'block', margin: '4px 0 6px' }}>
            Auth flags (freely testable, independent of rank/person)
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 10px', marginBottom: 10 }}>
            {(Object.keys(auths) as (keyof ViewAsAuthFlags)[]).map((key) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.72rem' }}>
                <input type="checkbox" checked={auths[key]} onChange={() => toggleAuth(key)} />
                {AUTH_FLAG_LABELS[key]}
              </label>
            ))}
          </div>

          <label style={{ fontSize: '.68rem', color: 'rgba(255,255,255,.55)' }}>Reason (required, logged)</label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. checking Head Staff card visibility"
            style={{ width: '100%', margin: '6px 0 10px' }}
          />
          {error && <div style={{ color: '#ff9090', fontSize: '.72rem', marginBottom: 8 }}>{error}</div>}
          <button
            disabled={pending || !reason.trim() || (mode === 'person' && !selected)}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                try {
                  if (mode === 'rank') {
                    await startViewAs({ mode: 'rank', rank, auths }, reason);
                  } else {
                    await startViewAs(
                      {
                        mode: 'person',
                        rank: selected!.staffRank,
                        permLevel: selected!.permLevel,
                        auths,
                        personDiscordId: selected!.discordId,
                        personLabel: selected!.discordUsername,
                      },
                      reason
                    );
                  }
                  window.location.reload();
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Failed to start view-as.');
                }
              });
            }}
          >
            Start viewing as {mode === 'rank' ? labelForRank(rank) : (selected?.discordUsername ?? '…')}
          </button>
        </div>
      )}
    </div>
  );
}