// FILE: app/(app)/managesession/QuickAddTrainee.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUserPlus, faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons';
import { searchKnownTrainees, type KnownTraineeMatch } from './traineeActions';
import { quickAddTrainee } from './quickAddActions';

export default function QuickAddTrainee({ sessionId }: { sessionId: number }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<KnownTraineeMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  function openPopover() {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      // Right-align to the button, positioned in fixed/viewport coords —
      // scrolling the page just moves it naturally with everything else.
      setCoords({ top: rect.bottom + 6, left: Math.max(12, rect.right - 260) });
    }
    setOpen(true);
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        popoverRef.current &&
        btnRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const timeout = setTimeout(async () => {
      setResults(await searchKnownTrainees(query));
      setLoading(false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  async function handlePick(match: KnownTraineeMatch) {
    setAdding(true);
    const { error } = await quickAddTrainee(sessionId, {
      robloxUsername: match.robloxUsername ?? '',
      discordUsername: match.discordUsername,
      discordId: match.discordId ?? '',
    });
    setAdding(false);

    if (!error) {
      setJustAdded(true);
      setTimeout(() => {
        setOpen(false);
        setJustAdded(false);
        setQuery('');
        setResults([]);
      }, 900);
    }
  }

  return (
    <>
      <button ref={btnRef} type="button" className="quick-add-btn" title="Quick add trainee" onClick={openPopover}>
        <FontAwesomeIcon icon={faUserPlus} />
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popoverRef}
            className="quick-add-popover quick-add-popover-portal"
            style={{ top: coords.top, left: coords.left }}
            onClick={(e) => e.stopPropagation()}
          >
            {justAdded ? (
              <div className="quick-add-success">Added ✓</div>
            ) : (
              <>
                <div className="quick-add-search-wrap">
                  <FontAwesomeIcon icon={faMagnifyingGlass} className="quick-add-search-icon" />
                  <input
                    type="text"
                    className="quick-add-search-input"
                    placeholder="Search known trainees…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    autoFocus
                  />
                </div>
                {loading && <div className="quick-add-hint">Searching…</div>}
                {!loading && query.trim().length >= 2 && results.length === 0 && (
                  <div className="quick-add-hint">No matches — open the full session editor to add a new trainee.</div>
                )}
                {results.length > 0 && (
                  <div className="quick-add-results">
                    {results.map((r) => (
                      <button
                        type="button"
                        key={r.discordId ?? r.discordUsername}
                        className="quick-add-result"
                        disabled={adding}
                        onClick={() => handlePick(r)}
                      >
                        <span className="qar-discord">{r.discordUsername}</span>
                        {r.robloxUsername && <span className="qar-roblox">{r.robloxUsername}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>,
          document.body
        )}
    </>
  );
}