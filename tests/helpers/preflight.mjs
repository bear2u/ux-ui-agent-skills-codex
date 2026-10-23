/** Require the same usable browser that the gates select; never count skips as passes. */
import { launchBrowser } from '../../scripts/_browser.mjs';
let cached;

export async function browserPreflight() {
  if (cached) return cached;
  const problems = [];
  let chromium;
  try { ({ chromium } = await import('playwright')); }
  catch { problems.push('playwright is not installed — run `npm install`'); }

  if (chromium) {
    try { const b = await launchBrowser(chromium); await b.close(); }
    catch (e) { problems.push(e.message); }
  }

  cached = problems;
  return problems;
}

/** Throw unless the machine can actually render. Call once per meta-gate file. */
export async function requireBrowser() {
  const problems = await browserPreflight();
  if (problems.length) {
    throw new Error(
      'browser preflight failed — the meta-gate suite cannot prove anything without a browser:\n  - ' +
      problems.join('\n  - '));
  }
}
