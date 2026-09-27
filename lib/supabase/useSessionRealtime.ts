// lib/supabase/useSessionRealtime.ts
// Replaces the setInterval(pullState, 5000) poll in sessionongoing.js with a
// postgres_changes subscription on the session's own row. Falls back to a slow
// poll only if the realtime socket drops, so nothing goes silently stale.
'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import type { SessionOngoingRow } from '@/types/session';
import { SESSION_ONGOING_COLUMNS } from '@/lib/supabase/columns';

type Handler = (row: SessionOngoingRow) => void;

export function useSessionRealtime(sessionId: number, onChange: Handler) {
  const handlerRef = useRef(onChange);
  handlerRef.current = onChange;

  useEffect(() => {
    const supabase = createClient();
    let fallbackTimer: ReturnType<typeof setInterval> | null = null;

    const channel = supabase
      .channel(`session_ongoing:${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'session_ongoing', filter: `session_id=eq.${sessionId}` },
        (payload) => handlerRef.current(payload.new as SessionOngoingRow)
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'session_ongoing', filter: `session_id=eq.${sessionId}` },
        () => {
          // Session was concluded by the host — same redirect sessionongoing.js did on a 404 pull.
          window.location.href = '/dashboard';
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          // Realtime hiccup — degrade to a 5s poll (same cadence as the old PHP version)
          // until the channel recovers, instead of going silent.
          if (!fallbackTimer) {
            fallbackTimer = setInterval(async () => {
              const { data } = await supabase
                .from('session_ongoing')
                .select(SESSION_ONGOING_COLUMNS)
                .eq('session_id', sessionId)
                .single();
              if (data) handlerRef.current(data as SessionOngoingRow);
            }, 5000);
          }
        } else if (status === 'SUBSCRIBED' && fallbackTimer) {
          clearInterval(fallbackTimer);
          fallbackTimer = null;
        }
      });

    return () => {
      if (fallbackTimer) clearInterval(fallbackTimer);
      supabase.removeChannel(channel);
    };
  }, [sessionId]);
}
