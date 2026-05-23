import { BLACK_PIECE_GLYPH, WHITE_PIECE_GLYPH, type PieceType } from './captures';

interface PlayerStripProps {
  /** Player name pulled from PGN headers; falls back if missing. */
  name: string | undefined;
  /** 'white' or 'black' — controls which piece glyphs to render. */
  side: 'white' | 'black';
  /** Pieces this player has captured from the opponent. */
  captured: PieceType[];
  /** Net material advantage for this side (always ≥ 0; 0 hides the badge). */
  advantage: number;
}

/**
 * Compact strip above / below the board: player name on the left, captured-
 * piece icons in the middle, "+N" material badge on the right when this
 * player is ahead. Style mirrors chess.com / lichess's analysis layout.
 *
 * Captured icons use the OPPONENT'S color: this player has won those pieces.
 */
export function PlayerStrip({ name, side, captured, advantage }: PlayerStripProps) {
  // We're showing the captured pieces (opponent's color).
  const glyphs = side === 'white' ? BLACK_PIECE_GLYPH : WHITE_PIECE_GLYPH;
  const label = (name && name.trim()) || (side === 'white' ? 'White' : 'Black');
  return (
    <div className="mx-auto flex w-full max-w-[min(90vh,920px)] items-center justify-between gap-2 px-1 py-1 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate font-medium">{label}</span>
        {captured.length > 0 && (
          <span
            className="select-none whitespace-nowrap text-[18px] leading-none text-ink-700 dark:text-ink-200"
            aria-label={`Captured: ${captured.length} piece${captured.length === 1 ? '' : 's'}`}
          >
            {captured.map((p, i) => (
              <span key={`${p}-${i}`}>{glyphs[p]}</span>
            ))}
          </span>
        )}
      </div>
      {advantage > 0 && (
        <span
          className="rounded bg-ink-200 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-ink-700 dark:bg-ink-800 dark:text-ink-200"
          title="Material advantage in points"
        >
          +{advantage}
        </span>
      )}
    </div>
  );
}
