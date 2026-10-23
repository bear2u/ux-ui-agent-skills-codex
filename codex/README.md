# Codex support

Codex Cloud can run the instructions and all browser gates without administrator access.
See [Codex Cloud setup and reuse across projects](../docs/CODEX-CLOUD.md).
CLI lifecycle hooks remain optional and require a host with `/hooks` support;
cloud compatibility does not imply that these hooks are active.

This fork adds Codex skills and lifecycle hooks to [plugin87/ux-ui-agent-skills](https://github.com/plugin87/ux-ui-agent-skills). The upstream kit, attribution and MIT license are retained. Claude hook enforcement is retained; browser detection also recognizes user executables and custom Playwright caches.

## 설치

macOS/Linux, Python 3.9+, ripgrep (`rg`), 그리고 `/hooks`를 지원하는 Codex가 필요합니다. 렌더 검증에는 Node 20+, Playwright와 Chrome도 필요합니다.

```bash
git clone https://github.com/bear2u/ux-ui-agent-skills-codex.git
cd ux-ui-agent-skills-codex
python3 codex/install.py
```

설치 도구는 `CODEX_HOME` 또는 기본 `~/.codex`에 다음을 추가합니다.

- `ux-ui-` 접두사를 붙인 스킬 25개
- 기존 설정을 보존한 `hooks.json`의 훅 4개
- 설치 목록과 업데이트 전 백업

**설치 뒤 Codex CLI에서 `/hooks`를 열어 이 저장소의 `codex/enforce.py`를 실행하는 훅 4개를 검토하고 신뢰 처리하세요. 그다음 Codex를 재시작하세요.** 설치 도구는 신뢰 설정을 우회하지 않습니다. [공식 신뢰 절차](https://learn.chatgpt.com/docs/hooks#review-and-trust-hooks).

이 설치는 저장소를 참조하므로 폴더를 이동하거나 삭제하지 마세요. 스킬 이름 예: `ux-ui-design-screen`, `ux-ui-redesign`, `ux-ui-design-doctrine`. 요청 예: “ux-ui-design-screen 스킬로 홈 화면을 만들고 검증해줘.”

렌더 검증을 위한 의존성 설치는 저장소 안에서 실행합니다.

```bash
npm ci
npx playwright install chromium
```

업데이트: `git pull --ff-only` 후 `python3 codex/install.py`를 다시 실행합니다. 훅 변경 시 `/hooks`의 검토 상태를 확인하세요. 기존의 별도 수동 설치는 자동으로 덮어쓰지 않습니다. 같은 이름의 관리되지 않은 스킬이 있으면 설치를 중단하므로 먼저 백업하고 정리해야 합니다.

## What the hooks enforce

| Event | Behavior |
| --- | --- |
| SessionStart | Supplies the workflow and session-specific verification command |
| PreToolUse | Snapshots UI file hashes before a tool runs |
| PostToolUse | Detects changed UI files and runs hardcode, emoji and native-select checks |
| Stop | Requests continuation when existing tracked files lack valid verification receipts |

Patch, shell and MCP writes are detected by filesystem changes, not Claude-specific `file_path` arguments. Receipts are isolated by project and session. A receipt expires when a target file changes. Nonzero validation exits, `SKIPPED` output, and target mutations during validation do not produce receipts.

From the project root, use the exact session ID supplied by the hook:

```bash
python3 /path/to/ux-ui-agent-skills-codex/codex/enforce.py verify \
  --session SESSION_ID --files src/Button.tsx -- npm run build
```

For a standalone HTML target, pass a kit render command after `--`:

```bash
python3 /path/to/ux-ui-agent-skills-codex/codex/enforce.py verify \
  --session SESSION_ID --files preview.html -- \
  node /path/to/ux-ui-agent-skills-codex/scripts/gate.mjs verify_states.mjs preview.html
```

Use an actual validation command that covers the named targets. A build/test receipt is **not** proof of visual or accessibility correctness. The adapter cannot establish that an arbitrary command meaningfully covers every target; never use dummy success commands. Render, inspect and run additional accessibility gates as required by the task. `DS_REQUIRE_BROWSER=1` is set during verification so missing browsers fail rather than silently pass.

## Limits

- Supported OS: macOS/Linux; file locking uses `fcntl`. Windows is not supported by this adapter.
- Tracked extensions: html, htm, css, scss, tsx, jsx, vue, svelte.
- Scans respect ripgrep/Git ignore rules and exclude dependencies, generated build directories, `.git`, `.codex`, symlinks and files outside the project root.
- Every tool invocation scans the project. Very large projects may be slow; more than 20,000 UI files produces a visible error.
- Background writes after tool completion are not guaranteed to be detected. Concurrent external edits inside a tool's time window can be attributed to that tool.
- Hook state lives under `$CODEX_HOME/ux-ui-hook-state` (default `~/.codex/ux-ui-hook-state`). `UX_UI_HOOK_DATA` can override it.
- Stop keeps requesting verification. If validation is impossible, interrupt and disable these hooks through `/hooks` while fixing the environment. Do not fabricate receipts.
- This is workflow enforcement, not a tamper-proof boundary. User interruption and explicit hook disabling remain available.

## Tests and live activation check

```bash
python3 -m unittest discover -s codex -p 'test_*.py' -v
```

These isolated tests invoke handlers with Codex-shaped payloads and test installation in temporary homes. They do not prove host activation. For a live test after trusting hooks, ask a new Codex chat to create a temporary HTML file containing a native select. PostToolUse should report the violation; Stop should request missing verification. Observe actual hook output rather than relying on the model to claim it ran.

## Disable or remove

Disable the four handlers in `/hooks`. To uninstall, remove only the handler entries whose command points to this clone's `codex/enforce.py` from `hooks.json`; remove only the skill directories listed in `ux-ui-codex-install.json`. Backups remain under `backups/ux-ui-codex-*`. Do not delete other hook groups or unrelated skills.
