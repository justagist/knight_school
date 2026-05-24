/**
 * Render an EvalSnapshot into the compact `engineSummary` string we attach
 * to ScreenContext when Elle is reasoning about a position. Returned exactly
 * as it appears in the prompt - no further formatting needed.
 *
 * Shared between AnalyzeView and the lesson viewer so a consistent block
 * lands in front of the model regardless of context.
 */
export function summarizeEngine(
  snapshot:
    | {
        lines: {
          pvIndex: number;
          scoreCp?: number;
          mate?: number;
          uciMoves: string[];
          depth: number;
        }[];
        depth: number;
      }
    | null,
): string | undefined {
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
