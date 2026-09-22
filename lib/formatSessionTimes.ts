// FILE: lib/formatSessionTimes.ts
import { formatInstantInSiteTimezone, type SiteTimezoneMode } from '@/lib/siteTimezone';

export interface RelativeTime {
  text: string;
  soon: boolean;
}

export interface SessionTimes {
  bst: string;
  local: string;
  relative: RelativeTime;
}

export function formatRelative(d: Date): RelativeTime {
  const diffMs = d.getTime() - Date.now();
  if (diffMs <= 60000) return { text: 'Starting now', soon: true };

  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return { text: `in ${mins} minute${mins === 1 ? '' : 's'}`, soon: mins <= 15 };

  const hours = Math.round(mins / 60);
  if (hours < 24) return { text: `in ${hours} hour${hours === 1 ? '' : 's'}`, soon: hours <= 1 };

  const days = Math.round(hours / 24);
  return { text: `in ${days} day${days === 1 ? '' : 's'}`, soon: false };
}

export function formatSessionTimes(iso: string | null, timezoneMode: SiteTimezoneMode): SessionTimes {
  if (!iso) return { bst: '—', local: '', relative: { text: '', soon: false } };

  const d = new Date(iso);
  const bst =
    formatInstantInSiteTimezone(d, timezoneMode, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }) +
    ' ' +
    timezoneMode;
  const local = d.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  return { bst, local, relative: formatRelative(d) };
}
