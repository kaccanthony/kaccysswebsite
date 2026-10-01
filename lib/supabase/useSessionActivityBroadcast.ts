'use client';

import { useCallback, useEffect, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';

export interface SessionActivity {
  id: string;
  clientId: string;
  actorName: string;
}

export function useSessionActivityBroadcast(
  sessionId: number,
  onActivity: (activity: SessionActivity) => void,
) {
  const handlerRef = useRef(onActivity);
  handlerRef.current = onActivity;
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null);
  const readyRef = useRef(false);
  const pendingRef = useRef<SessionActivity | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`session-activity:${sessionId}`)
      .on('broadcast', { event: 'change' }, ({ payload }) => {
        const activity = payload as SessionActivity;
        if (typeof activity?.id === 'string' && typeof activity.clientId === 'string' && typeof activity.actorName === 'string') {
          handlerRef.current(activity);
        }
      })
      .subscribe((status) => {
        readyRef.current = status === 'SUBSCRIBED';
        const pending = pendingRef.current;
        if (readyRef.current && pending) {
          pendingRef.current = null;
          void channel.send({ type: 'broadcast', event: 'change', payload: pending });
        }
      });

    channelRef.current = channel;
    return () => {
      readyRef.current = false;
      pendingRef.current = null;
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const send = useCallback((activity: SessionActivity) => {
    const channel = channelRef.current;
    if (!channel || !readyRef.current) {
      pendingRef.current = activity;
      return;
    }
    void channel.send({ type: 'broadcast', event: 'change', payload: activity });
  }, []);

  return { send };
}
