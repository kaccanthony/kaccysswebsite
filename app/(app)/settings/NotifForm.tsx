'use client';
// FILE: app/(app)/settings/NotificationPreferencesForm.tsx
// Replaces NotifForm.tsx's StaffNotifForm + UserNotifForm — same two sections,
// combined into one form/component instead of two separate tab panels, since
// this always submits both key sets together in one save.

import { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faShieldHalved, faBell, faCalendarCheck, faHourglassEnd, faBullhorn, faCalendarPlus, faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { saveNotifications } from './actions';
import { STAFF_TRAINEE_WARNING_OPTIONS } from '@/lib/settings';

export interface StaffPrefs {
  staff_session_reminder: string;
  staff_reminder_time: string;
  staff_trainee_sound: string;
  staff_trainee_warning: string;
  staff_trainee_warning_time: string;
  staff_announcement_enabled: string;
  staff_announcement_display: string;
}

export interface UserPrefs {
  user_session_reminder: string;
  user_reminder_time: string;
  user_trainee_sound: string;
  user_new_session: string;
  user_cancellation: string;
  user_browser_notifs: string;
}

function Toggle({
  name, defaultChecked, onChange,
}: {
  name: string;
  defaultChecked: boolean;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <label className="toggle-wrap">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} onChange={(e) => onChange?.(e.target.checked)} />
      <span className="toggle-track"><span className="toggle-thumb" /></span>
    </label>
  );
}

function requestBrowserPermission(checked: boolean, input: HTMLInputElement) {
  if (!checked) return;
  if (!('Notification' in window)) {
    alert('Your browser does not support notifications.');
    input.checked = false;
    return;
  }
  Notification.requestPermission().then((p) => {
    if (p !== 'granted') input.checked = false;
  });
}

function WarningTimesSelect({ value, disabled }: { value: string; disabled: boolean }) {
  const [selected, setSelected] = useState(() => value.split(',').filter(Boolean));
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const filteredOptions = STAFF_TRAINEE_WARNING_OPTIONS.filter((option) => option.label.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="warning-time-select" ref={rootRef}>
      <button type="button" className="warning-time-trigger" aria-haspopup="listbox" aria-expanded={open} disabled={disabled} onClick={() => setOpen((current) => !current)}>
        <span>{selected.length ? `${selected.length} selected` : 'Select warning times'}</span><span aria-hidden="true">▾</span>
      </button>
      {open && <div className="warning-time-menu">
        <input type="search" className="warning-time-search" placeholder="Search times…" aria-label="Search warning times" value={search} onChange={(event) => setSearch(event.target.value)} autoFocus />
        <div role="listbox" aria-label="Warning times" aria-multiselectable="true">
          {filteredOptions.map((option) => {
            const checked = selected.includes(option.value);
            return <button type="button" role="option" aria-selected={checked} key={option.value} className="warning-time-option" onClick={() => setSelected((current) => checked ? current.filter((item) => item !== option.value) : [...current, option.value])}>
              <span className={`warning-time-check${checked ? ' selected' : ''}`} aria-hidden="true">{checked ? '✓' : ''}</span><span>{option.label}</span>
            </button>;
          })}
          {filteredOptions.length === 0 && <div className="warning-time-empty">No matching times</div>}
        </div>
      </div>}
      {selected.map((time) => <input key={time} type="hidden" name="staff_trainee_warning_time" value={time} disabled={disabled} />)}
    </div>
  );
}

export default function NotificationPreferencesForm({
  staffPrefs, userPrefs, showStaffSettings,
}: {
  staffPrefs: StaffPrefs;
  userPrefs: UserPrefs;
  showStaffSettings: boolean;
}) {
  const [staffReminderOn, setStaffReminderOn] = useState(staffPrefs.staff_session_reminder === '1');
  const [staffWarningOn, setStaffWarningOn] = useState(staffPrefs.staff_trainee_warning === '1');
  const [staffAnnounceOn, setStaffAnnounceOn] = useState(staffPrefs.staff_announcement_enabled === '1');
  const [userReminderOn, setUserReminderOn] = useState(userPrefs.user_session_reminder === '1');

  // No `scope` hidden field on purpose — omitting it makes saveNotifications
  // fall through to its "no scope = both key sets" branch, since this form
  // always submits staff_* and user_* fields together in one save.
  return (
    <form action={saveNotifications}>
      {showStaffSettings && (
        <div className="settings-section">
          <div className="settings-section-title">
            <FontAwesomeIcon icon={faShieldHalved} /> Staff Notifications
          </div>
          <p className="settings-section-desc">Active only while you're in a live session as host, co-host, or assistant.</p>

          <div className="notif-card">
            <div className="notif-card-left">
              <div className="notif-icon-wrap green"><FontAwesomeIcon icon={faCalendarCheck} /></div>
              <div className="notif-info">
                <div className="notif-title">Upcoming Session Reminder</div>
                <div className="notif-desc">Get alerted before your assigned session starts.</div>
              </div>
            </div>
            <div className="notif-card-right">
              <div className="inline-control">
                <span className="inline-label">Remind me</span>
                <select name="staff_reminder_time" className={`inline-select${staffReminderOn ? '' : ' disabled'}`} defaultValue={staffPrefs.staff_reminder_time}>
                  {['5', '10', '15', '30', '60'].map((m) => <option key={m} value={m}>{m} min before</option>)}
                </select>
              </div>
              <Toggle name="staff_session_reminder" defaultChecked={staffReminderOn} onChange={setStaffReminderOn} />
            </div>
          </div>

          <div className="notif-card">
            <div className="notif-card-left">
              <div className="notif-icon-wrap blue">
                <img src="/icons/Nextrainee.png" alt="Next Trainee" style={{ width: 22, height: 22, objectFit: 'contain' }} />
              </div>
              <div className="notif-info">
                <div className="notif-title">Next Trainee Sound Alert</div>
                <div className="notif-desc">Play a sound cue when it's time to move to the next trainee.</div>
              </div>
            </div>
            <div className="notif-card-right">
              <Toggle name="staff_trainee_sound" defaultChecked={staffPrefs.staff_trainee_sound === '1'} />
            </div>
          </div>

          <div className="notif-card warning-notif-card">
            <div className="notif-card-left">
              <div className="notif-icon-wrap amber"><FontAwesomeIcon icon={faHourglassEnd} /></div>
              <div className="notif-info">
                <div className="notif-title">Trainee Turn Ending Warning</div>
                <div className="notif-desc">Choose when to be warned before the current trainee&apos;s time ends.</div>
              </div>
            </div>
            <div className="notif-card-right">
              <WarningTimesSelect value={staffPrefs.staff_trainee_warning_time} disabled={!staffWarningOn} />
              <Toggle name="staff_trainee_warning" defaultChecked={staffWarningOn} onChange={setStaffWarningOn} />
            </div>
          </div>

          <div className="notif-card">
            <div className="notif-card-left">
              <div className="notif-icon-wrap purple"><FontAwesomeIcon icon={faBullhorn} /></div>
              <div className="notif-info">
                <div className="notif-title">Global Staff Announcement</div>
                <div className="notif-desc">Display host announcements pushed during a live session.</div>
              </div>
            </div>
            <div className="notif-card-right">
              <div className="inline-control">
                <span className="inline-label">Display as</span>
                <select name="staff_announcement_display" className={`inline-select${staffAnnounceOn ? '' : ' disabled'}`} defaultValue={staffPrefs.staff_announcement_display}>
                  <option value="fullscreen">Full Screen</option>
                  <option value="banner">Banner</option>
                  <option value="toast">Toast</option>
                </select>
              </div>
              <Toggle name="staff_announcement_enabled" defaultChecked={staffAnnounceOn} onChange={setStaffAnnounceOn} />
            </div>
          </div>
        </div>
      )}

      <div className="settings-section">
        <div className="settings-section-title">
          <FontAwesomeIcon icon={faBell} /> General Notifications
        </div>
        <p className="settings-section-desc">These apply to your account at all times.</p>

        <div className="notif-card">
          <div className="notif-card-left">
            <div className="notif-icon-wrap green"><FontAwesomeIcon icon={faCalendarCheck} /></div>
            <div className="notif-info">
              <div className="notif-title">Upcoming Session Reminder</div>
              <div className="notif-desc">Get reminded before a session you're assigned to begins.</div>
            </div>
          </div>
          <div className="notif-card-right">
            <div className="inline-control">
              <span className="inline-label">Remind me</span>
              <select name="user_reminder_time" className={`inline-select${userReminderOn ? '' : ' disabled'}`} defaultValue={userPrefs.user_reminder_time}>
                {['5', '10', '15', '30', '60'].map((m) => <option key={m} value={m}>{m} min before</option>)}
              </select>
            </div>
            <Toggle name="user_session_reminder" defaultChecked={userReminderOn} onChange={setUserReminderOn} />
          </div>
        </div>

        <div className="notif-card">
          <div className="notif-card-left">
            <div className="notif-icon-wrap blue">
              <img src="/icons/Nextrainee.png" alt="Next Trainee" style={{ width: 22, height: 22, objectFit: 'contain' }} />
            </div>
            <div className="notif-info">
              <div className="notif-title">Next Trainee Sound Alert</div>
              <div className="notif-desc">Play a sound when it's your turn as the next trainee.</div>
            </div>
          </div>
          <div className="notif-card-right">
            <Toggle name="user_trainee_sound" defaultChecked={userPrefs.user_trainee_sound === '1'} />
          </div>
        </div>

        <div className="notif-card">
          <div className="notif-card-left">
            <div className="notif-icon-wrap purple"><FontAwesomeIcon icon={faCalendarPlus} /></div>
            <div className="notif-info">
              <div className="notif-title">New Session Notifications</div>
              <div className="notif-desc">Be notified when a new session is booked and open.</div>
            </div>
          </div>
          <div className="notif-card-right">
            <Toggle name="user_new_session" defaultChecked={userPrefs.user_new_session === '1'} />
          </div>
        </div>

        <div className="notif-card">
          <div className="notif-card-left">
            <div className="notif-icon-wrap red"><FontAwesomeIcon icon={faXmark} /></div>
            <div className="notif-info">
              <div className="notif-title">Session Cancellation Alerts</div>
              <div className="notif-desc">Get notified if a session you're part of is cancelled.</div>
            </div>
          </div>
          <div className="notif-card-right">
            <Toggle name="user_cancellation" defaultChecked={userPrefs.user_cancellation === '1'} />
          </div>
        </div>

        <div className="notif-card">
          <div className="notif-card-left">
            <div className="notif-icon-wrap amber"><FontAwesomeIcon icon={faBell} /></div>
            <div className="notif-info">
              <div className="notif-title">Browser Notifications</div>
              <div className="notif-desc">Allow YSS to send native browser push notifications.</div>
            </div>
          </div>
          <div className="notif-card-right">
            <label className="toggle-wrap">
              <input
                type="checkbox"
                name="user_browser_notifs"
                defaultChecked={userPrefs.user_browser_notifs === '1'}
                onChange={(e) => requestBrowserPermission(e.target.checked, e.target)}
              />
              <span className="toggle-track"><span className="toggle-thumb" /></span>
            </label>
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn-save">
            <FontAwesomeIcon icon={faBell} /> Save
          </button>
        </div>
      </div>
    </form>
  );
}
