> **Codex fork update:** The instructions below describe the upstream AGENTS-only installation. This fork also provides 25 Codex skills and four lifecycle hooks. Follow [Codex installation](../codex/README.md) to enable them; trust review is required. Other agents remain instruction-only.

# Using the kit without Claude Code

For Codex Cloud, use [the cloud setup and cross-project guide](CODEX-CLOUD.md).
Browser gates support a user-installed browser or Playwright Chromium without administrator access.

Codex, Cursor, Copilot, Jules, Aider, VS Code and about twenty more coding agents
read `AGENTS.md` — an open convention, not any one vendor's format. The kit ships
one, carrying the same doctrine as `CLAUDE.md`.

```bash
npx ux-ui-agent-skills init --agent codex
```

That installs `AGENTS.md`, the tokens, the component specs, the accessibility
reference, the taste doctrine, 138 design systems, the framework adapters, and
all 52 gates. It does **not** install `.claude/` — those are Claude Code
mechanisms and would be dead files here.

`--agent both` installs both surfaces. `--agent claude` (the default) installs
only the Claude Code one.

---

## What actually transfers

| | Claude Code | `AGENTS.md` |
|---|---|---|
| Tokens, components, accessibility, taste, 138 design systems | yes | **yes** |
| All 52 gates | yes | **yes** — plain Node and Python |
| The doctrine: eight states, token by intent, mobile-first, the house rules | yes | **yes** |
| 26 skills that load on demand | yes | no — the doctrine is inlined instead |
| Hooks that fire whether or not the model remembers | yes | **no** |
| `/critique` in a separate context | yes | no — a step in the instructions |

### The hooks are the real difference

On Claude Code three rules are enforced without the model choosing to: no
hardcoded values and no emoji on every file write, and a refusal to end a session
that edited UI and measured none of it. The upstream AGENTS-only install does not include that enforcement. The Codex adapter in this fork adds it after installation and trust review.

Without the optional Codex adapter, every rule here is a request. The gates run when you run them. That makes "run
the gate and report what it printed" the whole difference between the kit working
and not working — which is why `AGENTS.md` says it six times.

---

## Run the gates against your own files

The one trap worth stating up front, because a real Codex run fell into it:

> `node scripts/accuracy_report.mjs` is the **kit's** self-test. It points at
> `tests/`, `evals/` and `examples/` inside the kit's own repository. In a
> freshly installed project it scored **17/50**, a number that says nothing about
> that project.

Point the gates at your work instead:

```bash
python3 scripts/validate_tokens.py    design-tokens.json
python3 scripts/validate_contrast.py  design-tokens.json
python3 scripts/lint_hardcodes.py     src
python3 scripts/check_no_emoji.py     src
python3 scripts/lint_native_select.py src

node scripts/verify_states.mjs        src/components/Button.states.html
node scripts/verify_states.mjs --dark src/components/Button.states.html
node scripts/axe_audit.mjs            src/components/Button.states.html
node scripts/verify_keyboard.mjs      src/components
node scripts/verify_target_size.mjs   src/components
node scripts/verify_responsive.mjs    src/components --scale=1.25
node scripts/verify_mobile_first.mjs  src
node scripts/lint_intent.mjs          src/components
node scripts/slop_tells.mjs --strict  src/pages/index.html
```

The render gates use Chrome or Playwright Chromium, including in Codex Cloud:

```bash
npm i -D playwright && npx playwright install chromium
```

Without it they print `SKIPPED` and exit 0, which reads like a pass and is not
one. Set `DS_REQUIRE_BROWSER=1` to turn that into a loud failure.

---

## Verified, not assumed

This was tested by running Codex CLI 0.159.2 against a project installed with
`--agent codex`, and it found two real defects in the first draft:

1. Asked to name the two house rules, Codex named two different rules. They were
   in the file as unlabelled paragraphs among eight other bold paragraphs. They
   have a heading now.
2. The file told it to run `accuracy_report.mjs`, and it did — scoring 17/50 in a
   project where that number is meaningless.

Both are fixed, and `scripts/validate_agents_surface.py` plus
`tests/meta/agents-surface.test.mjs` hold them fixed. On the re-run Codex named
both house rules correctly, explained why it should not run the self-test, and —
the part that matters — reported a gate's `SKIPPED: ... This measured NOTHING -
not a pass` verbatim instead of calling it a pass.

That historical result exercised the upstream installation without the optional Codex hooks.
