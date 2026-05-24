import type { DrawShape } from '@lichess-org/chessground/draw';
import type { Key } from '@lichess-org/chessground/types';
import { MOVE_CLASS_STYLES, type MoveClass } from '../analysis/classify';

/**
 * Map a MoveClass to a CSS color suitable for an inline SVG fill/stroke.
 * Kept near MOVE_CLASS_STYLES so the two stay visually consistent.
 */
const CLASSIFICATION_COLOR: Record<MoveClass, string> = {
  opening: '#0ea5e9', // sky-500 - temporary first-6-moves fallback
  book: '#0284c7', // sky-600 - reserved for Step 7 Lichess Explorer
  best: '#10b981', // emerald-500
  good: '#94a3b8', // slate-400 - rarely shown, defensive default
  inaccuracy: '#d97706', // amber-600
  mistake: '#ea580c', // orange-600
  blunder: '#dc2626', // red-600
};

/**
 * Build a chessground decoration shape for the most recent move's
 * classification: a small filled circle in the top-right corner of the
 * destination square, with the classification's glyph stamped inside.
 *
 * Returns an empty array when there's nothing to draw (no last move, or no
 * classification available yet because analysis hasn't reached that ply).
 *
 * Chessground places `customSvg` in the board's coordinate space; we set
 * `center: 'dest'` so the SVG is anchored to the move's destination square.
 * The viewBox is the same 100x100 unit chessground uses for squares.
 */
export function buildClassificationShapes(
  lastMove: [string, string] | undefined,
  klass: MoveClass | null,
): DrawShape[] {
  if (!lastMove || !klass) return [];
  // 'good' is intentionally silent on the board - matches the move list.
  // 'opening' is also silent on the board: a sky-blue dot on every move of
  // the first 6 moves would clutter the board for no signal. The move list
  // still shows the ○ glyph so the user can see *why* it's not classified.
  if (klass === 'good' || klass === 'opening') return [];
  const style = MOVE_CLASS_STYLES[klass];
  const color = CLASSIFICATION_COLOR[klass];
  // viewBox 0 0 100 100. Circle in the upper-right corner of the square.
  // cx/cy positioned so the badge sits about 18 units inset from the edge.
  const text = style.glyph || '·';
  const fontSize = text.length > 1 ? 22 : 28;
  const html = `
    <g>
      <circle cx="80" cy="20" r="14" fill="${color}" stroke="white" stroke-width="2" />
      <text x="80" y="20" text-anchor="middle" dominant-baseline="central"
            fill="white" font-family="system-ui, sans-serif"
            font-weight="700" font-size="${fontSize}">${escapeXml(text)}</text>
    </g>
  `.trim();
  return [
    {
      orig: lastMove[1] as Key,
      brush: 'paleGrey',
      customSvg: { html, center: 'orig' },
    },
  ];
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
