import type { PvLine } from './types';

/**
 * Render a PvLine's score as a short label, e.g. "+0.34", "-1.20", "M5", "-M2".
 * Score is from the perspective of `perspective` ('w' or 'b').
 *
 * Engine reports score from side-to-move's POV. To get white's POV, negate when
 * side-to-move is black.
 */
export function formatScore(line: PvLine | undefined, sideToMove: 'w' | 'b', perspective: 'w' | 'b' = 'w'): string {
  if (!line) return '-';
  const flip = sideToMove !== perspective;

  if (line.mate != null) {
    const m = flip ? -line.mate : line.mate;
    if (m === 0) return '#';
    return `${m > 0 ? '' : '-'}M${Math.abs(m)}`;
  }
  if (line.scoreCp == null) return '-';
  const cp = flip ? -line.scoreCp : line.scoreCp;
  const pawns = cp / 100;
  const sign = pawns > 0 ? '+' : pawns < 0 ? '−' : '';
  return `${sign}${Math.abs(pawns).toFixed(2)}`;
}

/**
 * Map a score to a "white-winning %" between 0 and 1.
 * Used for visualising the eval bar.
 */
export function scoreToWhiteShare(line: PvLine | undefined, sideToMove: 'w' | 'b'): number {
  if (!line) return 0.5;
  if (line.mate != null) {
    const matedSide = (line.mate > 0 ? sideToMove : sideToMove === 'w' ? 'b' : 'w');
    return matedSide === 'w' ? 0.98 : 0.02;
  }
  if (line.scoreCp == null) return 0.5;
  const cp = sideToMove === 'w' ? line.scoreCp : -line.scoreCp;
  // Lichess-style soft saturation; ±1000 cp ≈ near total
  const pawns = cp / 100;
  const x = Math.tanh(pawns / 4); // -1..+1
  return Math.max(0.02, Math.min(0.98, 0.5 + 0.48 * x));
}
