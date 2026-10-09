import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('./staff-helpers.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const module = { exports: {} };
new Function('module', 'exports', compiled)(module, module.exports);
const { staffSort } = module.exports;

test('public staff order uses rank and Head Staff department priority', () => {
  const rows = [
    { name: 'Community only', rank: 'Head Staff', opDept: false, commDept: true },
    { name: 'Assistant', rank: 'Assistant Authorized' },
    { name: 'Operations only', rank: 'Head Staff', opDept: true, commDept: false },
    { name: 'Both', rank: 'Head Staff', opDept: true, commDept: true },
    { name: 'Event', rank: 'Event Authorized' },
    { name: 'Co-host', rank: 'Co-Host Authorized' },
    { name: 'Community manager', rank: 'Community Manager' },
    { name: 'Operations manager', rank: 'Operations Manager' },
  ];
  assert.deepEqual(rows.sort(staffSort).map(row => row.name), [
    'Operations manager', 'Community manager', 'Both', 'Operations only',
    'Community only', 'Co-host', 'Event', 'Assistant',
  ]);
});
