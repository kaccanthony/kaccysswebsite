export function formatFeedbackSetupTime(seconds: number | null): string {
  if (seconds == null) return '';
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function parseFeedbackSetupTime(value: string): number | null | undefined {
  const input = value.trim();
  if (!input) return null;
  if (!/^\d{2,}:[0-5]\d$/.test(input)) return undefined;
  const [minutes, seconds] = input.split(':').map(Number);
  const total = minutes * 60 + seconds;
  return Number.isSafeInteger(total) && total <= 2147483647 ? total : undefined;
}
