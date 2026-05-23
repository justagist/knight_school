#!/usr/bin/env node
// Copies the Stockfish (Lite) WASM build from node_modules into public/engine/
// so it ships at /engine/stockfish.{js,wasm,worker.js} for the page to fetch.
// Runs as a postinstall step; safe to re-run.

import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const src = resolve(root, 'node_modules', 'stockfish.wasm');
const dst = resolve(root, 'public', 'engine');

const FILES = ['stockfish.js', 'stockfish.wasm', 'stockfish.worker.js'];

if (!existsSync(src)) {
  // Dependency not installed (e.g. during `npm ci --omit=optional`); skip.
  process.exit(0);
}

mkdirSync(dst, { recursive: true });

for (const f of FILES) {
  const from = resolve(src, f);
  const to = resolve(dst, f);
  if (!existsSync(from)) {
    // eslint-disable-next-line no-console
    console.warn(`[copy-engine] missing ${from}; skipping`);
    continue;
  }
  copyFileSync(from, to);
  // eslint-disable-next-line no-console
  console.log(`[copy-engine] ${f} -> public/engine/`);
}
