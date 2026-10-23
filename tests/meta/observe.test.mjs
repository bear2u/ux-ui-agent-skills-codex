/**
 * The observability log and the report built from it, driven through the real
 * hooks: JSON on stdin, events on disk, a verdict from scripts/observe.mjs.
 *
 * Each verdict has a test that produces it the way a session would, because a
 * report that only ever sees "followed" proves nothing - the point is that it
 * says BROKE when the agent quit with a page open or left a finding behind.
 */
import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readdirSync, existsSync, utimesSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../helpers/run.mjs';
import { loadEvents, loadReceipts, summarize, renderHtml, renderText, timeline } from '../../scripts/observe.mjs';

const CLEAN = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title></head>
<body><main><h1>Hello</h1></main></body></html>\n`;

let scratch, project;
beforeEach(() => {
  for (const d of [scratch, project]) if (d) rmSync(d, { recursive: true, force: true });
  scratch = mkdtempSync(join(tmpdir(), 'ds-obs-data-'));
  project = mkdtempSync(join(tmpdir(), 'ds-obs-proj-'));
});
after(() => { for (const d of [scratch, project]) if (d) rmSync(d, { recursive: true, force: true }); });

const env = (extra = {}) => ({ ...process.env, CLAUDE_PLUGIN_DATA: scratch, CLAUDE_PROJECT_DIR: project, CLAUDE_SESSION_ID: '', ...extra });
function hook(name, payload, extra) {
  return spawnSync('node', [join(ROOT, 'hooks', name)], {
    cwd: project, input: JSON.stringify(payload), encoding: 'utf8', env: env(extra),
  });
}
const start = (s = 's1') => hook('session-start-preflight.mjs', { session_id: s, source: 'startup' });
const edit = (file, s = 's1') => hook('posttooluse-fast-gates.mjs', { session_id: s, tool_name: 'Write', tool_input: { file_path: file } });
const stop = (s = 's1', again = false) => hook('stop-require-measurement.mjs', { session_id: s, stop_hook_active: again });
const measure = file => spawnSync('node', [join(ROOT, 'scripts/gate.mjs'), 'check_no_emoji.py', file],
  { cwd: project, encoding: 'utf8', env: env() });
const report = (opts = {}) => {
  const events = loadEvents([scratch]);
  return summarize(events, loadReceipts([scratch], [project]), { days: 1, ...opts });
};

test('a session that measured its page before ending is "followed", with the gate run in its timeline', () => {
  const page = join(project, 'index.html');
  writeFileSync(page, CLEAN);
  start();
  edit(page);
  const blocked = stop();
  // Without a browser the hook warns instead of blocking; both are recorded.
  assert.ok([0, 2].includes(blocked.status));
  assert.equal(measure(page).status, 0, 'setup: the browser-free gate must pass');
  assert.equal(stop('s1', blocked.status === 2).status, 0);

  const sum = report();
  const s = sum.sessions[0];
  assert.equal(sum.sessions.length, 1);
  assert.equal(s.verdict, 'followed', JSON.stringify(s.rules));
  assert.equal(s.pages.length, 1);
  assert.equal(s.gateRuns.length, 1, 'the gate run must be joined to the session that edited the page');
  assert.ok(timeline(s).some(r => r.kind === 'gate-pass'));
  assert.equal(sum.totals.rate, 1);
});

test('ending while the Stop hook still has a page open is "released", and the session broke a rule', () => {
  const page = join(project, 'index.html');
  writeFileSync(page, CLEAN);
  start();
  edit(page);
  stop();
  // Claude Code lets the second stop through (stop_hook_active). Nothing was measured.
  assert.equal(stop('s1', true).status, 0, 'the reentry stop must never block');

  const s = report().sessions[0];
  assert.ok(s.stops.some(x => x.outcome === 'released'), JSON.stringify(s.stops));
  assert.equal(s.verdict, 'broke');
  assert.equal(s.rules.find(r => r.rule === 'not quit').ok, false);
  assert.equal(s.rules.find(r => r.rule === 'measured').ok, false);
});

test('a finding left on the latest version breaks "fixed"; fixing it on a later edit clears it', () => {
  const css = join(project, 'app.css');
  writeFileSync(css, '.a{color:#ff0000}\n');
  start();
  edit(css);
  stop();
  let s = report().sessions[0];
  assert.equal(s.findings.length, 1, JSON.stringify(s.findings));
  assert.equal(s.findings[0].gate, 'lint_hardcodes.py');
  assert.equal(s.verdict, 'broke');
  assert.equal(s.rules.find(r => r.rule === 'fixed').ok, false);
  // A session that edited no page and was never blocked says so in words, not
  // as "0 page(s), all with a passing gate" / "blocked 0 time(s), resolved each".
  assert.equal(s.rules.find(r => r.rule === 'measured').detail, 'no pages edited, nothing to measure');
  assert.equal(s.rules.find(r => r.rule === 'not quit').detail, 'never blocked');

  writeFileSync(css, '.a{color:var(--color-text-primary)}\n');
  edit(css);
  stop();
  s = report().sessions[0];
  assert.equal(s.openFindings.length, 0);
  assert.equal(s.verdict, 'followed', JSON.stringify(s.rules));
});

test('a session whose last edit came after its last end of turn is "unfinished", not judged', () => {
  const page = join(project, 'index.html');
  writeFileSync(page, CLEAN);
  start();
  edit(page);
  const sum = report();
  assert.equal(sum.sessions[0].verdict, 'unfinished');
  assert.equal(sum.totals.rate, null, 'an unfinished session is not counted for or against');
});

test('no session id, or DS_OBSERVE=0, writes no event', () => {
  const page = join(project, 'index.html');
  writeFileSync(page, CLEAN);
  hook('posttooluse-fast-gates.mjs', { tool_name: 'Write', tool_input: { file_path: page } });
  hook('posttooluse-fast-gates.mjs', { session_id: 's1', tool_name: 'Write', tool_input: { file_path: page } }, { DS_OBSERVE: '0' });
  hook('session-start-preflight.mjs', { session_id: 's1' }, { DS_OBSERVE: '0' });
  assert.equal(loadEvents([scratch]).length, 0);
});

test('a log that cannot be written changes nothing about what a hook decides', () => {
  const page = join(project, 'index.html');
  writeFileSync(page, CLEAN);
  // The events directory's parent is a file: every write fails.
  const blocker = join(scratch, 'not-a-dir');
  writeFileSync(blocker, '');
  const r = spawnSync('node', [join(ROOT, 'hooks/posttooluse-fast-gates.mjs')], {
    cwd: project, encoding: 'utf8',
    input: JSON.stringify({ session_id: 's1', tool_name: 'Write', tool_input: { file_path: page } }),
    env: env({ CLAUDE_PLUGIN_DATA: blocker }),
  });
  assert.equal(r.status, 0, r.stderr);
  const s = spawnSync('node', [join(ROOT, 'hooks/session-start-preflight.mjs')], {
    cwd: project, encoding: 'utf8', input: JSON.stringify({ session_id: 's1' }), env: env({ CLAUDE_PLUGIN_DATA: blocker }),
  });
  assert.equal(s.status, 0, s.stderr);
});

test('--project shows only that project; another project in the same data dir stays out', () => {
  const page = join(project, 'index.html');
  writeFileSync(page, CLEAN);
  edit(page, 'mine');
  const other = mkdtempSync(join(tmpdir(), 'ds-obs-other-'));
  writeFileSync(join(other, 'x.html'), CLEAN);
  spawnSync('node', [join(ROOT, 'hooks/posttooluse-fast-gates.mjs')], {
    cwd: other, encoding: 'utf8', env: env({ CLAUDE_PROJECT_DIR: other }),
    input: JSON.stringify({ session_id: 'theirs', tool_name: 'Write', tool_input: { file_path: join(other, 'x.html') } }),
  });
  assert.equal(report().sessions.length, 2);
  const mine = report({ project });
  assert.deepEqual(mine.sessions.map(s => s.session), ['mine']);
  assert.ok(!JSON.stringify(mine).includes(other), 'nothing from the other project may appear');
  rmSync(other, { recursive: true, force: true });
});

test('event files older than the retention window are deleted at session start', () => {
  const dir = join(scratch, 'observe');
  mkdirSync(dir, { recursive: true });
  const old = join(dir, 'events-0000000000-2020-01-01.jsonl');
  writeFileSync(old, '{}\n');
  const t = (Date.now() - 40 * 86400000) / 1000;
  utimesSync(old, t, t);
  start();
  assert.ok(!existsSync(old), 'a 40-day-old event file must be pruned');
  assert.ok(readdirSync(dir).some(f => f.startsWith('events-')), 'today\'s session start is still written');
});

test('the dashboard and the text report carry no emoji and no hardcoded values', () => {
  const page = join(project, 'index.html');
  writeFileSync(page, CLEAN);
  start(); edit(page); stop(); stop('s1', true);
  const sum = report();
  const out = join(project, 'observe.html');
  writeFileSync(out, renderHtml(sum));
  writeFileSync(join(project, 'observe.txt'), renderText(sum));
  for (const g of ['check_no_emoji.py', 'lint_hardcodes.py', 'lint_native_select.py']) {
    const r = spawnSync('python3', [join(ROOT, 'scripts', g), out], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${g} on the dashboard:\n${r.stdout}`);
  }
  const e = spawnSync('python3', [join(ROOT, 'scripts/check_no_emoji.py'), join(project, 'observe.txt')], { encoding: 'utf8' });
  assert.equal(e.status, 0, e.stdout);
});

test('the CLI prints the report and machine-readable JSON', () => {
  const page = join(project, 'index.html');
  writeFileSync(page, CLEAN);
  start(); edit(page); stop(); stop('s1', true);
  const cli = args => spawnSync('node', [join(ROOT, 'bin/cli.js'), 'observe', '--data', scratch, ...args], { encoding: 'utf8', cwd: project });
  const text = cli([]);
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /Followed the rules: 0 of 1/);
  const json = JSON.parse(cli(['--json']).stdout);
  assert.equal(json.totals.broke, 1);
  const last = cli(['--last']);
  assert.match(last.stdout, /let go with pages OPEN/);
});
