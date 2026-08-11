'use client';
// FILE: app/(app)/managefeedback/ManageFeedbackInteractive.tsx

import { useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { MANAGE_ICONS } from '@/lib/manageIcons';
import { saveFeedback, deleteFeedback } from './actions';
import type { FeedbackLog, SessionTraineeOption } from '@/lib/feedbackLogs';

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

type Selection = { type: 'none' } | { type: 'new' } | { type: 'existing'; logId: number };

export default function ManageFeedbackInteractive({
  logs,
  traineeOptions,
}: {
  logs: FeedbackLog[];
  traineeOptions: SessionTraineeOption[];
}) {
  const [search, setSearch] = useState('');
  const [selection, setSelection] = useState<Selection>({ type: 'none' });
  const [deleteTarget, setDeleteTarget] = useState<FeedbackLog | null>(null);

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter(
      (l) =>
        l.trainee_name.toLowerCase().includes(q) ||
        l.session_label.toLowerCase().includes(q) ||
        (l.overall ?? '').toLowerCase().includes(q) ||
        (l.notes ?? '').toLowerCase().includes(q)
    );
  }, [logs, search]);

  const selectedLog = selection.type === 'existing' ? logs.find((l) => l.log_id === selection.logId) ?? null : null;

  return (
    <div className="feedback-layout">
      {/* ── Sidebar: search + list ── */}
      <aside className="feedback-sidebar">
        <div className="search-wrap">
          <FontAwesomeIcon icon={MANAGE_ICONS.search} className="search-icon" />
          <input
            className="search-input"
            type="text"
            placeholder="Search feedback…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <button type="button" className="btn-primary btn-new-feedback" onClick={() => setSelection({ type: 'new' })}>
          <FontAwesomeIcon icon={MANAGE_ICONS.plus} /> New Feedback
        </button>

        <div className="feedback-list">
          {filteredLogs.length === 0 ? (
            <div className="empty-state-sm">
              <FontAwesomeIcon icon={MANAGE_ICONS.inbox} /> No feedback found.
            </div>
          ) : (
            filteredLogs.map((log) => {
              const isActive = selection.type === 'existing' && selection.logId === log.log_id;
              return (
                <button
                  key={log.log_id}
                  type="button"
                  className={`feedback-list-item${isActive ? ' active' : ''}`}
                  onClick={() => setSelection({ type: 'existing', logId: log.log_id })}
                >
                  <div className="fli-name">{log.trainee_name}</div>
                  <div className="fli-meta">{log.session_label}</div>
                  <div className="fli-time">{timeAgo(log.updated_at)}</div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* ── Detail panel ── */}
      <section className="feedback-detail">
        {selection.type === 'none' && (
          <div className="empty-state">
            <FontAwesomeIcon icon={MANAGE_ICONS.infoCircle} />
            <div>Select a feedback entry on the left, or create a new one.</div>
          </div>
        )}

        {selection.type === 'new' && <FeedbackForm mode="add" traineeOptions={traineeOptions} onCancel={() => setSelection({ type: 'none' })} />}

        {selection.type === 'existing' && selectedLog && (
          <FeedbackForm
            mode="edit"
            log={selectedLog}
            traineeOptions={traineeOptions}
            onCancel={() => setSelection({ type: 'none' })}
            onDelete={() => setDeleteTarget(selectedLog)}
          />
        )}
      </section>

      {/* ── Delete confirmation modal ── */}
      {deleteTarget && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setDeleteTarget(null)}>
          <div className="modal-box modal-sm">
            <div className="modal-header">
              <span className="modal-title">Delete feedback?</span>
              <button type="button" className="modal-close-btn" onClick={() => setDeleteTarget(null)} aria-label="Close">
                <FontAwesomeIcon icon={MANAGE_ICONS.close} />
              </button>
            </div>
            <p className="delete-msg">
              This will permanently delete the feedback for <strong>{deleteTarget.trainee_name}</strong> ({deleteTarget.session_label}
              ). This can't be undone.
            </p>
            <form action={deleteFeedback}>
              <input type="hidden" name="log_id" value={deleteTarget.log_id} />
              <div className="modal-footer">
                <button type="button" className="btn-ghost" onClick={() => setDeleteTarget(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn-danger">
                  <FontAwesomeIcon icon={MANAGE_ICONS.trash} /> Delete
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── The create/edit form itself ──────────────────────────────────────────
function FeedbackForm({
  mode,
  log,
  traineeOptions,
  onCancel,
  onDelete,
}: {
  mode: 'add' | 'edit';
  log?: FeedbackLog;
  traineeOptions: SessionTraineeOption[];
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [newSessionId, setNewSessionId] = useState('');

  const sessionsForPicker = useMemo(() => {
    const map = new Map<number, string>();
    traineeOptions.forEach((t) => map.set(t.session_id, t.session_label));
    return Array.from(map.entries()).sort((a, b) => b[0] - a[0]);
  }, [traineeOptions]);

  const traineesForSelectedSession = useMemo(
    () => traineeOptions.filter((t) => String(t.session_id) === newSessionId),
    [traineeOptions, newSessionId]
  );

  return (
    <form action={saveFeedback} className="modal-form feedback-form">
      <input type="hidden" name="action" value={mode} />
      {mode === 'edit' && log && <input type="hidden" name="log_id" value={log.log_id} />}

      <div className="detail-header-row">
        <div>
          <div className="modal-title">{mode === 'add' ? 'New Feedback' : log?.trainee_name}</div>
          {mode === 'edit' && log && <div className="feedback-subtle">{log.session_label}</div>}
        </div>
        {mode === 'edit' && onDelete && (
          <button type="button" className="btn-danger" onClick={onDelete}>
            <FontAwesomeIcon icon={MANAGE_ICONS.trash} /> Delete
          </button>
        )}
      </div>

      {/* ── Session + trainee: pickable when creating, locked once created ── */}
      {mode === 'add' ? (
        <div className="form-row">
          <div className="form-group flex2">
            <label>Session</label>
            <select name="session_id" value={newSessionId} onChange={(e) => setNewSessionId(e.target.value)} required>
              <option value="">Select a session…</option>
              {sessionsForPicker.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group flex2">
            <label>Trainee</label>
            <select name="trainee_id" required disabled={!newSessionId}>
              <option value="">{newSessionId ? 'Select a trainee…' : 'Pick a session first'}</option>
              {traineesForSelectedSession.map((t) => (
                <option key={t.trainee_id} value={t.trainee_id}>
                  {t.trainee_label}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <div className="form-row">
          <div className="form-group flex2">
            <label>Session</label>
            <div className="locked-field">{log?.session_label}</div>
          </div>
          <div className="form-group flex2">
            <label>Trainee</label>
            <div className="locked-field">{log?.trainee_name}</div>
          </div>
        </div>
      )}

      <div className="form-row">
        <div className="form-group flex2">
          <label>
            Trainer <span className="label-hint">(Discord ID, optional)</span>
          </label>
          <input type="text" name="trainer_id" defaultValue={log?.trainer_id ?? ''} placeholder="e.g. 123456789012345678" />
        </div>
        <div className="form-group">
          <label>Trains</label>
          <input type="number" name="trains" defaultValue={log?.trains ?? ''} min={0} />
        </div>
        <div className="form-group">
          <label>Setup Time (sec)</label>
          <input type="number" name="setup_seconds" defaultValue={log?.setup_seconds ?? ''} min={0} />
        </div>
      </div>

      <div className="form-divider">Assessment</div>

      <div className="form-row">
        <div className="form-group">
          <label>Setup</label>
          <input type="text" name="setup" defaultValue={log?.setup ?? ''} placeholder="e.g. Good" />
        </div>
        <div className="form-group">
          <label>Conflict</label>
          <input type="text" name="conflict" defaultValue={log?.conflict ?? ''} placeholder="e.g. Good" />
        </div>
        <div className="form-group">
          <label>Priority</label>
          <input type="text" name="priority" defaultValue={log?.priority ?? ''} placeholder="e.g. Good" />
        </div>
        <div className="form-group">
          <label>RB Timing</label>
          <input type="text" name="rbtiming" defaultValue={log?.rbtiming ?? ''} placeholder="e.g. Good" />
        </div>
      </div>

      <div className="form-group">
        <label>Overall</label>
        <input type="text" name="overall" defaultValue={log?.overall ?? ''} placeholder="e.g. Pass" />
      </div>

      <div className="form-group">
        <label>Notes</label>
        <textarea name="notes" defaultValue={log?.notes ?? ''} rows={5} placeholder="Additional notes for this trainee…" />
      </div>

      <div className="modal-footer">
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn-primary">
          {mode === 'add' ? 'Create Feedback' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}