'use client';

import { useEffect, useState } from 'react';
import ToastStack, { type ToastEntry } from './ToastStack';

type ConnectionNotice = 'offline' | 'reconnected' | null;

export default function ConnectionStatusPill() {
  const [notice, setNotice] = useState<ConnectionNotice>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let wasOffline = !navigator.onLine;
    let disposed = false;
    let clearNoticeTimer: ReturnType<typeof setTimeout> | undefined;

    function handleOffline() {
      wasOffline = true;
      if (clearNoticeTimer) clearTimeout(clearNoticeTimer);
      setDismissed(false);
      setNotice('offline');
    }

    function handleOnline() {
      if (!wasOffline) return;
      wasOffline = false;
      setDismissed(false);
      setNotice('reconnected');
      if (clearNoticeTimer) clearTimeout(clearNoticeTimer);
      clearNoticeTimer = setTimeout(() => setNotice(null), 5000);
    }

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    queueMicrotask(() => {
      if (!disposed && !navigator.onLine) handleOffline();
    });
    return () => {
      disposed = true;
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      if (clearNoticeTimer) clearTimeout(clearNoticeTimer);
    };
  }, []);

  const toasts: ToastEntry[] = notice && !dismissed ? [{
    id: notice === 'offline' ? 1 : 2,
    kind: notice === 'offline' ? 'error' : 'success',
    actorName: 'Connection',
    message: notice === 'offline' ? 'Your device is offline. Changes may not save until you reconnect.' : 'Your device is back online.',
  }] : [];

  return <div data-connection-toast><ToastStack connection toasts={toasts} onDismiss={() => setDismissed(true)} /></div>;
}
