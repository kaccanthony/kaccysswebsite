// FILE: lib/formatSyncNote.ts

/** "last change just now" / "...12s ago" / "...4m ago" / "...2h ago" */
export function formatSyncNote(msSinceChange: number): string {
  const seconds = Math.max(0, Math.floor(msSinceChange / 1000));

  if (seconds < 3) return 'last change just now';
  if (seconds < 60) return `last change ${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `last change ${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  return `last change ${hours}h ago`;
}