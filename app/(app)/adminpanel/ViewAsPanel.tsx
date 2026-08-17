'use client';
// FILE: app/(app)/adminpanel/ViewAsPanel.tsx
import { useEffect, useRef, useState, useTransition } from 'react';
import { startViewAs, stopViewAs } from '@/app/actions/viewAs';
import { searchStaffForViewAs, type StaffLookupResult } from '@/lib/viewAs/staffLookup';
import {
  VIEWABLE_RANKS, labelForRank, DEFAULT_VIEW_AS_AUTHS, AUTH_FLAG_LABELS, type ViewAsAuthFlags,
} from '@/lib/viewAs/rankMap';
import type { ViewAsState } from '@/lib/getCurrentUser';

export default function ViewAsPanel({ viewingAs }: { viewingAs: ViewAsState | null }) {
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
    return () => { if (searchDebounce.current) clearTimeout(searchDebounce.current); };
  }, [query, mode]);

  function toggleAuth(key: keyof ViewAsAuthFlags) {
    setAuths((a) => ({ ...a, [key]: !a[key] }));
  }

  function pickPerson(r: StaffLookupResult) {
    setSelected(r);
    setQuery(r.discordUsername);
    setResults([]);
    setAuths(r.auths); // baseline pulled from their real row — still freely editable after
  }

  function switchMode(next: 'rank' | 'person') {
    setMode(next);
    setSelected(null);
    setAuths(DEFAULT_VIEW_AS_AUTHS);
  }

  if (viewingAs) {
    return (
      <div className="ap-card">
        <h2 className="ap-card-title">View As</h2>
        <div className="ap-viewas-active">
          <span>
            Currently viewing as <strong>{viewingAs.personLabel ?? labelForRank(viewingAs.rank)}</strong>
            {viewingAs.personLabel && <span style={{ opacity: 0.55 }}> ({labelForRank(viewingAs.rank)})</span>}
          </span>
          <button
            className="mbtn danger"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await stopViewAs();
                window.location.reload();
              })
            }
          >
            Exit View As
          </button>
        </div>
        <div className="ap-active-auths">
          {(Object.keys(viewingAs.auths) as (keyof ViewAsAuthFlags)[])
            .filter((k) => viewingAs.auths[k])
            .map((k) => (
              <span key={k} className="ap-auth-pill">{AUTH_FLAG_LABELS[k]}</span>
            ))}
          {Object.values(viewingAs.auths).every((v) => !v) && (
            <span style={{ fontSize: '.72rem', color: 'rgba(255,255,255,.35)' }}>No auth flags enabled.</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="ap-card">
      <h2 className="ap-card-title">View As</h2>
      <p className="ap-card-sub">
        Temporarily see the site as a specific rank, or as a specific staff member pulled from
        the roster (works even if they haven&apos;t logged in yet), would — useful for checking
        what a given role or person can and can&apos;t see. Every session is logged. This is
        also shown as a pill in the header on every page while active.
      </p>

      <div className="ap-viewas-form">
        <div className="ap-mode-toggle">
          <button
            type="button"
            className={mode === 'rank' ? 'active' : ''}
            onClick={() => switchMode('rank')}
          >
            By Rank
          </button>
          <button
            type="button"
            className={mode === 'person' ? 'active' : ''}
            onClick={() => switchMode('person')}
          >
            By Person
          </button>
        </div>

        {mode === 'rank' ? (
          <div className="ms-form-group">
            <label>Simulate rank</label>
            <select value={rank} onChange={(e) => setRank(e.target.value)}>
              {VIEWABLE_RANKS.map((r) => (
                <option key={r} value={r}>{labelForRank(r)}</option>
              ))}
            </select>
          </div>
        ) : (
          <div className="ms-form-group">
            <label>Search staff (roster or already-claimed)</label>
            <input
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
              placeholder="Discord username…"
            />
            {results.length > 0 && (
              <div className="ap-search-results">
                {results.map((r) => (
                  <button
                    type="button"
                    key={`${r.source}-${r.discordId}`}
                    className="ap-search-result"
                    onClick={() => pickPerson(r)}
                  >
                    <span>{r.discordUsername}</span>
                    <span className="ap-search-result-meta">
                      {labelForRank(r.staffRank)}{r.source === 'roster' ? ' · unclaimed' : ''}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {selected && (
              <div className="ap-selected-person">
                Selected: <strong>{selected.discordUsername}</strong> ({labelForRank(selected.staffRank)})
              </div>
            )}
          </div>
        )}

        <div className="ms-form-group">
          <label>Auth flags (freely testable, independent of rank/person)</label>
          <div className="ap-auth-grid">
            {(Object.keys(auths) as (keyof ViewAsAuthFlags)[]).map((key) => (
              <label key={key} className="ap-auth-checkbox">
                <input type="checkbox" checked={auths[key]} onChange={() => toggleAuth(key)} />
                {AUTH_FLAG_LABELS[key]}
              </label>
            ))}
          </div>
        </div>

        <div className="ms-form-group">
          <label>Reason (required, logged)</label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. checking Head Staff card visibility"
          />
        </div>

        {error && <div className="ap-error">{error}</div>}

        <button
          className="mbtn primary"
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
          Start Viewing As {mode === 'rank' ? labelForRank(rank) : (selected?.discordUsername ?? '…')}
        </button>
      </div>
    </div>
  );
}