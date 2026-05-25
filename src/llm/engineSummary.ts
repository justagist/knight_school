import type { PositionEvalRow } from '../db/db';

interface SummaryShape {
  lines: {
    pvIndex: number;
    scoreCp?: number;
    mate?: number;
    uciMoves: string[];
    depth: number;
  }[];
  depth: number;
}

/**
 * Render an EvalSnapshot (or a cached PositionEvalRow) into the compact
 * `engineSummary` string Elle reads when reasoning about a position.
 *
 * Shared between AnalyzeView, the lesson viewer, and drill chat so the
 * top-3 PV block lands in a consistent shape regardless of whether the
 * eval came from a live engine snapshot or the Dexie cache.
 */
export function summarizeEngine(snapshot: SummaryShape | null): string | undefined {
  if (!snapshot || snapshot.lines.length === 0) return undefined;
  const lines = snapshot.lines.slice(0, 3).map((l) => {
    const score =
      l.mate != null
        ? `M${l.mate}`
        : l.scoreCp != null
          ? `${(l.scoreCp / 100).toFixed(2)}`
          : '-';
    const pv = l.uciMoves.slice(0, 6).join(' ');
    return `  PV${l.pvIndex}: ${score}  ${pv}`;
  });
  return `Depth ${snapshot.depth} - top lines:\n${lines.join('\n')}`;
}

/** Same string format from a cached Dexie row. Used by surfaces that
 *  don't run a live engine (drill chat) but want the eval if a row
 *  for the FEN already exists in `positionEvals`. */
export function summarizeEngineFromRow(row: PositionEvalRow | undefined): string | undefined {
  if (!row) return undefined;
  return summarizeEngine({ lines: row.lines, depth: row.depth });
}
