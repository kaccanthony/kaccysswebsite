import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function loadTypeScript(path, dependencies = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(name => dependencies[name], module, module.exports);
  return module.exports;
}

const timezone = loadTypeScript('./siteTimezone.ts');
const { buildSessionScripts } = loadTypeScript('./sessionScripts.ts', { './siteTimezone': timezone });

test('session messages use GMT, real staff assignments, links, and Discord local-time stamps', () => {
  const scripts = buildSessionScripts({
    session_name: 'SG Practice', session_date: '2026-06-01', session_time: '00:30',
    session_duration: '60', num_slots: 4,
    event_link: 'https://example.com/event', forum_link: 'https://example.com/forum',
    private_server_link: 'https://example.com/server',
    staffRows: [
      { role: 'HOST', staff_name: 'Host' }, { role: 'CH_1', staff_name: 'CoHost' },
      { role: 'CH_4, IH', staff_name: 'Supervisor' }, { role: 'AST_1', staff_name: 'Assistant' },
    ],
    traineeRows: [{ is_standby: false, trainee_roblox_username: 'SignalUser', trainee_discord: 'DiscordUser' }],
  }, 'BST', { cohost: '123', assistant: '456', supervisor: '789' });

  assert.equal(scripts.length, 7);
  assert.match(scripts[0].content, /31\/05\/2026 23:30 GMT \(<t:\d+:F> · <t:\d+:R>\)/);
  assert.match(scripts[0].content, /https:\/\/example.com\/event/);
  assert.match(scripts[1].content, /https:\/\/example.com\/forum/);
  assert.match(scripts[2].content, /\[31\/05\/2026\] \| 23:30 - 00:30 GMT/);
  assert.match(scripts[4].content, /SG signups \(1\/4\)\n> - SignalUser/);
  assert.match(scripts[5].content, /\[Private Server\]\(https:\/\/example.com\/server\)/);
  assert.match(scripts[6].content, /\*\*Supervisor:\*\* <@789>/);
  assert.match(scripts[6].content, /\*\*Co-Host\(s\):\*\* <@123>/);
});

test('an unfinished add form keeps clear placeholders and does not invent staff or links', () => {
  const scripts = buildSessionScripts({
    session_name: null, session_date: '', session_time: '', session_duration: null,
    num_slots: 4, staffRows: [], traineeRows: [],
  }, 'GMT');
  assert.match(scripts[0].content, /\[HOST NAME\]/);
  assert.match(scripts[0].content, /\[EVENT LINK\]/);
  assert.match(scripts[1].content, /None assigned/);
  assert.match(scripts[5].content, /\[PRIVATE SERVER LINK\]/);
});
