#!/usr/bin/env node
/**
 * Stop: do not finish a session that edited UI and measured none of it.
 *
 * This is the rule "never state a number you did not measure" turned into
 * something that happens rather than something the model is asked to remember.
 * If the session edited a renderable page and there is no live, passing receipt
 * for it - no receipt at all, one whose hash no longer matches because the page
 * was edited after it was measured, or only receipts from a gate that failed or
 * skipped - say so and block.
 *
 * Deliberate softenings:
 *   - stop_hook_active always lets the turn end. It is true when Claude Code is
 *     already continuing because of a Stop hook, and blocking again there never
 *     ends. The state is still computed first so the observability log records
 *     whether the agent finished with pages unmeasured.
 *   - Only pages (.html/.htm) are required. A stylesheet or a component source
 *     cannot be rendered by itself: verify_states on a .css file checks zero
 *     elements and passes, so demanding a receipt for one adds friction and
 *     measures nothing.
 *   - With no browser on the machine the render gates cannot run at all, so
 *     blocking would be a demand nobody can satisfy. It downgrades to requiring
 *     the answer to say the work is unmeasured.
 *
 * And one rule it must never break: the command it prints has to be one that
 * clears it. Version 2.9.8 printed a command whose receipts landed where the
 * hook never looked, and blocked every turn for the rest of the session (#24).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { liveReceiptsFor } from '../scripts/gate.mjs';
import { ledgerFile, insideProject, projectDir } from './_ledger.mjs';
import { browserPresent } from './_browser.mjs';
import { recordEvent } from './_events.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = new Set(['.html', '.htm']);

let payload = {};
try { payload = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { payload = {}; }

/* The same path the writer builds, imported rather than rebuilt: two copies of
   a path formula drift, and when they do this hook silently stops seeing any
   edits at all - which looks exactly like a clean session. */
const ledger = ledgerFile(payload);
if (!ledger || !existsSync(ledger)) process.exit(0);

// What the observability log keeps about the end of a turn. Pages only, with
// their state, so a report can say "edited 3, measured 2" without re-deriving it.
const stopEvent = (outcome, rows = []) => recordEvent(payload, 'stop', {
  outcome, reentry: Boolean(payload.stop_hook_active),
  pages: rows.map(({ p, live, passing }) => ({
    path: p,
    state: passing.length ? 'passing' : live.length ? 'failing' : 'not_measured',
    ...(live.length && !passing.length
      ? { gate: live[live.length - 1].gate, exit: live[live.length - 1].exit, skipped: Boolean(live[live.length - 1].skipped) }
      : {}),
  })),
});

const edited = [...new Set(
  readFileSync(ledger, 'utf8').split('\n').filter(Boolean)
    .map(l => { try { return JSON.parse(l).path; } catch { return null; } })
    .filter(Boolean)
    // Only this project's pages. A ledger that somehow holds another
    // repository's edits must never block you here.
    .filter(p => PAGES.has(extname(p).toLowerCase()) && insideProject(p) && existsSync(p)))];

if (!edited.length) { stopEvent('no_pages'); process.exit(0); }

const status = edited.map(p => {
  const live = liveReceiptsFor(p);
  const passing = live.filter(r => r.exit === 0 && !r.skipped);
  return { p, live, passing };
});
const open = status.filter(s => !s.passing.length);

// Already continuing because of a Stop hook: let it through or it never ends.
// Recorded first, because this is the one case where an agent can finish with
// pages still unmeasured, and the log is where that becomes visible.
if (payload.stop_hook_active) { stopEvent(open.length ? 'released' : 'pass', status); process.exit(0); }

if (!open.length) { stopEvent('pass', status); process.exit(0); }

const shown = p => relative(projectDir(), p) || p;
const list = open.map(({ p, live }) => {
  if (!live.length) return `  ${shown(p)}  (not measured)`;
  const last = live[live.length - 1];
  return `  ${shown(p)}  (measured, failing: ${last.gate} exit ${last.exit}${last.skipped ? ', SKIPPED' : ''})`;
}).join('\n');

if (!browserPresent()) {
  console.error(
    `[ux-ui-agent-skills] ${open.length} page(s) were edited and cannot be measured `
    + `here - this machine has no browser for the render gates:\n${list}\n\n`
    + `Not a blocker, but your answer must say the result is UNMEASURED rather than `
    + `implying it passed. Installing one: npx playwright install chromium`);
  stopEvent('warn_no_browser', status);
  process.exit(0);
}

// Absolute paths and the data dir spelled out, so the command works from any
// cwd and writes where this hook reads.
const gate = join(ROOT, 'scripts/gate.mjs');
const data = process.env.CLAUDE_PLUGIN_DATA ? `CLAUDE_PLUGIN_DATA="${process.env.CLAUDE_PLUGIN_DATA}" ` : '';
const first = open[0].p;

console.error(
  `[ux-ui-agent-skills] ${open.length} page(s) edited in this session have no live, `
  + `passing gate receipt:\n${list}\n\n`
  + `Measure each one through the wrapper, which records what it measured:\n`
  + `  ${data}node "${gate}" verify_states.mjs "${first}"\n\n`
  + `A receipt counts only while the page is unchanged since it was measured, and only `
  + `if the gate passed. A failing gate means fix the page, then measure again.`);
stopEvent('block', status);
process.exit(2);
