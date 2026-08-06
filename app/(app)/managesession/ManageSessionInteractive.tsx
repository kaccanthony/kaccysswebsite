// FILE: app/(app)/managesession/ManageSessionInteractive.tsx
'use client';

import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPen, faTrash, faTimes, faCrown, faPlus, faEnvelopeOpenText,
} from '@fortawesome/free-solid-svg-icons';
import { saveSession, deleteSession } from './actions';

export interface StaffOption {
  name: string;
  staff_rank: string;
  op_dept: boolean;
  host_auth: boolean;
  cohost_auth: boolean;
  asst_auth: boolean;
  comm_dept: boolean;
  eventh_auth: boolean;
  eventch_auth: boolean;
  ih_auth: boolean;
}

export interface SessionRow {
  session_id: number;
  session_name: string | null;
  session_desc: string | null;
  session_status: string;
  session_booked: boolean;
  session_duration: string | null;
  num_slots: number;
  session_date: string;
  session_time: string;
  trainee_timer: number;
  host: string;
  co_host1: string | null;
  co_host2: string | null;
  co_host3: string | null;
  co_host4_supervisor: string | null;
  assistant_1: string | null;
  assistant_2: string | null;
  assistant_3: string | null;
  assistant_4: string | null;
  additional_staff: string | null;
  [key: string]: unknown; // trainee_N_* fields
}

function groupByRank(list: StaffOption[]): Record<string, StaffOption[]> {
  const grouped: Record<string, StaffOption[]> = {};
  for (const s of list) (grouped[s.staff_rank] ??= []).push(s);
  return grouped;
}

function StaffSelect({
  name, staff, authKey, defaultValue,
}: {
  name: string;
  staff: StaffOption[];
  authKey: 'host_auth' | 'cohost_auth' | 'asst_auth';
  defaultValue?: string | null;
}) {
  const eligible = staff.filter((s) => s[authKey]);
  const grouped = groupByRank(eligible);

  return (
    <select className="staff-select" name={name} defaultValue={defaultValue ?? ''}>
      <option value="">— None —</option>
      {Object.entries(grouped).map(([rank, list]) => (
        <optgroup key={rank} label={rank}>
          {list.map((s) => (
            <option key={s.name} value={s.name}>{s.name}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function statusBadgeClass(status: string) {
  const map: Record<string, string> = {
    Requested: 'badge-request',
    Scheduled: 'badge-scheduled',
    Booked: 'badge-booked',
    Cancelled: 'badge-cancelled',
    Postponed: 'badge-postponed',
  };
  return map[status] ?? 'badge-scheduled';
}

export default function ManageSessionInteractive({
  sessions,
  staff,
  rawRole,
  permLevel,
}: {
  sessions: SessionRow[];
  staff: StaffOption[];
  rawRole: string;
  permLevel: number;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SessionRow | null>(null);
  const [numSlots, setNumSlots] = useState(4);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);

  const isRequestMode = rawRole === 'Head Staff' && permLevel < 20;

  function openAdd() {
    setEditing(null);
    setNumSlots(4);
    setModalOpen(true);
  }

  function openEdit(s: SessionRow) {
    setEditing(s);
    setNumSlots(s.num_slots);
    setModalOpen(true);
  }

  const slotArray = Array.from({ length: numSlots }, (_, i) => i + 1);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="section-label">Manage Sessions</div>
          <p className="section-sub">{sessions.length} session{sessions.length !== 1 ? 's' : ''} total</p>
        </div>
        {permLevel >= 10 && (
          <button className="btn-primary" onClick={openAdd}>
            <FontAwesomeIcon icon={isRequestMode ? faEnvelopeOpenText : faPlus} />
            {isRequestMode ? ' Request Session' : ' Add Session'}
          </button>
        )}
      </div>

      <div className="table-wrap">
        {sessions.length === 0 ? (
          <div className="empty-state"><p>No sessions found.</p></div>
        ) : (
          <table className="session-table">
            <thead>
              <tr>
                <th>ID</th><th>Session</th><th>Status</th><th>Host</th>
                <th>Date &amp; Time</th><th>Slots</th><th>Duration</th>
                {permLevel >= 10 && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => {
                const filled = Array.from({ length: 10 }, (_, i) => s[`trainee_${i + 1}_name`]).filter(Boolean).length;
                return (
                  <tr key={s.session_id}>
                    <td className="td-id">#{s.session_id}</td>
                    <td className="td-name">
                      <span className="session-name">{s.session_name || '—'}</span>
                      {s.session_desc && <span className="session-desc">{s.session_desc.slice(0, 55)}</span>}
                    </td>
                    <td><span className={`badge ${statusBadgeClass(s.session_status)}`}>{s.session_status}</span></td>
                    <td className="td-host"><FontAwesomeIcon icon={faCrown} className="td-host-icon" /> {s.host}</td>
                    <td className="td-date">
                      <span className="date-main">
                        {new Date(`${s.session_date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                      <span className="date-time">
                        {new Date(`${s.session_date}T${s.session_time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </td>
                    <td><span className={`slots-pill ${filled >= s.num_slots ? 'slots-full' : ''}`}>{filled}/{s.num_slots}</span></td>
                    <td className="td-dur">{s.session_duration} min</td>
                    {permLevel >= 10 && (
                      <td className="td-actions">
                        <button className="action-btn" title="Edit" onClick={() => openEdit(s)}>
                          <FontAwesomeIcon icon={faPen} />
                        </button>
                        {permLevel >= 15 && (
                          <button
                            className="action-btn danger"
                            title="Delete"
                            onClick={() => setDeleteTarget({ id: s.session_id, name: s.session_name || 'this session' })}
                          >
                            <FontAwesomeIcon icon={faTrash} />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ══ ADD / EDIT MODAL ══ */}
      {modalOpen && (
        <div className="modal-backdrop" onClick={() => setModalOpen(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{editing ? 'Edit Session' : isRequestMode ? 'Request Session' : 'Add Session'}</h2>
              <button className="modal-close-btn" onClick={() => setModalOpen(false)}><FontAwesomeIcon icon={faTimes} /></button>
            </div>

            <form action={saveSession} className="modal-form">
              <input type="hidden" name="action" value={editing ? 'edit' : 'add'} />
              {editing && <input type="hidden" name="session_id" value={editing.session_id} />}

              {!editing && (
                <div className="form-group">
                  <label>Custom Session ID <span className="label-hint">(optional — leave blank to auto-assign)</span></label>
                  <input type="number" name="custom_session_id" min={1} placeholder="Auto-assign" />
                </div>
              )}

              <div className="form-row">
                <div className="form-group flex2">
                  <label>Session Name*</label>
                  <input type="text" name="session_name" required defaultValue={editing?.session_name ?? ''} placeholder="e.g. Training Session #67" />
                </div>
                <div className="form-group">
                  <label>Status*</label>
                  <select name="session_status" defaultValue={editing?.session_status ?? 'Requested'}>
                    <option value="Requested">Requested</option>
                    <option value="Booked">Booked</option>
                    <option value="Scheduled">Scheduled</option>
                    <option value="Cancelled">Cancelled</option>
                    <option value="Postponed">Postponed</option>
                  </select>
                </div>
                <div className="form-group form-check-group">
                  <label>Booked?</label>
                  <label className="toggle-wrap">
                    <input type="checkbox" name="session_booked" defaultChecked={editing?.session_booked ?? false} />
                    <span className="toggle-track"><span className="toggle-thumb" /></span>
                  </label>
                </div>
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea name="session_desc" rows={2} defaultValue={editing?.session_desc ?? ''} placeholder="Short session description…" />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Date*</label>
                  <input type="date" name="session_date" required defaultValue={editing?.session_date ?? ''} />
                </div>
                <div className="form-group">
                  <label>TIME* (BST)</label>
                  <input type="text" name="session_time" maxLength={5} placeholder="HH:MM" required defaultValue={editing?.session_time?.slice(0, 5) ?? ''} />
                </div>
                <div className="form-group">
                  <label>EXP. DUR* (min)</label>
                  <input type="number" name="session_duration" min={60} max={180} step={5} placeholder="60" defaultValue={editing?.session_duration ?? ''} />
                </div>
                <div className="form-group">
                  <label>SLOTS*</label>
                  <input
                    type="number" name="num_slots" min={4} max={10} placeholder="4"
                    value={numSlots}
                    onChange={(e) => setNumSlots(Math.max(4, Math.min(10, parseInt(e.target.value, 10) || 4)))}
                  />
                </div>
                <div className="form-group">
                  <label>TR. Timer* (min)</label>
                  <input type="number" name="trainee_timer" min={8} max={20} placeholder="15" defaultValue={editing?.trainee_timer ?? ''} />
                </div>
              </div>

              <div className="form-divider"><span>Staff Assignment</span></div>

              <div className="form-row">
                <div className="form-group flex2">
                  <label><FontAwesomeIcon icon={faCrown} style={{ color: 'rgba(255,210,80,.7)', fontSize: '.7rem', marginRight: 4 }} /> Host*</label>
                  <StaffSelect name="host" staff={staff} authKey="host_auth" defaultValue={editing?.host} />
                </div>
              </div>

              <div className="form-row">
                {(['co_host1', 'co_host2', 'co_host3', 'co_host4_supervisor'] as const).map((f, i) => (
                  <div className="form-group" key={f}>
                    <label>{i < 3 ? `Co-Host ${i + 1}` : 'Co-Host 4 / SV'}</label>
                    <StaffSelect name={f} staff={staff} authKey="cohost_auth" defaultValue={editing?.[f] as string} />
                  </div>
                ))}
              </div>

              <div className="form-row">
                {(['assistant_1', 'assistant_2', 'assistant_3', 'assistant_4'] as const).map((f, i) => (
                  <div className="form-group" key={f}>
                    <label>Assistant {i + 1}</label>
                    <StaffSelect name={f} staff={staff} authKey="asst_auth" defaultValue={editing?.[f] as string} />
                  </div>
                ))}
              </div>

              <div className="form-group">
                <label>Additional Staff <span className="label-hint">(include role after name)</span></label>
                <input type="text" name="additional_staff" defaultValue={editing?.additional_staff ?? ''} placeholder="e.g. Yoshi5336 [Observer]" />
              </div>

              <div className="form-divider"><span>Trainee Assignment</span></div>

              {slotArray.map((n) => (
                <div className="trainee-slot" key={n}>
                  <div className="trainee-slot-label">Trainee {n}</div>
                  <div className="form-row">
                    <div className="form-group flex2">
                      <label>Name</label>
                      <input type="text" name={`trainee_${n}_name`} defaultValue={(editing?.[`trainee_${n}_name`] as string) ?? ''} />
                    </div>
                    <div className="form-group flex2">
                      <label>Discord</label>
                      <input type="text" name={`trainee_${n}_discord`} defaultValue={(editing?.[`trainee_${n}_discord`] as string) ?? ''} />
                    </div>
                    <div className="form-group">
                      <label>Discord ID</label>
                      <input type="text" name={`trainee_${n}_discord_id`} defaultValue={(editing?.[`trainee_${n}_discord_id`] as string) ?? ''} />
                    </div>
                    <div className="form-group">
                      <label>Zone</label>
                      <input type="number" name={`trainee_${n}_zone`} defaultValue={(editing?.[`trainee_${n}_zone`] as number) ?? ''} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Note</label>
                    <input type="text" name={`trainee_${n}_note`} defaultValue={(editing?.[`trainee_${n}_note`] as string) ?? ''} />
                  </div>
                </div>
              ))}

              <div className="modal-footer">
                <button type="button" className="btn-ghost" onClick={() => setModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary">{editing ? 'Save Changes' : isRequestMode ? 'Submit Request' : 'Add Session'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══ DELETE CONFIRM MODAL ══ */}
      {deleteTarget && (
        <div className="modal-backdrop" onClick={() => setDeleteTarget(null)}>
          <div className="modal-box modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Delete Session</h2>
              <button className="modal-close-btn" onClick={() => setDeleteTarget(null)}><FontAwesomeIcon icon={faTimes} /></button>
            </div>
            <p className="delete-msg">Are you sure you want to delete &quot;{deleteTarget.name}&quot;?</p>
            <form action={deleteSession}>
              <input type="hidden" name="session_id" value={deleteTarget.id} />
              <div className="modal-footer">
                <button type="button" className="btn-ghost" onClick={() => setDeleteTarget(null)}>Cancel</button>
                <button type="submit" className="btn-danger">Delete</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}