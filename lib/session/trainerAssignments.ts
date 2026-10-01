type AssignedStaff = { role: string; staff_name: string };
type AssignedTrainee = { slot_number: number; trainer_name: string | null };

export function eligibleTrainerNames(staffRows: readonly AssignedStaff[]): string[] {
  const names = new Map<string, string>();
  for (const row of staffRows) {
    const eligibleRole = /^(?:HOST|CH_[1-4])(?:,|$)/.test(row.role) ||
      /\binternal helper\b|\bIH\b/i.test(row.role) ||
      /^Add T\. Co[ -]?Host$/i.test(row.role);
    if (!eligibleRole) continue;
    const name = row.staff_name.trim();
    if (name) names.set(name.toLowerCase(), name);
  }
  return [...names.values()];
}

export function eligibleTrainerNamesFromForm(formData: FormData): string[] {
  const rows: AssignedStaff[] = [
    'host', 'co_host1', 'co_host2', 'co_host3', 'co_host4_supervisor',
  ].map((field, index) => ({
    role: index === 0 ? 'HOST' : `CH_${index}`,
    staff_name: String(formData.get(field) ?? ''),
  }));
  const additionalNames = formData.getAll('additional_staff_name');
  const additionalRoles = formData.getAll('additional_staff_role');
  for (let i = 0; i < additionalNames.length; i++) {
    rows.push({ role: `Add T. ${String(additionalRoles[i] ?? '')}`, staff_name: String(additionalNames[i] ?? '') });
  }
  return eligibleTrainerNames(rows);
}

export function applyTrainerAssignments<T extends AssignedTrainee>(
  rows: T[],
  staffRows: readonly AssignedStaff[],
  mode: string
): T[] {
  const eligible = eligibleTrainerNames(staffRows);
  if (mode === 'auto') {
    return rows.map((row) => ({
      ...row,
      trainer_name: eligible.length ? eligible[(row.slot_number - 1) % eligible.length] : null,
    }));
  }
  if (mode !== 'manual') throw new Error('Invalid trainer assignment mode.');
  return rows.map((row) => {
    const selected = row.trainer_name?.trim() ?? '';
    const name = eligible.find((candidate) => candidate.toLowerCase() === selected.toLowerCase());
    if (selected && !name) throw new Error(`Trainer for slot ${row.slot_number} must be an assigned Host, Co-Host, or Internal Helper.`);
    return { ...row, trainer_name: name ?? null };
  });
}
