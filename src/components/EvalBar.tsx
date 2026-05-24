import type { EvalSnapshot } from '../engine/types';
import { formatScore, scoreToWhiteShare } from '../engine/format';

interface EvalBarProps {
  snapshot: EvalSnapshot | null;
  /** Board orientation; when 'black' we flip the bar visually. */
  orientation: 'white' | 'black';
  analyzing: boolean;
  /** Show eval + depth caption above and below the bar. */
  showCaption?: boolean;
}

/**
 * Vertical evaluation bar. White-advantage fills from the side facing the
 * viewer (bottom when oriented white, top when oriented black).
 *
 * Layout when caption is on:
 *   ┌──────┐
 *   │ +1.2 │  ← eval label, colour-coded (green = white better, red = black
 *   │      │    better, gray near zero), big and bold
 *   │ ████ │
 *   │ ████ │  ← bar with a 0.0 midpoint tick + a small triangle marker
 *   │ ████ │    at the current eval level
 *   │ ████ │
 *   │ ░░░░ │
 *   │  d18 │  ← depth, small + muted
 *   └──────┘
 */
export function EvalBar({ snapshot, orientation, analyzing, showCaption = true }: EvalBarProps) {
  const top = snapshot?.lines[0];
  const turn = snapshot?.turn ?? 'w';
  const whiteShare = scoreToWhiteShare(top, turn);
  const scoreLabel = formatScore(top, turn, 'w');
  const whiteHeightPct = whiteShare * 100;

  // Colour the eval label by who's winning. Threshold ±0.20 - anything
  // inside is "near zero" and stays muted so the user doesn't read a noisy
  // +0.05 as a meaningful white edge. Uses the move-classification tokens
  // so the eval bar matches the move list's colour language: green = best
  // (white better), red = blunder (black better).
  const numeric = parsePawnish(scoreLabel);
  const colorClass =
    numeric == null
      ? 'text-muted'
      : numeric > 0.2
        ? 'text-best'
        : numeric < -0.2
          ? 'text-blunder'
          : 'text-muted';

  // Marker position (% from top) so the user sees where the bar is currently
  // filled - handy because the bar transitions can be subtle.
  const markerPct = orientation === 'white' ? 100 - whiteHeightPct : whiteHeightPct;

  return (
    <div className="flex h-full w-full flex-col items-center gap-1" aria-label="Engine evaluation">
      {showCaption && (
        <div className={`text-[11px] font-semibold tabular-nums ${colorClass}`} title={scoreLabel}>
          {scoreLabel}
        </div>
      )}
      <div
        className={`relative w-full max-w-[20px] flex-1 overflow-hidden rounded-sm border border-ink-300 dark:border-ink-700 ${
          analyzing ? 'opacity-90' : ''
        }`}
        style={{ minHeight: 0 }}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(whiteHeightPct)}
        aria-valuetext={scoreLabel}
        title={scoreLabel}
      >
        {/* Black half (top) */}
        <div className="absolute inset-0 bg-ink-900 dark:bg-ink-950" />
        {/* White half (size = whiteShare) */}
        <div
          className="absolute inset-x-0 bg-ink-100 dark:bg-ink-200 transition-[height] duration-200"
          style={{
            bottom: orientation === 'white' ? 0 : undefined,
            top: orientation === 'black' ? 0 : undefined,
            height: `${whiteHeightPct}%`,
          }}
        />
        {/* 0.0 midpoint tick - thin line straddling the boundary. */}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-ink-500/60 dark:bg-ink-400/60" />
        {/* Current-eval marker (small triangle pointing into the bar from the
            white-advantage side). Position derived from the share so it
            tracks the boundary between the two halves. */}
        <div
          className="pointer-events-none absolute left-1/2 -translate-x-1/2"
          style={{ top: `${markerPct}%`, transform: 'translate(-50%, -50%)' }}
        >
          <span
            className="block h-1.5 w-1.5 rotate-45 bg-accent shadow"
            aria-hidden="true"
          />
        </div>
        {/* Subtle pulse overlay while Stockfish is computing - signals work
            is happening so the user doesn't think the bar is frozen. */}
        {analyzing && (
          <div className="pointer-events-none absolute inset-0 animate-pulse bg-accent/10" aria-hidden="true" />
        )}
      </div>
      {showCaption && (
        <div className="text-[10px] tabular-nums text-ink-500 dark:text-ink-400">
          {snapshot && snapshot.depth > 0 ? (
            <>d{snapshot.depth}{analyzing ? '…' : ''}</>
          ) : (
            <>&nbsp;</>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Parse the score label back into a pawn number for colour decisions. The
 * formatter outputs things like `+1.23`, `−0.50`, `M5`, `-`. Mate scores
 * saturate to ±10 so they pick up the colour without nudging contrast logic
 * elsewhere.
 */
function parsePawnish(label: string): number | null {
  const trimmed = label.trim().replace(/^\+/, '');
  if (!trimmed || trimmed === '-') return null;
  if (trimmed.startsWith('M')) return 10;
  if (trimmed.startsWith('-M') || trimmed.startsWith('−M')) return -10;
  // Allow unicode minus from the formatter.
  const normalized = trimmed.replace(/^[−–]/, '-');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
