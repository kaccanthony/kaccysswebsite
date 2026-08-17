'use client';
// FILE: app/settings/SaveToast.tsx
// Ported from the save-toast auto-hide block in settings.js.

import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleCheck } from '@fortawesome/free-solid-svg-icons';

export default function SaveToast({ saved }: { saved: 'profile' | 'notifs' | null }) {
  const [visible, setVisible] = useState(Boolean(saved));

  useEffect(() => {
    if (!saved) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(timer);
  }, [saved]);

  if (!saved || !visible) return null;

  return (
    <div className="save-toast">
      <FontAwesomeIcon icon={faCircleCheck} /> {saved === 'profile' ? 'Profile saved' : 'Notifications saved'}
    </div>
  );
}