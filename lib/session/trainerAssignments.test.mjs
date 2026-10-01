import assert from 'node:assert/strict';
import test from 'node:test';
import { applyTrainerAssignments, eligibleTrainerNames, eligibleTrainerNamesFromForm } from './trainerAssignments.ts';

test('trainer choices include assigned host, co-hosts, and internal helpers only', () => {
  const form = new FormData();
  form.set('host', 'Host');
  form.set('co_host4_supervisor', 'Fourth');
  form.append('additional_staff_name', 'Helper');
  form.append('additional_staff_role', 'Internal Helper');
  form.append('additional_staff_name', 'Assistant');
  form.append('additional_staff_role', 'Assistant');
  assert.deepEqual(eligibleTrainerNamesFromForm(form), ['Host', 'Fourth', 'Helper']);
  assert.deepEqual(eligibleTrainerNames([
    { role: 'HOST', staff_name: 'Host' },
    { role: 'CH_4, IH', staff_name: 'Fourth' },
    { role: 'Add T. Internal Helper', staff_name: 'Helper' },
    { role: 'AST_1', staff_name: 'Assistant' },
  ]), ['Host', 'Fourth', 'Helper']);
});

test('auto assignment persists a round-robin choice by slot, and manual rejects outsiders', () => {
  const staff = [
    { role: 'HOST', staff_name: 'Host' },
    { role: 'CH_1', staff_name: 'CoHost' },
    { role: 'AST_1', staff_name: 'Assistant' },
  ];
  const rows = [1, 2, 3].map((slot_number) => ({ slot_number, trainer_name: null }));
  assert.deepEqual(applyTrainerAssignments(rows, staff, 'auto').map((row) => row.trainer_name), ['Host', 'CoHost', 'Host']);
  assert.equal(applyTrainerAssignments([{ slot_number: 1, trainer_name: 'cohost' }], staff, 'manual')[0].trainer_name, 'CoHost');
  assert.throws(() => applyTrainerAssignments([{ slot_number: 1, trainer_name: 'Assistant' }], staff, 'manual'), /must be an assigned/);
});
