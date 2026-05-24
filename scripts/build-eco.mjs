#!/usr/bin/env node
/**
 * Build src/data/eco.json from Lichess's chess-openings TSVs.
 *
 * Source: https://github.com/lichess-org/chess-openings (CC0).
 * Input  : tmp/eco-a.tsv … tmp/eco-e.tsv (or override via argv[2..6]).
 * Output : src/data/eco.json - a position-keyed map for offline opening lookup.
 *
 * Key format: normalized FEN (position + side-to-move + castling + en-passant,
 * dropping the halfmove + fullmove counters so transpositions collapse).
 *
 * Conflict resolution: when two rows produce the same key, prefer the entry
 * with the longer name (more specific variation wins).
 *
 * Run once (already wired through `npm run build:eco`), commit the resulting
 * JSON. No runtime TSV parsing in the browser - keeps cold-start cheap.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const DEFAULT_INPUTS = ['a', 'b', 'c', 'd', 'e'].map((s) => `/tmp/eco-${s}.tsv`);
const INPUTS = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_INPUTS;
const OUTPUT = resolve(ROOT, 'src/data/eco.json');

/** Drop halfmove + fullmove counters from a FEN. */
function normalizeFen(fen) {
  return fen.split(' ').slice(0, 4).join(' ');
}

function parseTsv(path) {
  const raw = readFileSync(path, 'utf8');
  const lines = raw.split('\n');
  // First line is the header: eco\tname\tpgn.
  return lines
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [eco, name, pgn] = line.split('\t');
      return { eco, name, pgn };
    });
}

function playToEpds(pgn) {
  const chess = new Chess();
  // chess.js wants either move-by-move or `loadPgn`. loadPgn handles
  // formatted strings like "1. e4 e5 2. Nf3" fine.
  try {
    chess.loadPgn(pgn, { strict: false });
  } catch {
    return null;
  }
  // We want the EPD of the FINAL position after the line. Variations are
  // handled by treating each TSV row as one terminal position.
  return normalizeFen(chess.fen());
}

const out = Object.create(null);
let rowCount = 0;
let skipCount = 0;

for (const path of INPUTS) {
  for (const { eco, name, pgn } of parseTsv(path)) {
    rowCount++;
    const epd = playToEpds(pgn);
    if (!epd) {
      skipCount++;
      continue;
    }
    const existing = out[epd];
    // More specific (longer) name wins on transposition.
    if (!existing || name.length > existing.name.length) {
      out[epd] = { eco, name };
    }
  }
}

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, JSON.stringify(out));

const positions = Object.keys(out).length;
const bytes = JSON.stringify(out).length;
console.log(
  `eco.json: ${positions} positions from ${rowCount} rows (${skipCount} skipped) - ${(
    bytes / 1024
  ).toFixed(0)} KB`,
);
