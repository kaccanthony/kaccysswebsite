import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('./staffRankOrder.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const module = { exports: {} };
new Function('module', 'exports', compiled)(module, module.exports);
const { orderStaffRows, compareStaffRanks } = module.exports;

test('staff boards follow the manager-defined rank order', () => {
  const rows = [
    { name: 'Assistant', rank: 'Assistant Authorized' },
    { name: 'Event', rank: 'Event Authorized' },
    { name: 'Operations', rank: 'Operations Manager' },
    { name: 'Co-Host', rank: 'Co-Host Authorized' },
    { name: 'Community', rank: 'Community Manager' },
    { name: 'Head', rank: 'Head Staff' },
  ];
  assert.deepEqual(orderStaffRows(rows, row => row.rank).map(row => row.name),
    ['Operations', 'Community', 'Head', 'Co-Host', 'Event', 'Assistant']);
  assert.equal(compareStaffRanks('Event Authorized', 'Assistant Authorized') < 0, true);
});

test('historical Host Authorized stays with Head Staff and unknown ranks follow', () => {
  const rows = [
    { name: 'Unknown 1', rank: 'Other' },
    { name: 'Host', rank: 'Host Authorized' },
    { name: 'Head', rank: 'Head Staff' },
    { name: 'Unknown 2', rank: null },
  ];
  assert.deepEqual(orderStaffRows(rows, row => row.rank).map(row => row.name),
    ['Host', 'Head', 'Unknown 1', 'Unknown 2']);
});
