import { Chess } from 'chess.js';
import type { ParsedGame } from '../lib/pgn';
import type { ExplorationMove } from './useExploration';

export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q';

/** Standard chess material values. King is omitted — uncapturable. */
const PIECE_VALUE: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };

/** Render order in the captured-pieces strip: smallest → largest. */
const ORDER: PieceType[] = ['p', 'n', 'b', 'r', 'q'];

export interface CaptureSummary {
  /** Black pieces captured by White (display next to White's name). */
  whiteCaptured: PieceType[];
  /** White pieces captured by Black (display next to Black's name). */
  blackCaptured: PieceType[];
  /** Total material points each side has captured from the other. */
  whiteMaterial: number;
  blackMaterial: number;
  /** Net advantage (positive = White ahead, negative = Black ahead). */
  materialDelta: number;
}

/**
 * Replay game moves up to `ply` (plus any exploration moves), collecting
 * captures via chess.js's move.captured field. Promotions don't generate
 * spurious captures because chess.js only sets `captured` when a piece is
 * actually taken — so this stays accurate even through pawn promotions.
 *
 * O(ply + explorationMoves.length). Cheap to recompute on every ply tick.
 */
export function summarizeCaptures(
  game: ParsedGame | null,
  ply: number,
  explorationMoves: ExplorationMove[] = [],
): CaptureSummary {
  const whiteCaptured: PieceType[] = [];
  const blackCaptured: PieceType[] = [];
  if (!game) {
    return { whiteCaptured, blackCaptured, whiteMaterial: 0, blackMaterial: 0, materialDelta: 0 };
  }

  let chess: Chess;
  try {
    chess = new Chess(game.startingFen);
  } catch {
    return { whiteCaptured, blackCaptured, whiteMaterial: 0, blackMaterial: 0, materialDelta: 0 };
  }

  const record = (color: 'w' | 'b', piece: string | undefined) => {
    if (!piece) return;
    const p = piece as PieceType;
    if (!(p in PIECE_VALUE)) return;
    if (color === 'w') whiteCaptured.push(p);
    else blackCaptured.push(p);
  };

  for (let i = 0; i < ply && i < game.moves.length; i++) {
    const m = game.moves[i];
    try {
      const result = chess.move({ from: m.from, to: m.to });
      if (result?.captured) record(result.color, result.captured);
    } catch {
      // chess.js rejected — shouldn't happen for replay of a parsed game.
      break;
    }
  }

  for (const m of explorationMoves) {
    try {
      const result = chess.move({
        from: m.uci.slice(0, 2),
        to: m.uci.slice(2, 4),
        promotion: m.uci.length > 4 ? m.uci.slice(4, 5) : undefined,
      });
      if (result?.captured) record(result.color, result.captured);
    } catch {
      break;
    }
  }

  whiteCaptured.sort(orderCmp);
  blackCaptured.sort(orderCmp);

  const whiteMaterial = whiteCaptured.reduce((s, p) => s + PIECE_VALUE[p], 0);
  const blackMaterial = blackCaptured.reduce((s, p) => s + PIECE_VALUE[p], 0);

  return {
    whiteCaptured,
    blackCaptured,
    whiteMaterial,
    blackMaterial,
    materialDelta: whiteMaterial - blackMaterial,
  };
}

function orderCmp(a: PieceType, b: PieceType): number {
  return ORDER.indexOf(a) - ORDER.indexOf(b);
}

/**
 * Unicode glyphs. Captured pieces are displayed in the OPPONENT's color —
 * i.e., Black pieces sit next to the White player's name (those are what
 * White captured), and vice versa.
 */
export const BLACK_PIECE_GLYPH: Record<PieceType, string> = {
  p: '♟',
  n: '♞',
  b: '♝',
  r: '♜',
  q: '♛',
};
export const WHITE_PIECE_GLYPH: Record<PieceType, string> = {
  p: '♙',
  n: '♘',
  b: '♗',
  r: '♖',
  q: '♕',
};
