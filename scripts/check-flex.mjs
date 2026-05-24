#!/usr/bin/env node
/**
 * Catches Tailwind classnames that use flex/grid layout modifiers
 * (`flex-col`, `items-*`, `justify-*`, `gap-*`, `flex-wrap`, etc.) on an
 * element that doesn't actually declare `flex` / `inline-flex` / `grid` /
 * `inline-grid` as a display. Those modifiers are silently inert without
 * a display, which is how the DrillSetupModal landed with a layout that
 * looked right in source but rendered without spacing.
 *
 * Heuristic: scan every `className="..."` string + every tagged template
 * argument, tokenize on whitespace, and check each token. Multi-line
 * className strings handled by joining all whitespace.
 *
 * The script reports the first failure per file with line + offending
 * classname string, then exits non-zero. Runs as part of `npm run check`.
 */
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.argv[2] ?? 'src';

// Parent-side layout modifiers - these only work when the SAME element
// also declares `flex` / `inline-flex` / `grid` / `inline-grid`.
//
// Excluded on purpose: `self-*`, `justify-self-*`, `place-self-*`. Those
// are child-side properties (CSS `align-self`, `justify-self`); they
// work even when the child itself has no flex/grid display - only the
// PARENT needs the display. So a button with `self-start` inside a flex
// container is correct, not a bug.
const MODIFIER_RE =
  /^(?:flex-(?:col|row|wrap|nowrap|col-reverse|row-reverse)|items-(?:start|end|center|baseline|stretch)|justify-(?:start|end|center|between|around|evenly|stretch|normal)|justify-items-\w+|gap-[\w./[\]-]+|gap-x-[\w./[\]-]+|gap-y-[\w./[\]-]+|place-(?:items|content)-\w+|content-(?:start|end|center|between|around|evenly|stretch))$/;

const DISPLAY_TOKENS = new Set([
  'flex',
  'inline-flex',
  'grid',
  'inline-grid',
  // `contents` lets children participate in parent's flex/grid layout;
  // accept it as a valid "flex-friendly" display.
  'contents',
]);

const ALLOW_ON_NON_FLEX = new Set([
  // `gap-*` works on space-* utilities too in some Tailwind setups, but
  // we don't use those. Add explicit allowlist entries here if a false
  // positive turns up.
]);

let failures = 0;

function stripPrefix(token) {
  // `md:flex-col` → `flex-col`. Tailwind allows nested prefixes
  // (`dark:md:flex-col`) - strip them all.
  while (true) {
    const m = token.match(/^[a-z0-9-]+:/);
    if (!m) return token;
    token = token.slice(m[0].length);
  }
}

function checkClassValue(value, file, lineNumber) {
  if (!value || ALLOW_ON_NON_FLEX.has(value)) return;
  const tokens = value.split(/\s+/).filter(Boolean);
  const stripped = tokens.map(stripPrefix);
  const hasDisplay = stripped.some((t) => DISPLAY_TOKENS.has(t));
  if (hasDisplay) return;
  const offenders = stripped.filter((t) => MODIFIER_RE.test(t));
  if (offenders.length === 0) return;
  failures++;
  process.stderr.write(
    `${file}:${lineNumber}\n  className="${value}"\n  offending: ${[...new Set(offenders)].join(', ')}\n  fix: add \`flex\`, \`inline-flex\`, \`grid\`, or \`inline-grid\` (with the right responsive prefix) on the same element.\n\n`,
  );
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      yield* walk(p);
    } else if (/\.(tsx|jsx)$/.test(name)) {
      yield p;
    }
  }
}

const CLASSNAME_RE = /className\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*`([^`]*)`\s*\})/g;

for (const file of walk(ROOT)) {
  const src = readFileSync(file, 'utf8');
  let m;
  // Reset regex state for each file.
  CLASSNAME_RE.lastIndex = 0;
  while ((m = CLASSNAME_RE.exec(src)) !== null) {
    const value = m[1] ?? m[2] ?? m[3];
    if (!value) continue;
    const before = src.slice(0, m.index);
    const line = before.split('\n').length;
    // Collapse newlines + collapse multiple spaces - same as the JSX
    // runtime does when rendering the className string.
    const flat = value.replace(/\s+/g, ' ').trim();
    checkClassValue(flat, file, line);
  }
}

if (failures > 0) {
  process.stderr.write(`\n${failures} flex/grid-modifier violation(s) found.\n`);
  process.exit(1);
}
