import type { EvalSnapshot } from '../engine/types';
import { formatScore, scoreToWhiteShare } from '../engine/format';

interface EvalBarProps {
  snapshot: EvalSnapshot | null;
  /** Board orientation; when 'black' we flip the bar visually. */
  orientation: 'white' | 'black';
  analyzing: boolean;
  /** Show a depth/nps caption underneath. */
  showCaption?: boolean;
}

export function EvalBar({ snapshot, orientation, analyzing, showCaption = true }: EvalBarProps) {
  const top = snapshot?.lines[0];
  const turn = snapshot?.turn ?? 'w';
  const whiteShare = scoreToWhiteShare(top, turn);
  const scoreLabel = formatScore(top, turn, 'w');

  // Bar is vertical. Top portion is whoever the orientation favors visually.
  // For 'white' orientation: top of bar = black; bottom = white.
  // The "white-winning" portion fills from the bottom up.
  // For 'black' orientation: we invert.
  const whiteHeightPct = whiteShare * 100;

  return (
    <div className="flex h-full flex-col items-center gap-1" aria-label="Engine evaluation">
      <div
        className={`relative w-3 flex-1 overflow-hidden rounded-sm border border-ink-300 dark:border-ink-700 ${
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
        {/* White half (bottom; height = whiteShare) */}
        <div
          className="absolute inset-x-0 bg-ink-100 dark:bg-ink-200 transition-[height] duration-200"
          style={{
            bottom: orientation === 'white' ? 0 : undefined,
            top: orientation === 'black' ? 0 : undefined,
            height: `${whiteHeightPct}%`,
          }}
        />
        {/* Center tick */}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-ink-500/60 dark:bg-ink-400/60" />
      </div>
      {showCaption && (
        <div className="min-h-[1rem] text-center text-[11px] leading-tight tabular-nums text-ink-700 dark:text-ink-300">
          <div className="font-medium">{scoreLabel}</div>
          {snapshot && snapshot.depth > 0 && (
            <div className="text-[10px] text-ink-500 dark:text-ink-400">
              d{snapshot.depth}
              {analyzing ? '…' : ''}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
