# Codex Cloud setup and reuse

The instructions, Python tools, Node gates and browser checks work in Codex Cloud
without administrator access. Use Node 20+, Python 3.9+, ripgrep, and a Linux
image with the shared libraries required by Playwright Chromium. Browser downloads
do not install missing operating-system libraries; those must be in the image.
Codex CLI skills and lifecycle hooks are optional. Cloud execution does not prove
that a host supports or has trusted `/hooks`.

## Set up the toolkit

Add `PlayerDuvidoso/ux-ui-agent-skills-codex` to your Codex Cloud environment.
Use the existing checkout; cloud tasks are already isolated and need no worktree.
Run this from that checkout (adjust the directory if mounted elsewhere):

```bash
cd /workspace/ux-ui-agent-skills-codex
export npm_config_cache=/workspace/.npm-cache
export PYTHONDONTWRITEBYTECODE=1
export PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright
npm ci
npx playwright install chromium
```

Save these exports in environment startup instructions as well as the setup script.
The browser cache is retained filesystem state; exports must be available in each
new task. No persistent server is required for the toolkit's HTML fixture checks.

Every browser gate, screenshot generator and test preflight uses this order:

1. `DS_BROWSER_EXECUTABLE_PATH`, when set, selects a specific user-installed
   Chrome/Chromium executable. A bad path fails; it does not silently fall back.
2. Otherwise, try system Chrome through Playwright's `chrome` channel.
3. If Chrome cannot launch, use Playwright's bundled Chromium from its user cache.

For an existing compatible user browser, set an absolute executable path:

```bash
export DS_BROWSER_EXECUTABLE_PATH=/workspace/browsers/chrome/chrome
```

This path is an example; use the real executable, not its containing directory.
It must support headless Playwright automation and loading the local files being
tested. Do not disable browser policies, TLS verification, or package checks.
An explicit path overrides automatic selection; unset it to restore fallback.

The setup needs the npm registry and Playwright download hosts such as
`cdn.playwright.dev` and `playwright.download.prss.microsoft.com`. axe audits load
pinned axe-core 4.10.2 from `cdnjs.cloudflare.com`, unless
`node_modules/axe-core/axe.min.js` exists in the working directory. If browser
network access is unavailable, prepare that supported local copy during setup:

```bash
mkdir -p node_modules/axe-core
curl --fail --location --silent --show-error \
  https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js \
  --output node_modules/axe-core/axe.min.js
```

Repeat that step after `npm ci`, which removes extra local packages. No application
dependency or lockfile change is needed for this local setup copy.

## Validate this repository

From the toolkit checkout, with the exports above:

```bash
npm test
npm run test:unit
npm run test:codex
DS_REQUIRE_BROWSER=1 npm run verify
DS_REQUIRE_BROWSER=1 npm run test:gates
```

The full verification checks this toolkit's own examples. A skipped render is
never a pass. `DS_REQUIRE_BROWSER=1` makes missing browser prerequisites fail;
the gate test preflight requires a working browser too. Browser versions can
change font metrics and rendering, so keep the lockfile and browser cache aligned.

## Use it with your other projects

For a shared setup, add both your application repository and this toolkit to the
same Codex Cloud environment. Keep the toolkit at a stable path and install its
dependencies there. Your application's dependencies and startup steps remain in
its own checkout. Each environment that needs the toolkit must include it;
an onboarding environment does not automatically install it into unrelated tasks.

Add guidance like this to your application's existing `AGENTS.md`, preserving its
current instructions and adjusting paths to the mounts in your environment:

```text
Use the UX/UI toolkit at /workspace/ux-ui-agent-skills-codex.
Read that checkout's AGENTS.md and the relevant component, token and workflow docs.
Run its gates against this application's files, with DS_REQUIRE_BROWSER=1.
Run browser gates from the toolkit checkout so its local axe-core copy resolves.
Do not run accuracy_report.mjs to score this application: it tests the toolkit.
Render the application, inspect screenshots and exercise its controls as well.
```

For example, after producing a standalone HTML harness for your app:

```bash
cd /workspace/ux-ui-agent-skills-codex
export PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright
export DS_REQUIRE_BROWSER=1
python3 scripts/validate_tokens.py /workspace/my-app/design-tokens.json
python3 scripts/validate_contrast.py /workspace/my-app/design-tokens.json
python3 scripts/lint_hardcodes.py /workspace/my-app/src
node scripts/verify_states.mjs /workspace/my-app/preview.html
node scripts/axe_audit.mjs /workspace/my-app/preview.html
node scripts/verify_keyboard.mjs /workspace/my-app/preview.html
```

Replace the example targets with actual files. Browser gates take HTML files or
HTML harness directories; a TSX source file alone does not validate rendered UI.
These commands need no toolkit files copied into your application repository.

Alternatively, install a project-local copy from this fork's checkout:

```bash
node /workspace/ux-ui-agent-skills-codex/bin/cli.js init /workspace/my-app --agent codex
```

Review the generated files, preserve existing `AGENTS.md` guidance, and install
Playwright in that project if running its copied scripts. The CLI preserves
existing files by default, so existing scripts may need deliberate updates.
The published upstream npm package may not contain this fork's cloud changes;
use this checkout until the fork publishes an updated package.

For Codex CLI hosts with skills and hooks support, see
[the optional adapter installation](../codex/README.md). Its skills reference
the toolkit checkout, so keep that checkout in place. Do not assume CLI hook
trust or activation carries over to Codex Cloud.

These changes must be committed and pushed to your fork before new remote
checkouts can fetch them. A published cloud environment snapshot can retain the
prepared filesystem, but does not push Git changes or activate unrelated tasks.
