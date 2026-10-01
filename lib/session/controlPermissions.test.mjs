import assert from 'node:assert/strict';
import test from 'node:test';
import { getSessionControlAccess } from './controlPermissions.ts';

const roles = {
  Host: { host: true, coHost: false, mainAst: false, internalHelper: false },
  'Co-Host': { host: false, coHost: true, mainAst: false, internalHelper: false },
  'Main AST': { host: false, coHost: false, mainAst: true, internalHelper: false },
  Assistant: { host: false, coHost: false, mainAst: false, internalHelper: false },
  'Internal Helper': { host: false, coHost: false, mainAst: false, internalHelper: true },
};

test('session controls grant each enabled capability only to its designated shift roles', () => {
  const enabled = {
    'session-details': true, trainees: true, 'trainee-details': true, 'slot-order': true,
    'staff-roles': true, 'drivers-disable': true, 'trainer-details': true,
    'staff-delete': true, 'staff-addition': true,
  };
  const expected = {
    Host: [true, true, true, true, true, true, true, true, true],
    'Co-Host': [true, true, true, true, false, false, false, false, false],
    'Main AST': [false, false, false, false, true, false, false, false, false],
    Assistant: [false, false, false, false, false, false, false, false, false],
    'Internal Helper': [true, true, true, true, false, false, true, true, true],
  };
  for (const [name, role] of Object.entries(roles)) {
    const access = getSessionControlAccess(enabled, role);
    assert.deepEqual([
      access.sessionDetails, access.trainees, access.traineeDetails, access.slotOrder,
      access.staffRoles, access.drivers, access.trainerDetails, access.staffDelete, access.staffAddition,
    ], expected[name], name);
  }
});

test('disabled controls stay locked, while allow-all restores access to every shift role', () => {
  for (const role of Object.values(roles)) {
    const disabled = getSessionControlAccess({}, role);
    assert.equal(disabled.sessionDetails, false);
    assert.equal(disabled.staffAddition, false);
    assert.equal(disabled.drivers, true);

    const all = getSessionControlAccess({ 'allow-all': true, 'drivers-disable': true }, role);
    assert.ok(Object.values(all).every(Boolean));
  }
});
