export type EngineVariant = 'lite' | 'full';

/**
 * A single evaluated line from a multi-PV search.
 *
 * `score` is from the side-to-move's perspective in centipawns.
 * Positive = side-to-move is winning. UI flips it as needed.
 *
 * `mate` (when present) means a forced mate is detected in N moves
 * (positive = side-to-move mates; negative = side-to-move gets mated).
 */
export interface PvLine {
  /** 1-indexed PV ordinal (1 = best line) */
  pvIndex: number;
  /** Engine search depth that produced this line */
  depth: number;
  /** Centipawn score from side-to-move's perspective; undefined if mate is set */
  scoreCp?: number;
  /** Mate distance (in moves); positive = side-to-move mates */
  mate?: number;
  /** UCI move list, e.g. ["e2e4", "e7e5"] */
  uciMoves: string[];
  /** Engine nodes per second (last reported) */
  nps?: number;
  /** Total nodes searched */
  nodes?: number;
  /** Wall-clock time in ms reported by engine */
  timeMs?: number;
}

export interface EvalSnapshot {
  /** The FEN this evaluation is for */
  fen: string;
  /** Side to move: 'w' or 'b' */
  turn: 'w' | 'b';
  /** Whose-turn perspective. Same as turn - kept for clarity at call sites. */
  perspective: 'w' | 'b';
  /** Top N PV lines, sorted by pvIndex ascending */
  lines: PvLine[];
  /** Highest depth across the lines (engines may report uneven depths transiently) */
  depth: number;
  /** True when the engine has emitted bestmove for this position */
  finished: boolean;
}
