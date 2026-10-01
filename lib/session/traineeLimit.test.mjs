import assert from 'node:assert/strict';
import test from 'node:test';
import { countSessionTraineeSlots, isWithinSessionTraineeLimit, MAX_SESSION_TRAINEES } from './traineeLimit.ts';

test('counts allocated, reserved, and unallocated groups together', () => {
  assert.equal(countSessionTraineeSlots(10, 6, 4), MAX_SESSION_TRAINEES);
  assert.equal(isWithinSessionTraineeLimit(10, 6, 4), true);
  assert.equal(isWithinSessionTraineeLimit(10, 6, 5), false);
});
