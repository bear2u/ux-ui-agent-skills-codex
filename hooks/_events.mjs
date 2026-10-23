/**
 * The observability log: what the hooks saw, one JSON line per event.
 *
 * The edit ledger answers one question for the Stop hook and is thrown away
 * with the session. This keeps the record afterwards, so a person can ask
 * whether an agent followed the rules - edited a page, was it measured, was it
 * blocked, did it fix what the fast gates caught or quit with it open.
 *
 * Three rules it never breaks:
 *   - Local only. Nothing here is sent anywhere.
 *   - Writing an event can never fail a hook or slow it noticeably. Every
 *     write is wrapped; a log we cannot write is a log we do not have.
 *   - No session id, no event: the same rule the ledger follows, for the same
 *     reason (a shared fallback name is how sessions came to mix).
 *
 * DS_OBSERVE=0 turns it off. Files older than RETAIN_DAYS are deleted at
 * session start.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, appendFileSync, readdirSync, statSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectDir } from './_ledger.mjs';

export const RETAIN_DAYS = 30;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function eventsDir() {
  const data = process.env.CLAUDE_PLUGIN_DATA;
  if (data) return join(data, 'observe');
  return join(projectDir(), '.ds-receipts', 'observe');
}

export function observing() {
  return process.env.DS_OBSERVE !== '0';
}

export function kitVersion() {
  try { return JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version; }
  catch { return null; }
}

/** One file per project per day: few files, and a day is easy to prune. */
function eventsFile(at) {
  const tag = createHash('sha256').update(projectDir()).digest('hex').slice(0, 10);
  return join(eventsDir(), `events-${tag}-${at.slice(0, 10)}.jsonl`);
}

/** Append one event. Returns true when it was written; never throws. */
export function recordEvent(payload, kind, data = {}) {
  try {
    if (!observing()) return false;
    const session = String(payload?.session_id || '').replace(/[^\w-]/g, '');
    if (!session) return false;
    const at = new Date().toISOString();
    const event = { v: 1, at, kind, session, project: projectDir(), ...data };
    mkdirSync(eventsDir(), { recursive: true });
    appendFileSync(eventsFile(at), JSON.stringify(event) + '\n');
    return true;
  } catch {
    return false;
  }
}

/** Delete event files not written to in RETAIN_DAYS. Never throws. */
export function pruneEvents(now = Date.now()) {
  let removed = 0;
  try {
    const dir = eventsDir();
    for (const f of readdirSync(dir)) {
      if (!/^events-.*\.jsonl$/.test(f)) continue;
      const p = join(dir, f);
      if (now - statSync(p).mtimeMs > RETAIN_DAYS * 86400000) { rmSync(p, { force: true }); removed++; }
    }
  } catch { /* no directory yet */ }
  return removed;
}
