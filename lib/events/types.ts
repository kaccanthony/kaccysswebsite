export const EVENT_TYPES = [
  'Competitive Event',
  'Speedrun Event',
  'Creative Collab Event - Dynamic',
  'Creative Collab Event - Static',
  'Chill Event',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export function isEventType(value: string): value is EventType {
  return EVENT_TYPES.some(type => type === value);
}

export function suggestedEventType(name: string): EventType {
  const lower = name.toLowerCase();
  if (lower.includes('speedrun')) return 'Speedrun Event';
  if (lower.includes('dynamic')) return 'Creative Collab Event - Dynamic';
  if (lower.includes('static')) return 'Creative Collab Event - Static';
  if (lower.includes('chill')) return 'Chill Event';
  return 'Competitive Event';
}

export function eventLayoutHint(type: EventType): string {
  switch (type) {
    case 'Competitive Event':
    case 'Speedrun Event':
    case 'Creative Collab Event - Dynamic':
      return 'Ten round positions, total position score, shared final ranks, and a timed multiplier.';
    case 'Creative Collab Event - Static':
      return 'Final leaderboard ranks and rank points. No timer or multiplier.';
    case 'Chill Event':
      return 'Attendance and participation points, with a runtime bonus.';
  }
}
