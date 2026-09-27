const STAFF_FIELD_NAMES = ['host', 'co_host1', 'co_host2', 'co_host3', 'co_host4_supervisor', 'assistant_1', 'assistant_2', 'assistant_3', 'assistant_4'];
type TraineeIdentityField = 'roblox' | 'discord' | 'discord_id';

function markDuplicates(entries: [string, string][], duplicates: Set<string>) {
  const firstByValue = new Map<string, string>();
  for (const [field, value] of entries) {
    const normalized = value.trim().toLowerCase();
    if (!normalized) continue;
    const first = firstByValue.get(normalized);
    if (first !== undefined) {
      duplicates.add(first);
      duplicates.add(field);
    } else {
      firstByValue.set(normalized, field);
    }
  }
}

/** Checks only assignments in this form, never known trainees or other sessions. */
export function findDuplicateAssignments(values: FormData): Set<string> {
  const duplicates = new Set<string>();
  const staff: [string, string][] = STAFF_FIELD_NAMES.map((field) => [field, String(values.get(field) ?? '')]);
  staff.push(...values.getAll('additional_staff_name').map((value) => ['additional_staff_name', String(value)] as [string, string]));
  markDuplicates(staff, duplicates);

  const trainees: Record<TraineeIdentityField, [string, string][]> = { roblox: [], discord: [], discord_id: [] };
  for (const [field, value] of values.entries()) {
    const match = /^trainee_\d+_(roblox|discord|discord_id)$/.exec(field);
    if (match && typeof value === 'string') trainees[match[1] as TraineeIdentityField].push([field, value]);
  }
  for (const entries of Object.values(trainees)) markDuplicates(entries, duplicates);
  return duplicates;
}
