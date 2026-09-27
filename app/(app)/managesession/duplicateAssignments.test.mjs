import assert from 'node:assert/strict';
import test from 'node:test';
import { findDuplicateAssignments } from './duplicateAssignments.ts';

test('flags both staff fields, including additional staff, without matching blanks', () => {
  const form = new FormData();
  form.set('host', 'Alice');
  form.set('co_host1', ' alice ');
  form.append('additional_staff_name', 'ALICE');
  form.append('additional_staff_name', '');
  assert.deepEqual(
    [...findDuplicateAssignments(form)].sort(),
    ['additional_staff_name', 'co_host1', 'host'],
  );
});

test('checks each trainee identity field independently across regular and standby slots', () => {
  const form = new FormData();
  form.set('trainee_1_roblox', 'PlayerA');
  form.set('trainee_5_roblox', ' playera ');
  form.set('trainee_1_discord', 'Friend');
  form.set('trainee_2_discord', 'FRIEND');
  form.set('trainee_1_discord_id', '123');
  form.set('trainee_2_discord_id', '123');
  form.set('trainee_1_zone', '4');
  form.set('trainee_2_zone', '4');
  assert.deepEqual(
    [...findDuplicateAssignments(form)].sort(),
    ['trainee_1_discord', 'trainee_1_discord_id', 'trainee_1_roblox', 'trainee_2_discord', 'trainee_2_discord_id', 'trainee_5_roblox'],
  );
});

test('allows one trainee in this session regardless of any other session', () => {
  const form = new FormData();
  form.set('trainee_1_roblox', 'PlayerA');
  form.set('trainee_1_discord', 'PlayerA');
  form.set('trainee_1_discord_id', '123');
  form.set('trainee_2_roblox', '');
  form.set('trainee_2_discord', '');
  assert.equal(findDuplicateAssignments(form).size, 0);
});
