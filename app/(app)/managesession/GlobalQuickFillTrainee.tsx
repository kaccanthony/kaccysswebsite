// FILE: app/(app)/managesession/GlobalQuickFillTrainee.tsx
'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBolt, faTimes } from '@fortawesome/free-solid-svg-icons';
import { parseTraineePaste, parseFlexibleDateCandidates, checkRequiredSessionFields, checkIdentityFields, checkIdentityFieldFormats } from './parseTraineePaste';
import { lookupKnownTrainee, findSessionsByHostAndDate, validateHostRank, resolveHostByDiscordId, type SessionMatch } from './traineeActions';
import { quickAddTrainee } from './quickAddActions';

export default function GlobalQuickFillTrainee() {
  const [open, setOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<SessionMatch[] | null>(null); // set when >1 match — asks user to pick
  const [pendingFill, setPendingFill] = useState<{ roblox: string; discord: string; discordId: string; zone: string; position: string; notes: string } | null>(null);
  const [success, setSuccess] = useState(false);

  function close() {
    setOpen(false);
    setPasteText('');
    setError(null);
    setCandidates(null);
    setPendingFill(null);
    setSuccess(false);
  }

  async function handleParseAndFind() {
    setError(null);
    const parsed = parseTraineePaste(pasteText);

    const reqCheck = checkRequiredSessionFields(parsed);
    if (!reqCheck.ok) {
      setError(`Missing required field(s): ${reqCheck.missing.join(', ')}.`);
      return;
    }

    const idCheck = checkIdentityFields(parsed.discordId, parsed.discordUsername, parsed.robloxUsername);
    if (!idCheck.anyProvided) {
      setError('Please input any of the fields: Discord ID, Discord Username, Roblox Username.');
      return;
    }

    const formatCheck = checkIdentityFieldFormats(parsed.discordId, parsed.discordUsername, parsed.robloxUsername);
    if (!formatCheck.ok) {
      setError(formatCheck.errors.join(' '));
      return;
    }

    setLoading(true);

    let resolvedHost = parsed.host;
    if (parsed.hostDiscordId) {
      const { name, error: idError } = await resolveHostByDiscordId(parsed.hostDiscordId);
      if (idError || !name) {
        setLoading(false);
        setError(idError ?? 'Could not resolve the Host mention.');
        return;
      }
      resolvedHost = name;
    } else {
      const rankError = await validateHostRank(parsed.host, parsed.hostPrefix);
      if (rankError) {
        setLoading(false);
        setError(rankError);
        return;
      }
    }

    let robloxUsername = parsed.robloxUsername;
    let discordUsername = parsed.discordUsername;
    let discordId = parsed.discordId;

    if (!idCheck.ok) {
      const match = await lookupKnownTrainee(discordId, discordUsername);
      if (match) {
        discordId = match.discordId ?? discordId;
        discordUsername = match.discordUsername || discordUsername;
        robloxUsername = match.robloxUsername ?? robloxUsername;
      } else {
        const stillMissing = checkIdentityFields(discordId, discordUsername, robloxUsername).missing;
        setLoading(false);
        setError(`This trainee isn't in known_trainees yet — please also fill in: ${stillMissing.join(', ')}.`);
        return;
      }
    }

    // Try every plausible date reading (DD/MM vs MM/DD) against real sessions.
    const dateCandidates = parseFlexibleDateCandidates(parsed.dateTime);
    if (dateCandidates.length === 0) {
      setLoading(false);
      setError("Couldn't understand the pasted date — expected DD/MM/YYYY, MM/DD/YYYY, or YYYY-MM-DD.");
      return;
    }

    const allMatches: SessionMatch[] = [];
    for (const date of dateCandidates) {
      allMatches.push(...(await findSessionsByHostAndDate(resolvedHost, date)));
    }
    setLoading(false);

    const fillData = { roblox: robloxUsername, discord: discordUsername, discordId, zone: parsed.zone, position: parsed.position, notes: parsed.notes };

    if (allMatches.length === 0) {
      setError(`No session found for host "${resolvedHost}" on that date — check the paste matches an existing session.`);
      return;
    }
    if (allMatches.length === 1) {
      await doAdd(allMatches[0].sessionId, fillData);
      return;
    }
    // Multiple sessions with the same host on the same date — ask which one.
    setCandidates(allMatches);
    setPendingFill(fillData);
  }

  async function doAdd(sessionId: number, fill: NonNullable<typeof pendingFill>) {
    setLoading(true);
    const { error } = await quickAddTrainee(sessionId, {
      robloxUsername: fill.roblox,
      discordUsername: fill.discord,
      discordId: fill.discordId,
      zone: fill.zone,
      trainerName: fill.position || undefined,
      note: fill.notes || undefined,
    });
    setLoading(false);

    if (error) {
      setError(error);
      return;
    }
    setSuccess(true);
    setTimeout(close, 1000);
  }

  return (
    <>
      <button type="button" className="btn-primary btn-quickfill-global" onClick={() => setOpen(true)}>
        <FontAwesomeIcon icon={faBolt} /> Quick Fill Trainee
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="modal-backdrop" onClick={close}>
            <div className="modal-box modal-sm" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2 className="modal-title">Quick Fill Trainee</h2>
                <button className="modal-close-btn" onClick={close}><FontAwesomeIcon icon={faTimes} /></button>
              </div>

              {success ? (
                <div className="quick-add-success">Trainee added ✓</div>
              ) : candidates ? (
                <>
                  <p className="internal-hint">Multiple sessions matched — pick the right one:</p>
                  <div className="quick-add-results">
                    {candidates.map((c) => (
                      <button
                        type="button"
                        key={c.sessionId}
                        className="quick-add-result"
                        onClick={() => pendingFill && doAdd(c.sessionId, pendingFill)}
                      >
                        <span className="qar-discord">#{c.sessionId} — {c.sessionName || 'Untitled'}</span>
                        <span className="qar-roblox">{c.time.slice(0, 5)}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <p className="internal-hint">
                    No need to find the session first — paste the block below, the host and date tell us which
                    session to add this trainee to.
                  </p>
                  <textarea
                    className="paste-textarea"
                    rows={9}
                    placeholder={'[Trainee discord ID]\n[Trainee discord username]\n[Trainee roblox username]\n`Host:` [HOST]\n`Date/Time:` DD/MM/YYYY HH:MM\n`Position:` [Position]\n`Zone:` [Zone]\n`Trainee Notes:` [optional]'}
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                  />
                  {error && <div className="alert alert-error">{error}</div>}
                  <div className="modal-footer">
                    <button type="button" className="btn-ghost" onClick={close}>Cancel</button>
                    <button type="button" className="btn-primary" disabled={loading} onClick={handleParseAndFind}>
                      {loading ? 'Finding session…' : 'Fill Trainee'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}