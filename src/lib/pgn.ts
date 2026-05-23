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
}

export class PgnParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PgnParseError';
  }
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

  const chess = new Chess();
  try {
    chess.loadPgn(trimmed, { strict: false });
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

  return { headers, startingFen, moves, fens };
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
