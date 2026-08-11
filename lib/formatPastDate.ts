// FILE: lib/formatPastDate.ts

export interface PastDateInfo {
  display: string;
  relative: string;
}

export function formatAgo(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return 'Recently';
  const days = Math.floor(diffMs / 86400000);
  if (days < 1) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

export function formatSessionDate(dateStr: string | null): PastDateInfo {
  if (!dateStr) return { display: '—', relative: '' };
  const d = new Date(dateStr + 'T00:00:00');
  const display = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  return { display, relative: formatAgo(d) };
}

export function statusPillClass(status: string | null): string {
  const s = (status || '').toLowerCase();
  if (s === 'concluded') return 'st-concluded';
  if (s === 'cancelled') return 'st-cancelled';
  return 'st-other';
}