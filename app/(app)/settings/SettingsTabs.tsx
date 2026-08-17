'use client';
// FILE: app/(app)/settings/SettingsTabs.tsx

import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faIdCard, faBell } from '@fortawesome/free-solid-svg-icons';

type Tab = 'profile' | 'notifications';

export default function SettingsTabs({
  profilePanel,
  notifPanel,
}: {
  profilePanel: React.ReactNode;
  notifPanel: React.ReactNode;
}) {
  const [tab, setTab] = useState<Tab>('profile');

  return (
    <>
      <div className="tab-bar">
        <button type="button" className={`tab-btn${tab === 'profile' ? ' active' : ''}`} onClick={() => setTab('profile')}>
          <FontAwesomeIcon icon={faIdCard} /> Profile
        </button>
        <button type="button" className={`tab-btn${tab === 'notifications' ? ' active' : ''}`} onClick={() => setTab('notifications')}>
          <FontAwesomeIcon icon={faBell} /> Notifications
        </button>
      </div>

      <div className={`settings-panel${tab !== 'profile' ? ' hidden' : ''}`}>{profilePanel}</div>
      <div className={`settings-panel${tab !== 'notifications' ? ' hidden' : ''}`}>{notifPanel}</div>
    </>
  );
}