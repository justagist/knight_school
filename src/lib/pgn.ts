import { Chess, type Move } from 'chess.js';

export interface ParsedMove {
  /** 1-based full-move number (e.g. 1 for both White's and Black's first move) */
  moveNumber: number;
  /** 'w' for White, 'b' for Black */
  color: 'w' | 'b';
  /** Standard algebraic notation, e.g. "Nf3", "exd5", "O-O" */
  san: string;
  /** From square in algebraic notation, e.g. "g1" */
  from: string;
  /** To square in algebraic notation, e.g. "f3" */
  to: string;
  /** FEN of the position AFTER this move was played */
  fenAfter: string;
}

export interface ParsedGame {
  /** PGN headers (Event, Site, Date, White, Black, Result, etc.) */
  headers: Record<string, string>;
  /** Starting position FEN (handles non-standard starts via FEN tag) */
  startingFen: string;
  /** Ordered list of moves in the main line */
  moves: ParsedMove[];
  /** FENs[0] is the starting position; FENs[i] is the position AFTER move i-1 */
  fens: string[];
  /**
   * Author comments keyed by ply, parallel to {@link fens}. `comments[0]` is
   * the comment shown before move 1 (the introduction). `comments[i]` is the
   * comment for the position AFTER move i was played. `undefined` when no
   * comment is attached to that ply. Lichess study / annotated game PGNs use
   * this heavily — the Openings lesson viewer surfaces the current ply's
   * comment so the user can read along.
   */
  comments: (string | undefined)[];
}

export class PgnParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PgnParseError';
  }
}

/**
 * Sanitize a PGN before passing it to chess.js v1.4.x. Three problems Lichess
 * study exports introduce:
 *
 *  1. **Annotation-only comments** — `{ [%csl Ge4][%cal Ge2e4] }` — board
 *     decorations the viewer doesn't render. Drop them entirely.
 *  2. **Inline `[%xxx ...]` markers** inside otherwise-textual comments — also
 *     not rendered; strip the markers but keep the surrounding author text.
 *  3. **Adjacent `{...}{...}` comments** — chess.js v1.4 throws on these
 *     even though they're valid PGN. After step 1 fewer remain, but we
 *     still merge any leftover pair by replacing the `}` ... `{` boundary
 *     with whitespace. Iterate until stable for `} { } {` chains.
 *
 * The remaining comments are clean author text that `chess.getComments()`
 * returns directly.
 */
function sanitizePgnForChessJs(pgn: string): string {
  // (1) Annotation-only comments.
  let result = pgn.replace(/\{\s*(?:\[%[^\]]*\]\s*)+\}/g, '');
  // (2) Inline annotation markers inside mixed comments.
  result = result.replace(/\[%[^\]]*\]/g, '');
  // (3) Adjacent comments.
  let prev: string;
  do {
    prev = result;
    result = result.replace(/\}\s*\{/g, ' ');
  } while (result !== prev);
  return result;
}

/**
 * Clean up a single comment string returned by `chess.getComments()`: trim,
 * collapse runs of whitespace into single spaces, and return undefined when
 * the result is empty (so the viewer can hide the comment panel cleanly).
 */
function cleanComment(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

/**
 * Parse a PGN string into a structured ParsedGame.
 *
 * Notes:
 * - Only the main line is parsed. Variations/sidelines are ignored.
 * - Non-standard starts (FEN tag) are respected.
 * - Throws PgnParseError on invalid PGN.
 */
export function parsePgn(pgn: string): ParsedGame {
  const trimmed = pgn.trim();
  if (!trimmed) throw new PgnParseError('PGN is empty.');

  const sanitized = sanitizePgnForChessJs(trimmed);
  const chess = new Chess();
  try {
    chess.loadPgn(sanitized, { strict: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new PgnParseError(`Invalid PGN: ${message}`);
  }

  const rawHeaders = chess.header();
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawHeaders)) {
    if (v != null) headers[k] = v;
  }

  const history = chess.history({ verbose: true }) as Move[];

  // Author comments keyed by the FEN they're attached to. chess.js's
  // getComments() returns one entry per commented position.
  const commentByFen = new Map<string, string>();
  for (const c of chess.getComments() as Array<{ fen: string; comment: string }>) {
    const clean = cleanComment(c.comment);
    if (clean) commentByFen.set(c.fen, clean);
  }

  // Determine starting position. chess.js exposes the FEN tag through headers.
  const startingFen = headers.FEN ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  // Replay from the start to capture FENs at each ply.
  const replay = new Chess(startingFen);
  const fens: string[] = [replay.fen()];
  const moves: ParsedMove[] = [];

  for (const m of history) {
    const before = replay.fen();
    // moveNumber comes from the FEN that produced this move (the position before).
    const fmIndex = before.split(' ')[5];
    const moveNumber = Number.parseInt(fmIndex, 10);
    replay.move({ from: m.from, to: m.to, promotion: m.promotion });
    const fenAfter = replay.fen();
    moves.push({
      moveNumber: Number.isFinite(moveNumber) ? moveNumber : 0,
      color: m.color,
      san: m.san,
      from: m.from,
      to: m.to,
      fenAfter,
    });
    fens.push(fenAfter);
  }

  const comments = fens.map((f) => commentByFen.get(f));

  return { headers, startingFen, moves, fens, comments };
}

/**
 * Return display label for the headers in "White vs Black, Event, Date" form.
 * Falls back gracefully if some headers are missing.
 */
export function gameLabel(headers: Record<string, string>): string {
  const w = headers.White || 'White';
  const b = headers.Black || 'Black';
  const event = headers.Event && headers.Event !== '?' ? headers.Event : '';
  const date = headers.Date && headers.Date !== '????.??.??' ? headers.Date : '';
  const tail = [event, date].filter(Boolean).join(' · ');
  return tail ? `${w} vs ${b} — ${tail}` : `${w} vs ${b}`;
}
