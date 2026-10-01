import assert from 'node:assert/strict';
import test from 'node:test';
import { canAccessFeedbackTrainer } from './feedbackTrainerPermissions.ts';

test('feedback page requires Operations and Co-Host authorization or site admin', () => {
  assert.equal(canAccessFeedbackTrainer({ op_dept: true, cohost_auth: true }, false), true);
  assert.equal(canAccessFeedbackTrainer({ op_dept: true, cohost_auth: false }, false), false);
  assert.equal(canAccessFeedbackTrainer({ op_dept: false, cohost_auth: true }, false), false);
  assert.equal(canAccessFeedbackTrainer(null, false), false);
  assert.equal(canAccessFeedbackTrainer(null, true), true);
});
