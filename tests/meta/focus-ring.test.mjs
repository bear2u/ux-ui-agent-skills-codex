/**
 * The focus ring is visible on every surface it can land on, in both themes.
 *
 * WCAG 2.4.11 / 1.4.11 ask 3:1 of a focus indicator against what is around it.
 * No render gate measured this: verify_states checks text contrast in the focus
 * state, not the ring. So the shared example theme shipped a dark-mode ring of
 * action-primary (#006a6b) at 2.93:1 on the page and 2.52:1 on a card, used by
 * every component-states page, until 2026-10-20.
 *
 * This reads each shipped theme's custom properties, resolves the ring's outer
 * colour per theme, and measures it against every surface token the theme
 * defines.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../helpers/run.mjs';

const THEMES = ['examples/brandkit-demo/theme.css', 'examples/golden/theme.css', 'examples/sample-app/preview.html'];

/** Custom properties declared in the blocks whose selector matches. */
function props(css, selector) {
  const out = {};
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selector(m[1].trim())) continue;
    for (const d of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) out[d[1]] = d[2].trim();
  }
  return out;
}
const isRoot = s => /^:root$|^:root\s*,|^html$/.test(s);
const isDark = s => /\[data-theme="?dark"?\]/.test(s) && !/\s[^\s]+$/.test(s.replace(/^:root/, ''));

function resolve(value, vars, depth = 0) {
  if (depth > 10) return value;
  return value.replace(/var\((--[\w-]+)(?:\s*,\s*([^)]+))?\)/g, (_, n, fb) =>
    vars[n] !== undefined ? resolve(vars[n], vars, depth + 1) : (fb || ''));
}
function hex(c) {
  const m = c.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map(x => x + x).join('') : m[1];
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
}
const lum = rgb => {
  const [r, g, b] = rgb.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

for (const file of THEMES) {
  test(`${file}: the focus ring clears 3:1 on every surface, light and dark`, () => {
    const css = readFileSync(join(ROOT, file), 'utf8');
    const light = props(css, isRoot);
    const dark = { ...light, ...props(css, isDark) };
    const bad = [];
    for (const [theme, vars] of [['light', light], ['dark', dark]]) {
      if (!vars['--shadow-focus-ring']) continue;
      // The outer ring is the last colour in the shadow list.
      const ring = resolve(vars['--shadow-focus-ring'], vars).split(',').pop().trim().split(/\s+/).pop();
      const rgb = hex(ring);
      assert.ok(rgb, `${file} ${theme}: could not resolve the ring colour (${ring})`);
      for (const [name, v] of Object.entries(vars)) {
        if (!/^--color-surface-(page|card|raised)$/.test(name)) continue;
        const bg = hex(resolve(v, vars));
        if (!bg) continue;
        const r = ratio(rgb, bg);
        if (r < 3) bad.push(`${theme}: ring ${ring} on ${name} ${resolve(v, vars)} = ${r.toFixed(2)}:1`);
      }
    }
    assert.deepEqual(bad, [], `${file}\n  ${bad.join('\n  ')}`);
  });
}
