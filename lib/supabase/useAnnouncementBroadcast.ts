// lib/supabase/useAnnouncementBroadcast.ts
// Announcements were piggybacked on live_state before (id-diffed on every poll).
// They're inherently ephemeral/fire-and-forget, so Realtime Broadcast (no DB row,
// no persistence, lowest latency) is a better fit than writing them into live_state.
'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import type { AnnouncementPayload } from '@/types/session';

export function useAnnouncementBroadcast(sessionId: number, onAnnounce: (a: AnnouncementPayload) => void) {
  const handlerRef = useRef(onAnnounce);
  handlerRef.current = onAnnounce;
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`announcements:${sessionId}`)
      .on('broadcast', { event: 'announce' }, ({ payload }) => handlerRef.current(payload as AnnouncementPayload))
      .subscribe();
    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [sessionId]);

  return {
    send: (a: AnnouncementPayload) => channelRef.current?.send({ type: 'broadcast', event: 'announce', payload: a }),
  };
}
