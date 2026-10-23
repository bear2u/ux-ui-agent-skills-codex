import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser } from '../../scripts/_browser.mjs';
import { run, ROOT, F } from '../helpers/run.mjs';
import { join } from 'node:path';

test('prefers system Chrome when available', async () => {
  const calls = [];
  const browser = {};
  const result = await launchBrowser({ launch: async options => {
    calls.push(options); return browser;
  } }, { executablePath: '', headless: true });
  assert.equal(result, browser);
  assert.deepEqual(calls, [{ headless: true, channel: 'chrome' }]);
});

test('falls back to user-cache Chromium without changing launch options', async () => {
  const calls = [];
  const browser = {};
  const result = await launchBrowser({ launch: async options => {
    calls.push(options);
    if (options.channel) throw new Error('system Chrome unavailable');
    return browser;
  } }, { executablePath: '', headless: true });
  assert.equal(result, browser);
  assert.deepEqual(calls, [{ headless: true, channel: 'chrome' }, { headless: true }]);
});

test('an explicit executable is authoritative, including when it fails', async () => {
  const calls = [];
  await assert.rejects(launchBrowser({ launch: async options => {
    calls.push(options); throw new Error('invalid executable');
  } }, { executablePath: '/user/chrome' }), /invalid executable/);
  assert.deepEqual(calls, [{ executablePath: '/user/chrome' }]);
});

test('reads the user executable from the environment', async () => {
  const original = process.env.DS_BROWSER_EXECUTABLE_PATH;
  process.env.DS_BROWSER_EXECUTABLE_PATH = '/user/chrome';
  try {
    await launchBrowser({ launch: async options => {
      assert.deepEqual(options, { executablePath: '/user/chrome' }); return {};
    } });
  } finally {
    if (original === undefined) delete process.env.DS_BROWSER_EXECUTABLE_PATH;
    else process.env.DS_BROWSER_EXECUTABLE_PATH = original;
  }
});

test('reports both failed selections and the unprivileged installation command', async () => {
  await assert.rejects(launchBrowser({ launch: async options => {
    throw new Error(options.channel ? 'Chrome missing' : 'Chromium missing');
  } }, { executablePath: '' }), /Chrome missing; Chromium missing.*playwright install chromium.*DS_BROWSER_EXECUTABLE_PATH/);
});

test('a required render check fails rather than skipping an unusable executable', () => {
  const result = run('node', [join(ROOT, 'scripts/measure_render.mjs'), F('good/clean-panel.html')], {
    env: { DS_REQUIRE_BROWSER: '1', DS_BROWSER_EXECUTABLE_PATH: '/missing/ux-ui-browser' },
  });
  assert.equal(result.status, 1, result.out);
  assert.match(result.out, /REQUIRED, FAILING/);
  assert.doesNotMatch(result.out, /SKIPPED/);
});
