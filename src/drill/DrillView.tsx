import { useEffect, useState } from 'react';
import { Board } from '../components/Board';
import { useDrill, type DrillVariant } from './useDrill';
import { useDrillContext } from './DrillContext';
import { useChatScreen } from '../chat/ChatContextProvider';
import type { DrillLineRow } from '../db/db';
import { db } from '../db/db';
import { summarizeEngineFromRow } from '../llm/engineSummary';

interface DrillViewProps {
  line: DrillLineRow;
  /** Back-to-library / queue handler. */
  onExit: () => void;
  /** Fires after the user finishes (pass/fail). Parent can advance to the next queued line. */
  onFinished?: (result: 'pass' | 'fail') => void;
  /** Optional initial variant - defaults to 'board' (drag pieces). */
  initialVariant?: DrillVariant;
}

/**
 * Self-contained drill UI:
 *   - board with interactivity restricted to the user's side
 *   - guess-the-move variant: SAN input instead of drag
 *   - reveal panel showing the chapter author's comment on the current move
 *   - pass / fail terminal screens with retry + next CTAs
 *
 * Engine analysis is intentionally OFF during a drill - the point is recall,
 * not eval-assisted guessing. Once finished the user can re-open the chapter
 * in the lesson viewer to see the eval bar.
 */
export function DrillView({ line, onExit, onFinished, initialVariant = 'board' }: DrillViewProps) {
  const [variant, setVariant] = useState<DrillVariant>(initialVariant);
  const [guessInput, setGuessInput] = useState('');
  const drillCtx = useDrillContext();
  const chatScreen = useChatScreen();
  const drill = useDrill({ line, variant, onFinished });

  // Tell the chat layer that a drill is active for as long as this view is mounted.
  useEffect(() => {
    drillCtx.setActive(true);
    drillCtx.resetWarning();
    drillCtx.registerInvalidator(drill.invalidate);
    return () => {
      drillCtx.setActive(false);
      drillCtx.unregisterInvalidator();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line.id]);

  // Publish the drill context to Elle so a mid-drill chat (after the
  // invalidation warning) lands with the actual board state in the
  // system prompt. Refreshes every time the ply or invalidated flag
  // changes.
  useEffect(() => {
    let cancelled = false;
    const ply = drill.state.ply;
    const expectedSan = line.sanMoves[ply];
    const expectedMoves =
      drill.state.awaitingUser && expectedSan
        ? [{ san: expectedSan, chapterTitle: line.chapterTitle }]
        : [];
    const lastMoveSan = ply > 0 ? line.sanMoves[ply - 1] : undefined;
    const baseDrill = {
      studyName: line.studyName,
      kindLabel: `Chapter drill · ${line.chapterTitle}`,
      userSide: line.userSide,
      currentFen: drill.state.fen,
      lastMoveSan,
      expectedMoves,
      leadupSan: line.sanMoves.slice(0, ply),
      progressLabel: `${ply}/${line.uciMoves.length}`,
      invalidated: drill.state.invalidated,
    };
    // Publish synchronously without an eval - the chat panel still
    // works even when no cached row exists. Then look up the cache
    // and re-publish if a hit lands; mismatch (FEN moved on) drops
    // the stale write via the cancelled flag.
    chatScreen.setScreen({ kind: 'drill', drill: baseDrill });
    void (async () => {
      const row = await db().positionEvals.get(drill.state.fen);
      if (cancelled) return;
      const engineSummary = summarizeEngineFromRow(row);
      if (!engineSummary) return;
      chatScreen.setScreen({
        kind: 'drill',
        drill: { ...baseDrill, engineSummary },
      });
    })();
    return () => {
      cancelled = true;
      chatScreen.setScreen({ kind: 'idle' });
    };
    // chatScreen.setScreen identity is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drill.state.ply, drill.state.fen, drill.state.invalidated, drill.state.awaitingUser, line.id]);

  // When the user retries, reset the chat-warning flag too so the warning
  // shows again on the new attempt (per spec - "one-time per session per
  // attempt").
  const handleRetry = () => {
    drill.retry();
    drillCtx.resetWarning();
  };

  // SAN submit from the guess input - accepted on Enter or Submit click.
  const submitGuess = () => {
    const v = guessInput.trim();
    if (!v) return;
    drill.submitMove(v);
    setGuessInput('');
  };

  const onUserBoardMove = (uci: string) => {
    drill.submitMove(uci);
  };

  const sideLabel = line.userSide === 'white' ? 'White' : 'Black';
  const movesPlayed = drill.state.ply;
  const totalPlies = line.uciMoves.length;
  const progressLabel = `${Math.min(movesPlayed, totalPlies)} / ${totalPlies}`;

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onExit} className="btn-secondary text-sm">
          ← Exit drill
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold">
            Drill · {line.studyName}
          </h2>
          <p className="text-[11px] text-ink-500 dark:text-ink-400">
            {line.chapterTitle} · training as <span className="font-semibold">{sideLabel}</span>
            {' · '}
            {progressLabel} plies
          </p>
        </div>
        <VariantToggle variant={variant} onChange={setVariant} disabled={drill.state.status !== 'playing'} />
      </div>

      {drill.state.invalidated && (
        <div className="card border-amber-400 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          This attempt is invalidated (chat was used) - it won't count toward your stats. You can still finish for practice value.
        </div>
      )}

      {/* Board + interaction column */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,_1fr)_320px]">
        <div className="mx-auto w-full max-w-[min(80vh,_640px)]">
          <Board
            fen={drill.state.fen}
            orientation={line.userSide}
            lastMove={drill.lastMove}
            viewOnly={variant === 'guess' || drill.state.status !== 'playing' || !drill.state.awaitingUser}
            movableColor={line.userSide}
            onUserMove={variant === 'board' ? onUserBoardMove : undefined}
          />
        </div>

        <div className="flex flex-col gap-3">
          <PromptCard
            line={line}
            status={drill.state.status}
            ply={drill.state.ply}
            awaitingUser={drill.state.awaitingUser}
          />

          {drill.state.status === 'playing' && drill.state.awaitingUser && variant === 'guess' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitGuess();
              }}
              className="card flex flex-col gap-2 p-3"
            >
              <label className="text-xs font-semibold uppercase tracking-wide text-ink-600 dark:text-ink-400">
                Your guess (SAN)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={guessInput}
                  onChange={(e) => setGuessInput(e.target.value)}
                  placeholder="e.g. Nf3, e4, O-O"
                  className="input flex-1"
                  autoFocus
                />
                <button type="submit" className="btn-primary text-sm">
                  Submit
                </button>
              </div>
              <p className="text-[11px] text-ink-500 dark:text-ink-400">
                Type the move in algebraic notation. Press Enter to submit.
              </p>
            </form>
          )}

          {drill.state.status === 'feedback' && drill.state.feedbackComment && (
            <FeedbackCard
              comment={drill.state.feedbackComment}
              ply={drill.state.ply}
              total={line.uciMoves.length}
              onNext={drill.next}
            />
          )}

          {drill.state.status === 'wrong' && drill.state.wrong && (
            <WrongCard
              wrong={drill.state.wrong}
              onRetry={handleRetry}
              onExit={onExit}
              authorComment={line.comments[drill.state.wrong.ply + 1]}
            />
          )}

          {drill.state.status === 'complete' && (
            <CompleteCard
              line={line}
              invalidated={drill.state.invalidated}
              onRetry={handleRetry}
              onExit={onExit}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function VariantToggle({
  variant,
  onChange,
  disabled,
}: {
  variant: DrillVariant;
  onChange: (v: DrillVariant) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex rounded-md border border-ink-200 text-xs dark:border-ink-700">
      <button
        type="button"
        onClick={() => onChange('board')}
        disabled={disabled}
        className={`px-2 py-1 transition-colors ${
          variant === 'board'
            ? 'bg-accent text-white'
            : 'text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800'
        } disabled:opacity-50`}
        title="Drag a piece on the board"
      >
        Board
      </button>
      <button
        type="button"
        onClick={() => onChange('guess')}
        disabled={disabled}
        className={`px-2 py-1 transition-colors ${
          variant === 'guess'
            ? 'bg-accent text-white'
            : 'text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800'
        } disabled:opacity-50`}
        title="Type the move in algebraic notation"
      >
        Guess (SAN)
      </button>
    </div>
  );
}

function PromptCard({
  line,
  status,
  ply,
  awaitingUser,
}: {
  line: DrillLineRow;
  status: string;
  ply: number;
  awaitingUser: boolean;
}) {
  if (status !== 'playing') return null;
  if (!awaitingUser) {
    return (
      <div className="card px-3 py-2 text-sm text-ink-500 dark:text-ink-400">
        Opponent thinking…
      </div>
    );
  }
  // While prompting for the user's move, show the author's last comment for
  // context but never the upcoming move itself - that would defeat the drill.
  const moveNumber = Math.floor(ply / 2) + 1;
  const dots = ply % 2 === 0 ? '.' : '...';
  return (
    <div className="card flex flex-col gap-1 px-3 py-2 text-sm">
      <p className="font-semibold">
        Your move: {moveNumber}
        {dots}
      </p>
      <p className="text-xs text-ink-500 dark:text-ink-400">
        Side to play: {line.userSide}. Play the move the chapter expects.
      </p>
    </div>
  );
}

function FeedbackCard({
  comment,
  ply,
  total,
  onNext,
}: {
  comment: string;
  ply: number;
  total: number;
  onNext: () => void;
}) {
  const isLast = ply >= total;
  return (
    <div className="card flex flex-col gap-2 border-l-4 border-l-accent p-3 text-sm">
      <p className="text-xs italic text-ink-700 dark:text-ink-200">{comment}</p>
      <button type="button" onClick={onNext} className="btn-primary self-start text-xs">
        {isLast ? 'Finish' : 'Next move →'}
      </button>
    </div>
  );
}

function WrongCard({
  wrong,
  onRetry,
  onExit,
  authorComment,
}: {
  wrong: { playedSan: string; expectedSan: string; ply: number };
  onRetry: () => void;
  onExit: () => void;
  authorComment?: string;
}) {
  return (
    <div className="card flex flex-col gap-2 border-l-4 border-l-rose-500 p-3 text-sm">
      <p className="font-semibold text-rose-700 dark:text-rose-300">Not the chapter's move.</p>
      <p className="text-xs">
        You played <span className="font-mono">{wrong.playedSan || '(illegal)'}</span>. Chapter expected{' '}
        <span className="font-mono font-semibold">{wrong.expectedSan}</span>.
      </p>
      {authorComment && (
        <p className="border-l-2 border-l-accent pl-2 text-xs italic text-ink-600 dark:text-ink-300">
          {authorComment}
        </p>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={onRetry} className="btn-primary flex-1 text-xs">
          Retry from start
        </button>
        <button type="button" onClick={onExit} className="btn-secondary flex-1 text-xs">
          Exit
        </button>
      </div>
    </div>
  );
}

function CompleteCard({
  line,
  invalidated,
  onRetry,
  onExit,
}: {
  line: DrillLineRow;
  invalidated: boolean;
  onRetry: () => void;
  onExit: () => void;
}) {
  const newAttempts = line.attempts + (invalidated ? 0 : 1);
  const newSuccesses = line.successes + (invalidated ? 0 : 1);
  const accuracy = newAttempts > 0 ? Math.round((newSuccesses / newAttempts) * 100) : 0;
  return (
    <div className="card flex flex-col gap-2 border-l-4 border-l-emerald-500 p-3 text-sm">
      <p className="font-semibold text-emerald-700 dark:text-emerald-300">
        Line complete{invalidated ? ' (not recorded)' : '!'}
      </p>
      <p className="text-xs">
        {invalidated
          ? 'Attempt invalidated by chat use - stats unchanged.'
          : `Recorded as pass. Lifetime: ${newSuccesses}/${newAttempts} (${accuracy}%).`}
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={onRetry} className="btn-secondary flex-1 text-xs">
          Drill again
        </button>
        <button type="button" onClick={onExit} className="btn-primary flex-1 text-xs">
          Back to library
        </button>
      </div>
    </div>
  );
}
