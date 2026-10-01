'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faCopy, faEye, faEyeSlash, faImage, faPlus, faSearch } from '@fortawesome/free-solid-svg-icons';
import FeedbackImages, { type FeedbackImage } from '../sessionongoing/FeedbackImages';
import type { TrainerFeedbackLog } from '@/lib/feedbackTrainerData';
import { saveTrainerFeedback } from './actions';
import { formatFeedbackSetupTime } from '@/lib/feedbackSetupTime';
import { formatInstantInSiteTimezone, type SiteTimezoneMode } from '@/lib/siteTimezone';

type Selection = number | 'new' | null;
const FEEDBACK_BATCH_SIZE = 10;

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function FeedbackTrainerClient({ logs, viewerDiscordId, viewerName, timezoneMode, initialImages, initialSelected, message, messageKind }: {
  logs: TrainerFeedbackLog[];
  viewerDiscordId: string | null;
  viewerName: string | null;
  timezoneMode: SiteTimezoneMode;
  initialImages: Record<number, FeedbackImage[]>;
  initialSelected: number | null;
  message: string | null;
  messageKind: 'success' | 'error';
}) {
  const [selection, setSelection] = useState<Selection>(initialSelected);
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<'all' | 'mine'>('all');
  const [visibleCount, setVisibleCount] = useState(FEEDBACK_BATCH_SIZE);
  const [showId, setShowId] = useState(false);
  const [images, setImages] = useState(initialImages);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<Selection>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const copyResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (copyResetTimer.current) clearTimeout(copyResetTimer.current); }, []);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const scoped = scope === 'mine' && viewerDiscordId ? logs.filter((log) => log.trainer_id === viewerDiscordId) : logs;
    return query ? scoped.filter((log) =>
      [log.trainee_name, log.session_label, log.overall ?? '', log.notes ?? '', log.trainee_id ?? '']
        .some((value) => value.toLowerCase().includes(query))) : scoped;
  }, [logs, search, scope, viewerDiscordId]);
  const visibleLogs = filtered.slice(0, visibleCount);
  const selected = typeof selection === 'number' ? logs.find((log) => log.log_id === selection) ?? null : null;
  const selectedImages = selected ? images[selected.log_id] ?? [] : [];
  const latestImage = selectedImages.reduce<FeedbackImage | undefined>((latest, image) =>
    !latest || String(image.created_at ?? '') > String(latest.created_at ?? '') ? image : latest, undefined);

  async function uploadImage(file: File) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set('image', file);
      const response = await fetch(`/api/feedbacktrainer/${selected.log_id}/images`, { method: 'POST', body: form });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Could not upload image.');
      setImages((current) => ({ ...current, [selected.log_id]: [...(current[selected.log_id] ?? []), result.image]
        .sort((a, b) => a.position - b.position) }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not upload image.'); }
    finally { setBusy(false); }
  }

  async function removeImage(id: string) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/feedbacktrainer/${selected.log_id}/images`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Could not remove image.');
      setImages((current) => ({ ...current, [selected.log_id]: (current[selected.log_id] ?? []).filter((image) => image.id !== id) }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not remove image.'); }
    finally { setBusy(false); }
  }

  async function copyFeedback() {
    if (!formRef.current) return;
    const fields = new FormData(formRef.current);
    const value = (key: string) => String(fields.get(key) ?? '');
    const [year, month, day] = (selected?.session_date ?? '').split('-');
    const datePart = year && month && day ? `${day}/${month}/${year}` : '__/__/____';
    const feedbackDate = formatInstantInSiteTimezone(new Date(selected?.created_at ?? Date.now()), timezoneMode, {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
    }).replace(', ', ' | ');
    const dateLine = selected?.feedback_origin === 'session'
      ? `**Date of session**: ${datePart} | ${selected.session_time || '--:--'} ${timezoneMode}`
      : `**Date of feedback**: ${feedbackDate} ${timezoneMode}`;
    const imageSection = selectedImages.length
      ? `\n__**Reference images**__\n${selectedImages.map((image, index) => `${index + 1}. ${image.url}`).join('\n')}\n`
      : '';
    const text = `# Practice Feedback
**Trainer**: ${selected?.trainer_name || viewerName || viewerDiscordId || ''}
${dateLine}
**Zone**: ${selected?.zone ?? ''}
**Trains signalled**: ${value('trains')}
**Set-up time**: ${value('setup_time_mmss')}

=========================

__**Zone Setup**__
${value('setup')}

__**Conflict Handling**__
${value('conflict')}

__**Priority Handling**__
${value('priority')}

__**Rollbacks and Delay**__
${value('rbtiming')}

__**Overall**__
${value('overall')}

__*Notes/Advice*__
${value('notes')}
${imageSection}
If you believe you were unfairly assessed or have any additional questions, feel free to ask!
Thank you for attending.`;
    try {
      await navigator.clipboard.writeText(text);
      setError(null);
      setCopiedKey(selection);
      if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
      copyResetTimer.current = setTimeout(() => setCopiedKey(null), 1500);
    } catch { setError('Could not copy feedback. Check clipboard permissions.'); }
  }

  return <div className="feedback-trainer-page">
    <header className="ft-heading">
      <div><div className="section-label">Trainer Feedback</div><p className="section-sub">Review every feedback entry and its reference images.</p></div>
      <span className="ft-total">{logs.length} feedback{logs.length === 1 ? '' : 's'}</span>
    </header>
    {(message || error) && <div className={`ft-message ${(error || messageKind === 'error') ? 'ft-error' : ''}`} role="status">{error || message}</div>}
    <div className={`ft-workspace ${selected ? 'ft-has-selection' : ''}`}>
      <aside className="ft-panel ft-list-panel" aria-label="All feedbacks">
        <div className="ft-panel-head"><h2>All feedbacks</h2><button type="button" className="ft-icon-button" title="New standalone feedback" aria-label="New standalone feedback" onClick={() => { setSelection('new'); setError(null); }}><FontAwesomeIcon icon={faPlus} /></button></div>
        <label className="ft-search"><FontAwesomeIcon icon={faSearch} /><input value={search} onChange={(event) => { setSearch(event.target.value); setVisibleCount(FEEDBACK_BATCH_SIZE); }} placeholder="Search feedback" /></label>
        {viewerDiscordId && <div className="ft-scope" role="group" aria-label="Feedback scope"><button type="button" aria-pressed={scope === 'all'} className={scope === 'all' ? 'ft-scope-active' : ''} onClick={() => { setScope('all'); setVisibleCount(FEEDBACK_BATCH_SIZE); }}>All</button><button type="button" aria-pressed={scope === 'mine'} className={scope === 'mine' ? 'ft-scope-active' : ''} onClick={() => { setScope('mine'); setVisibleCount(FEEDBACK_BATCH_SIZE); }}>Mine</button></div>}
        <div className="ft-list">
          {filtered.length === 0 && <p className="ft-muted">No feedback found.</p>}
          {visibleLogs.map((log) => <button key={log.log_id} type="button" className={`ft-list-item ${selection === log.log_id ? 'ft-active' : ''}`} aria-pressed={selection === log.log_id} onClick={() => { setSelection((current) => current === log.log_id ? null : log.log_id); setShowId(false); setError(null); }}>
            <strong>{log.trainee_name}</strong><span>{log.session_label}</span><small>{dateLabel(log.updated_at)}</small>
          </button>)}
        </div>
        {visibleCount < filtered.length && <button type="button" className="ft-view-more" onClick={() => setVisibleCount((count) => count + FEEDBACK_BATCH_SIZE)}>View more…</button>}
      </aside>

      {selected && <aside className="ft-panel ft-image-rail" aria-label="Feedback images">
        <div className="ft-panel-head"><h2>Images</h2><span className="ft-count">{selectedImages.length}/10</span></div>
        {latestImage ? <a className="ft-latest" href={latestImage.url} target="_blank" rel="noopener noreferrer"><img src={latestImage.url} alt={latestImage.file_name} /><span>Latest image</span></a> : <div className="ft-image-empty"><FontAwesomeIcon icon={faImage} /><span>No reference images yet</span></div>}
        {selectedImages.length > 1 && <div className="ft-rail-grid">{selectedImages.filter((image) => image.id !== latestImage?.id).map((image) => <a key={image.id} href={image.url} target="_blank" rel="noopener noreferrer"><img src={image.url} alt={image.file_name} /></a>)}</div>}
      </aside>}

      <section className="ft-panel ft-detail" aria-label="Selected feedback">
        {selection === null && <div className="ft-detail-empty"><FontAwesomeIcon icon={faImage} /><h2>Select a feedback</h2><p>Choose a record to review, or create standalone feedback.</p></div>}
        {selection === 'new' && <form key="new" ref={formRef} action={saveTrainerFeedback} className="ft-form">
          <input type="hidden" name="mode" value="create" />
          <div className="ft-detail-header"><div><span className="ft-eyebrow">Standalone feedback</span><h1>New feedback</h1><p>No session trainee record is required.</p></div><button type="button" className="ft-secondary" onClick={() => setSelection(null)}>Cancel</button></div>
          <div className="ft-create-fields"><label>Trainee name<input name="trainee_name" required maxLength={160} placeholder="Name or username" /></label><label>Discord ID <span>(optional)</span><input name="trainee_id" inputMode="numeric" placeholder="Discord ID" /></label></div>
          <FeedbackFields />
          <div className="ft-actions"><button type="button" className={`ft-secondary ft-copy-button ${copiedKey === 'new' ? 'ft-copied' : ''}`} onClick={() => void copyFeedback()} aria-live="polite"><FontAwesomeIcon icon={copiedKey === 'new' ? faCheck : faCopy} /> {copiedKey === 'new' ? 'Copied' : 'Copy'}</button><button type="submit" className="ft-primary">Create feedback</button></div>
          <p className="ft-muted">Save the feedback first, then attach up to 10 reference images.</p>
        </form>}
        {selected && <form key={selected.log_id} ref={formRef} action={saveTrainerFeedback} className="ft-form">
          <input type="hidden" name="mode" value="edit" /><input type="hidden" name="log_id" value={selected.log_id} />
          <div className="ft-detail-header"><div><span className="ft-eyebrow">{selected.session_label}</span><div className="ft-name-row"><h1>{selected.trainee_name}</h1>{selected.trainee_id && <button type="button" className="ft-id-toggle" onClick={() => setShowId((value) => !value)}><FontAwesomeIcon icon={showId ? faEyeSlash : faEye} /> {showId ? selected.trainee_id : 'Show Discord ID'}</button>}</div><p>Updated {dateLabel(selected.updated_at)}</p></div><button type="button" className={`ft-secondary ft-copy-button ${copiedKey === selected.log_id ? 'ft-copied' : ''}`} onClick={() => void copyFeedback()} aria-live="polite"><FontAwesomeIcon icon={copiedKey === selected.log_id ? faCheck : faCopy} /> {copiedKey === selected.log_id ? 'Copied' : 'Copy'}</button></div>
          {selected.feedback_origin === 'standalone' && <div className="ft-create-fields"><label>Trainee name<input name="trainee_name" required maxLength={160} defaultValue={selected.trainee_name} /></label></div>}
          <FeedbackFields log={selected} />
          <div className="ft-actions"><button type="submit" className="ft-primary">Save feedback</button></div>
          <FeedbackImages images={selectedImages} busy={busy} onAdd={uploadImage} onRemove={removeImage} onError={setError} />
        </form>}
      </section>
    </div>
  </div>;
}

function FeedbackFields({ log }: { log?: TrainerFeedbackLog }) {
  const fields = [
    ['setup', 'Setup'], ['conflict', 'Conflict'], ['priority', 'Priority'],
    ['rbtiming', 'RB timing'], ['overall', 'Overall'], ['notes', 'Notes'],
  ] as const;
  return <>
    <div className="ft-metrics">{log?.zone != null && <div className="ft-zone"><span>Zone</span><strong>{log.zone}</strong></div>}<label>Trains<input type="number" name="trains" min={0} max={32767} defaultValue={log?.trains ?? ''} /></label><label><span className="ft-field-label">Setup time <small>(MM:SS)</small></span><input type="text" name="setup_time_mmss" inputMode="numeric" pattern="[0-9]{2,}:[0-5][0-9]" title="Enter minutes and seconds as MM:SS" placeholder="00:00" defaultValue={formatFeedbackSetupTime(log?.setup_seconds ?? null)} /></label></div>
    <div className="ft-field-grid">{fields.map(([key, label]) => <label key={key}>{label}<textarea name={key} rows={key === 'overall' || key === 'notes' ? 4 : 3} defaultValue={log?.[key] ?? ''} placeholder={`${label} feedback`} /></label>)}</div>
  </>;
}
