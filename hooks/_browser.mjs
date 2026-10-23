/**
 * Is there a browser the render gates can drive? Answered without launching
 * one, because both hooks must finish fast and must not spawn anything.
 *
 * One definition for both hooks. The first version was a macOS path list
 * copied into each: on Linux a system Chrome - which the gates launch fine
 * through `channel: 'chrome'` - was never seen, so the preflight said the gates
 * could not run while they ran, and the Stop hook downgraded to a warning (#26).
 */
import { existsSync } from 'node:fs';
import { join, delimiter } from 'node:path';

const home = process.env.HOME || process.env.USERPROFILE || '';

/** Where `channel: 'chrome'` and Playwright's own downloads end up, per platform. */
const FIXED = [
  // macOS
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  join(home, 'Library/Caches/ms-playwright'),
  // Linux
  '/opt/google/chrome/chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium',
  join(home, '.cache/ms-playwright'),
  // Windows
  join(process.env.LOCALAPPDATA || '', 'ms-playwright'),
  join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google/Chrome/Application/chrome.exe'),
  join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
];

const ON_PATH = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome'];

export function browserPresent() {
  // An explicit cloud/browser executable is authoritative, matching scripts/_browser.mjs.
  const explicit = process.env.DS_BROWSER_EXECUTABLE_PATH;
  if (explicit) return existsSync(explicit);
  const custom = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (custom && custom !== '0' && existsSync(custom)) return true;
  if (FIXED.some(p => p && existsSync(p))) return true;
  for (const dir of (process.env.PATH || '').split(delimiter)) {
    if (dir && ON_PATH.some(n => existsSync(join(dir, n)))) return true;
  }
  return false;
}
