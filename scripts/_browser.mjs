/** Shared browser selection for local development and unprivileged cloud tasks. */
export async function launchBrowser(chromium, options = {}) {
  const { executablePath = process.env.DS_BROWSER_EXECUTABLE_PATH, ...launchOptions } = options;
  // An explicit path is authoritative: a typo must fail, not select another browser.
  if (executablePath) {
    return chromium.launch({ ...launchOptions, executablePath });
  }
  const failures = [];
  for (const selection of [{ channel: 'chrome' }, {}]) {
    try {
      return await chromium.launch({ ...launchOptions, ...selection });
    } catch (error) {
      failures.push(error.message.split('\n')[0]);
    }
  }
  throw new Error(
    `No usable Chrome/Chromium browser: ${failures.join('; ')}. ` +
    'Run npx playwright install chromium (no administrator access needed), or set ' +
    'DS_BROWSER_EXECUTABLE_PATH to a compatible user-installed Chrome/Chromium executable. ' +
    'Use PLAYWRIGHT_BROWSERS_PATH for a writable browser cache.'
  );
}
