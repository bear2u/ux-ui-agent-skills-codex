/**
 * The three gates that used to hardwire the repo root.
 *
 * A gate pointed only at its own repo can be shown passing and never shown
 * refusing, which makes it a claim rather than a check. `--root` points each one
 * at a copy, so the refusal is demonstrable — and these tests are the
 * demonstration.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { py, ROOT, F } from '../helpers/run.mjs';

test('validate_component_spec refuses a spec with none of the required sections', () => {
  const r = py('validate_component_spec.py', ['--root', F('bad/root-thin-spec')]);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /missing required sections/);
});

test('validate_template refuses a root with no template in it', () => {
  // Scanning nothing must not read as clean.
  const r = py('validate_template.py', ['--root', F('bad/root-no-template')]);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout + r.stderr, /not found/);
});

test('validate_instruction_surface refuses a copy whose brief dropped the emoji ban', () => {
  // The surface gate exists so the always-on rules cannot quietly be demoted.
  const dir = mkdtempSync(join(tmpdir(), 'ds-root-'));
  try {
    for (const p of ['CLAUDE.md', '.claude', '.claude-plugin', 'package.json']) {
      cpSync(join(ROOT, p), join(dir, p), { recursive: true });
    }
    const brief = join(dir, 'CLAUDE.md');
    writeFileSync(brief, readFileSync(brief, 'utf8')
      .replace('> **ABSOLUTE: zero emoji in any output.**', '> Emoji are fine, actually.'));
    const r = py('validate_instruction_surface.py', ['--root', dir]);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /emoji ban/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('validate_instruction_surface refuses SKILL.md frontmatter a YAML loader rejects', () => {
  // An unquoted ": " inside a value is a nested mapping to a strict loader, and
  // the skill is skipped without a word (#23).
  const dir = mkdtempSync(join(tmpdir(), 'ds-root-'));
  try {
    for (const p of ['CLAUDE.md', '.claude', '.claude-plugin', 'package.json']) {
      cpSync(join(ROOT, p), join(dir, p), { recursive: true });
    }
    const skill = join(dir, '.claude/skills/data-dashboard/SKILL.md');
    writeFileSync(skill, readFileSync(skill, 'utf8')
      .replace(/^description: '(.*)'$/m, (_, v) => `description: ${v.replace(/''/g, "'")}`));
    const r = py('validate_instruction_surface.py', ['--root', dir]);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /frontmatter: .*data-dashboard/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('all three still pass against the real repo', () => {
  for (const s of ['validate_component_spec.py', 'validate_instruction_surface.py', 'validate_template.py']) {
    const r = py(s, []);
    assert.equal(r.status, 0, `${s} failed on the repo itself:\n${r.stdout}${r.stderr}`);
  }
});
