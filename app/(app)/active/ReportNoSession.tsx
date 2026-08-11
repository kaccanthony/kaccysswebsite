'use client';
// FILE: app/(app)/active/ReportNoSession.tsx
// page.tsx is a server component and can't call context directly — this tiny
// client component reports "no active session" up on mount when needed.

import { useEffect } from 'react';
import { useLiveSession } from '../LiveSessionContext';

export default function ReportNoSession() {
  const { reportInactive } = useLiveSession();

  useEffect(() => {
    reportInactive();
  }, []);

  return null;
}