/**
 * Minimal bundled opening "book" — generated lazily at module load.
 *
 * The spec calls for ECO/opening-name lookup "bundled, never networked." We're
 * starting small: hand-curated mainlines of the most common openings, each a
 * sequence of SAN moves played on a fresh Chess() instance, then storing each
 * resulting position FEN in a Set for O(1) membership testing.
 *
 * "book" classification is simply: position FEN ∈ this set. Lines below cover
 * roughly the first 4-8 plies of every popular White & Black system. Add more
 * as needed — each line takes one row.
 *
 * Source for line selection: standard public-domain opening theory. No
 * proprietary content. If we want full ECO coverage later, swap this for a
 * bundled ECO TSV import.
 *
 * FEN normalization: we drop the halfmove and fullmove counters (last two
 * fields). Two games can reach the same opening position by transposition
 * even when move counts differ, and `book`-ness shouldn't care.
 */

import { Chess } from 'chess.js';

const OPENING_LINES: string[] = [
  // === Open games (1.e4 e5) ===
  '1.e4 e5',
  '1.e4 e5 2.Nf3',
  '1.e4 e5 2.Nf3 Nc6',
  '1.e4 e5 2.Nf3 Nc6 3.Bb5', // Ruy Lopez
  '1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Ba4',
  '1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Ba4 Nf6 5.O-O',
  '1.e4 e5 2.Nf3 Nc6 3.Bc4', // Italian
  '1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5',
  '1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.c3',
  '1.e4 e5 2.Nf3 Nc6 3.Bc4 Nf6',
  '1.e4 e5 2.Nf3 Nc6 3.d4', // Scotch
  '1.e4 e5 2.Nf3 Nc6 3.Nc3', // Vienna-ish via three knights
  '1.e4 e5 2.Nf3 Nf6', // Petroff
  '1.e4 e5 2.Nf3 Nf6 3.Nxe5',
  '1.e4 e5 2.f4', // King's Gambit
  '1.e4 e5 2.f4 exf4',
  '1.e4 e5 2.Nc3', // Vienna
  // === Sicilian ===
  '1.e4 c5',
  '1.e4 c5 2.Nf3',
  '1.e4 c5 2.Nf3 d6',
  '1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3', // Open Sicilian
  '1.e4 c5 2.Nf3 Nc6',
  '1.e4 c5 2.Nf3 e6',
  '1.e4 c5 2.Nc3', // Closed
  '1.e4 c5 2.c3', // Alapin
  // === French ===
  '1.e4 e6',
  '1.e4 e6 2.d4 d5',
  '1.e4 e6 2.d4 d5 3.Nc3 Nf6',
  '1.e4 e6 2.d4 d5 3.Nd2', // Tarrasch
  '1.e4 e6 2.d4 d5 3.e5', // Advance
  '1.e4 e6 2.d4 d5 3.exd5', // Exchange
  // === Caro-Kann ===
  '1.e4 c6',
  '1.e4 c6 2.d4 d5',
  '1.e4 c6 2.d4 d5 3.Nc3 dxe4 4.Nxe4',
  '1.e4 c6 2.d4 d5 3.exd5 cxd5', // Exchange
  '1.e4 c6 2.d4 d5 3.e5', // Advance
  // === Pirc / Modern / Alekhine ===
  '1.e4 d6',
  '1.e4 d6 2.d4 Nf6',
  '1.e4 g6',
  '1.e4 Nf6', // Alekhine
  '1.e4 Nf6 2.e5 Nd5',
  // === Scandinavian ===
  '1.e4 d5',
  '1.e4 d5 2.exd5 Qxd5',
  '1.e4 d5 2.exd5 Nf6',
  // === Closed games (1.d4) ===
  '1.d4 d5',
  '1.d4 d5 2.c4', // Queen's Gambit
  '1.d4 d5 2.c4 e6', // QGD
  '1.d4 d5 2.c4 e6 3.Nc3 Nf6',
  '1.d4 d5 2.c4 e6 3.Nf3 Nf6',
  '1.d4 d5 2.c4 c6', // Slav
  '1.d4 d5 2.c4 dxc4', // QGA
  '1.d4 d5 2.Nf3 Nf6',
  '1.d4 d5 2.Bf4', // London
  '1.d4 d5 2.Bf4 Nf6 3.e3',
  '1.d4 d5 2.Nf3 Nf6 3.Bf4', // London via Nf3
  // === Indian defenses ===
  '1.d4 Nf6',
  '1.d4 Nf6 2.c4',
  '1.d4 Nf6 2.c4 e6', // Nimzo / QID setup
  '1.d4 Nf6 2.c4 e6 3.Nc3 Bb4', // Nimzo
  '1.d4 Nf6 2.c4 e6 3.Nf3', // QID setup
  '1.d4 Nf6 2.c4 g6', // KID/Gruenfeld
  '1.d4 Nf6 2.c4 g6 3.Nc3 Bg7',
  '1.d4 Nf6 2.c4 g6 3.Nc3 d5', // Gruenfeld
  // === Other 1.* ===
  '1.Nf3',
  '1.Nf3 d5', // Reti
  '1.Nf3 Nf6',
  '1.c4', // English
  '1.c4 e5',
  '1.c4 c5',
  '1.c4 Nf6',
  '1.b3', // Larsen
  '1.f4', // Bird
  '1.g3',
  // === Sundry English defenses ===
  '1.d4 f5', // Dutch
  '1.d4 e6',
  '1.d4 c5',
];

let CACHE: Set<string> | null = null;

function buildOpeningSet(): Set<string> {
  const set = new Set<string>();
  // Always include the starting position so move 1 of any game registers as book.
  const start = new Chess();
  set.add(normalizeFen(start.fen()));

  for (const line of OPENING_LINES) {
    const chess = new Chess();
    try {
      chess.loadPgn(line, { strict: false });
    } catch {
      continue;
    }
    const history = chess.history({ verbose: true });
    const replay = new Chess();
    set.add(normalizeFen(replay.fen()));
    for (const move of history) {
      replay.move({ from: move.from, to: move.to, promotion: move.promotion });
      set.add(normalizeFen(replay.fen()));
    }
  }
  return set;
}

/**
 * Drop halfmove + fullmove counters from a FEN — same position by transposition
 * should match even with different move counts.
 */
export function normalizeFen(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

/** O(1) membership test for "is this position in the bundled opening book." */
export function isBookPosition(fen: string): boolean {
  if (!CACHE) CACHE = buildOpeningSet();
  return CACHE.has(normalizeFen(fen));
}
