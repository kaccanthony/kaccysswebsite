// lib/supabase/useBellRealtime.ts
// Replaces the setInterval(pollBell, 3000) loop against bell_state.php.
'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import type { BellStateRow } from '@/types/session';
import { SESSION_BELL_COLUMNS } from '@/lib/supabase/columns';

export function useBellRealtime(sessionId: number, onChange: (row: BellStateRow) => void) {
  const handlerRef = useRef(onChange);
  handlerRef.current = onChange;

  useEffect(() => {
    const supabase = createClient();

    // Prime with the current row on mount (channel only pushes future changes).
    supabase
      .from('session_bell_state')
      .select(SESSION_BELL_COLUMNS)
      .eq('session_id', sessionId)
      .maybeSingle()
      .then(({ data }) => { if (data) handlerRef.current(data as BellStateRow); });

    const channel = supabase
      .channel(`bell_state:${sessionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'session_bell_state', filter: `session_id=eq.${sessionId}` },
        (payload) => handlerRef.current(payload.new as BellStateRow)
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [sessionId]);
}
