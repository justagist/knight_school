import { Chess } from 'chess.js';
import type { PositionEvalRow } from '../db/db';
import type { EvalSnapshot } from '../engine/types';

/**
 * If `fen` is a terminal position (no legal moves), return a synthetic
 * EvalSnapshot the UI can render without bothering the engine. Otherwise null.
 *
 * Used by both the interactive useEngine hook and the batch
 * useGameAnalysis runner — Stockfish.wasm's classical build can hang on
 * mated positions, and even when it doesn't there's no real analysis to do.
 *
 * For checkmate, mate=0 means "side-to-move IS mated" — i.e. the loser
 * is whoever's turn it is.
 */
export function terminalSnapshot(fen: string): EvalSnapshot | null {
  let game: Chess;
  try {
    game = new Chess(fen);
  } catch {
    return null;
  }
  const turn = game.turn() as 'w' | 'b';
  if (game.isCheckmate()) {
    return {
      fen,
      turn,
      perspective: turn,
      depth: 0,
      finished: true,
      lines: [{ pvIndex: 1, depth: 0, mate: 0, uciMoves: [] }],
    };
  }
  if (game.isStalemate() || game.isInsufficientMaterial() || game.isDraw()) {
    return {
      fen,
      turn,
      perspective: turn,
      depth: 0,
      finished: true,
      lines: [{ pvIndex: 1, depth: 0, scoreCp: 0, uciMoves: [] }],
    };
  }
  return null;
}

/**
 * Persist-shaped variant for the analysis cache. Returns a PositionEvalRow
 * (which Dexie can also store) or null if non-terminal.
 */
export function terminalEvalRow(
  fen: string,
  engine: 'lite' | 'full',
): PositionEvalRow | null {
  const snap = terminalSnapshot(fen);
  if (!snap) return null;
  const top = snap.lines[0];
  return {
    fen: snap.fen,
    turn: snap.turn,
    depth: 0,
    bestUci: undefined,
    scoreCp: top?.scoreCp,
    mate: top?.mate,
    lines: snap.lines.map((l) => ({
      pvIndex: l.pvIndex,
      depth: l.depth,
      scoreCp: l.scoreCp,
      mate: l.mate,
      uciMoves: l.uciMoves,
    })),
    completedAt: Date.now(),
    engine,
  };
}
