'use client';

import { useEffect, useState } from 'react';
import type { OngoingActivity } from '@/lib/ongoingActivity';
import { createClient } from '@/utils/supabase/client';

export default function OngoingActivityPill({ initialActivity, publicView = false }: {
  initialActivity: OngoingActivity;
  publicView?: boolean;
}) {
  const [activity, setActivity] = useState(initialActivity);

  useEffect(() => {
    let disposed = false;
    let inFlight = false;
    let refreshAgain = false;
    async function refresh() {
      if (disposed) return;
      if (inFlight) { refreshAgain = true; return; }
      inFlight = true;
      do {
        refreshAgain = false;
        try {
          const response = await fetch('/api/ongoing-activity', { cache: 'no-store' });
          if (response.ok) {
            const next = await response.json() as OngoingActivity;
            if (!disposed) setActivity(next);
          }
        } catch { /* Keep the last known status until another change. */ }
      } while (refreshAgain && !disposed);
      inFlight = false;
    }

    const supabase = createClient();
    const channels = [supabase.channel('public-active-state', { config: { private: false } })
      .on('broadcast', { event: 'activity-changed' }, refresh)
      .subscribe((status) => { if (status === 'SUBSCRIBED') void refresh(); })];
    if (!publicView) {
      channels.push(supabase.channel('ongoing-activity-sessions')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'session_ongoing' }, refresh)
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'session_ongoing' }, refresh)
        .subscribe());
      channels.push(supabase.channel('ongoing-activity-events')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'event_runs' }, refresh)
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'event_runs' }, refresh)
        .subscribe());
    }
    window.addEventListener('ongoing-activity-changed', refresh);
    window.addEventListener('online', refresh);
    return () => {
      disposed = true;
      window.removeEventListener('ongoing-activity-changed', refresh);
      window.removeEventListener('online', refresh);
      channels.forEach((channel) => { void supabase.removeChannel(channel); });
    };
  }, [publicView]);

  const count = activity.sessions.length + activity.events.length;
  const label = count === 0 ? 'No Ongoing Activity'
    : activity.sessions.length && activity.events.length ? `${activity.sessions.length} Session${activity.sessions.length === 1 ? '' : 's'} · ${activity.events.length} Event${activity.events.length === 1 ? '' : 's'}`
      : activity.sessions.length ? `${activity.sessions.length} Session${activity.sessions.length === 1 ? '' : 's'} Ongoing`
        : `${activity.events.length} Event${activity.events.length === 1 ? '' : 's'} Ongoing`;

  if (!count) return <span className="live-pill live-pill-off"><span className="live-dot off" /> {label}</span>;

  return (
    <div className="activity-pill-wrap">
      <button type="button" className="live-pill activity-pill" aria-label={`${label}. Hover or focus for details.`}>
        <span className="live-dot" /> {label}
      </button>
      <div className="activity-pill-details" role="status">
        {activity.sessions.map((session) => <div key={`session-${session.id}`}>Session #{session.id}: {session.name}</div>)}
        {activity.events.map((event) => <div key={`event-${event.id}`}>Event: {event.name}</div>)}
      </div>
    </div>
  );
}
