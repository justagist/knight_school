import { db, type PositionEvalRow } from './db';
import type { EvalSnapshot } from '../engine/types';

/**
 * Read a cached eval for a FEN. Returns undefined on miss.
 *
 * We require the cached row to be at least `minDepth` deep - a shallower
 * cached eval doesn't satisfy a request for deeper analysis.
 */
export async function getPositionEval(
  fen: string,
  opts: { engine: 'lite' | 'full'; minDepth: number },
): Promise<PositionEvalRow | undefined> {
  const row = await db().positionEvals.get(fen);
  if (!row) return undefined;
  if (row.engine !== opts.engine) return undefined;
  if (row.depth < opts.minDepth) return undefined;
  return row;
}

/**
 * Persist a completed eval. Overwrites if FEN already exists.
 * Snapshots from the engine come in EvalSnapshot shape - we adapt.
 */
export async function putPositionEval(
  snapshot: EvalSnapshot,
  engine: 'lite' | 'full',
): Promise<void> {
  const top = snapshot.lines[0];
  const row: PositionEvalRow = {
    fen: snapshot.fen,
    turn: snapshot.turn,
    depth: snapshot.depth,
    bestUci: top?.uciMoves[0],
    scoreCp: top?.scoreCp,
    mate: top?.mate,
    lines: snapshot.lines.map((l) => ({
      pvIndex: l.pvIndex,
      depth: l.depth,
      scoreCp: l.scoreCp,
      mate: l.mate,
      uciMoves: l.uciMoves,
    })),
    completedAt: Date.now(),
    engine,
  };
  await db().positionEvals.put(row);
}

/**
 * Read evals for a list of FENs in one transaction. Missing FENs return
 * undefined at their index. Used by the full-game analysis pass to seed
 * already-cached positions without N round-trips.
 */
export async function getPositionEvals(
  fens: string[],
): Promise<(PositionEvalRow | undefined)[]> {
  if (fens.length === 0) return [];
  const rows = await db().positionEvals.bulkGet(fens);
  return rows;
}

/** Erase all cached evals - backs the Settings "clear all" button later. */
export async function clearAllPositionEvals(): Promise<void> {
  await db().positionEvals.clear();
}
