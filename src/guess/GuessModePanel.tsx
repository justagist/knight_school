import type { GuessStats } from '../db/guess';
import type { GuessComparison, GuessMode } from './useGuessMode';

interface GuessModePanelProps {
  mode: GuessMode;
  sideToMove: 'white' | 'black';
  ply: number;
  totalPlies: number;
  comparison: GuessComparison | null;
  gameStats: GuessStats;
  overallStats: GuessStats;
  onNext: () => void;
  onSkip: () => void;
  onStop: () => void;
  /** Move-number label, e.g. "8." or "8...". Helps the user orient. */
  moveLabel: string;
}

/**
 * Card UI for "Guess the move" mode. Two phases:
 *  - guessing: "Black to play move 15... - make your guess on the board."
 *  - revealed: comparison of guess vs played vs engine top, plus a Next
 *    button to advance the ply.
 *
 * Stats (per-game + overall) sit at the bottom so the user can see progress
 * at a glance during a run.
 */
export function GuessModePanel({
  mode,
  sideToMove,
  ply,
  totalPlies,
  comparison,
  gameStats,
  overallStats,
  onNext,
  onSkip,
  onStop,
  moveLabel,
}: GuessModePanelProps) {
  const atEnd = ply >= totalPlies;

  return (
    <div className="card flex flex-col gap-3 px-3 py-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">
            Guess the move
          </div>
          {!atEnd && mode === 'guessing' && (
            <div className="mt-0.5 text-sm">
              {sideToMove === 'white' ? 'White' : 'Black'} to play{' '}
              <span className="font-mono">{moveLabel}</span> - make your move on the board.
            </div>
          )}
          {atEnd && (
            <div className="mt-0.5 text-sm text-ink-500 dark:text-ink-400">
              End of game - guess run complete.
            </div>
          )}
        </div>
        <button type="button" className="btn-ghost text-xs" onClick={onStop}>
          Exit
        </button>
      </div>

      {mode === 'revealed' && comparison && (
        <RevealCard comparison={comparison} atEnd={atEnd} onNext={onNext} />
      )}

      {mode === 'guessing' && !atEnd && (
        <div className="flex items-center gap-2 text-xs">
          <button type="button" className="btn-ghost" onClick={onSkip}>
            Skip this move
          </button>
          <span className="text-ink-500 dark:text-ink-400">
            Engine eval is hidden until you commit a move.
          </span>
        </div>
      )}

      <StatsRow gameStats={gameStats} overallStats={overallStats} />
    </div>
  );
}

interface RevealCardProps {
  comparison: GuessComparison;
  atEnd: boolean;
  onNext: () => void;
}

function RevealCard({ comparison, atEnd, onNext }: RevealCardProps) {
  const verdict = pickVerdict(comparison);

  return (
    <div className="space-y-2 rounded-md border border-ink-200 px-3 py-2 dark:border-ink-700">
      <div className={`text-sm font-medium ${verdict.tone}`}>{verdict.label}</div>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-ink-500 dark:text-ink-400">Your guess</dt>
        <dd className="font-mono">{comparison.guessSan}</dd>
        <dt className="text-ink-500 dark:text-ink-400">Played</dt>
        <dd className="font-mono">{comparison.playedSan}</dd>
        <dt className="text-ink-500 dark:text-ink-400">Engine top</dt>
        <dd className="font-mono">
          {comparison.engineBestSan ?? <span className="text-ink-400 dark:text-ink-500">- (run Analyze game for this)</span>}
        </dd>
      </dl>
      <div>
        <button
          type="button"
          className="btn-primary text-xs"
          onClick={onNext}
          disabled={atEnd}
        >
          {atEnd ? 'End of game' : 'Continue to next move →'}
        </button>
      </div>
    </div>
  );
}

interface StatsRowProps {
  gameStats: GuessStats;
  overallStats: GuessStats;
}

function StatsRow({ gameStats, overallStats }: StatsRowProps) {
  return (
    <div className="grid grid-cols-2 gap-2 border-t border-ink-200 pt-2 text-[11px] text-ink-500 dark:border-ink-800 dark:text-ink-400">
      <StatCell label="This game" stats={gameStats} />
      <StatCell label="All time" stats={overallStats} />
    </div>
  );
}

function StatCell({ label, stats }: { label: string; stats: GuessStats }) {
  if (stats.totalGuessed === 0) {
    return (
      <div>
        <div className="text-ink-600 dark:text-ink-300">{label}</div>
        <div>No guesses yet.</div>
      </div>
    );
  }
  return (
    <div>
      <div className="text-ink-600 dark:text-ink-300">{label}</div>
      <div>
        Played match: {(stats.playedRate * 100).toFixed(0)}% (
        {stats.matchesPlayed}/{stats.totalGuessed})
      </div>
      <div>
        Engine match: {(stats.engineRate * 100).toFixed(0)}% (
        {stats.matchesEngine}/{stats.totalGuessed})
      </div>
    </div>
  );
}

function pickVerdict(c: GuessComparison): { label: string; tone: string } {
  if (c.matchesPlayed && c.matchesEngine) {
    return {
      label: 'You found it - same as played, same as engine top.',
      tone: 'text-emerald-600 dark:text-emerald-400',
    };
  }
  if (c.matchesEngine) {
    return {
      label: "You picked the engine's top move (better than what was played).",
      tone: 'text-emerald-600 dark:text-emerald-400',
    };
  }
  if (c.matchesPlayed) {
    return {
      label: 'You matched what was played in the game.',
      tone: 'text-sky-600 dark:text-sky-400',
    };
  }
  return {
    label: "Different from both the played move and the engine's top choice.",
    tone: 'text-ink-700 dark:text-ink-300',
  };
}
