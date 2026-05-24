import { useEffect, useMemo } from 'react';
import { Board } from '../components/Board';
import { useMixedDrill, type DrillSide, type MixedDrillMode } from './useMixedDrill';
import { useDrillContext } from './DrillContext';
import { useChatScreen } from '../chat/ChatContextProvider';
import { normalizeFenForExplorer } from '../db/explorer';
import type { StudyRow, DrillPositionRow } from '../db/db';

interface MixedDrillViewProps {
  study: StudyRow;
  positions: DrillPositionRow[];
  chapterIndices: number[];
  userSide: DrillSide;
  mode: MixedDrillMode;
  length: number;
  onExit: () => void;
  onFinished?: (result: 'pass' | 'fail', invalidated: boolean) => void;
  /**
   * "Drill weak spots" - re-issue the URL with a narrower chapter scope
   * matching the chapters the user passed under 70% accuracy. Parent
   * (OpeningsPage) writes the URL params + nudges this view to remount.
   */
  onDrillSubset?: (chapterIndices: number[]) => void;
  /**
   * "Review failure position" - open the study viewer at the given chapter.
   * Parent navigates to the study URL. We omit the ply (it's hard to map a
   * FEN back to its in-chapter ply without re-walking the PGN) so the user
   * lands at the chapter start and can step through manually.
   */
  onReviewChapter?: (chapterIndex: number) => void;
}

/**
 * Mixed-drill view. Same shape as the per-chapter DrillView (board + status
 * cards + retry/exit) but reads its state machine from useMixedDrill.
 *
 * Empty states it has to handle:
 *   - Spot mode with no spot positions in scope → friendly "no spots
 *     available" card + back-to-library link.
 *   - Pool with zero positions in scope → same.
 */
export function MixedDrillView({
  study,
  positions,
  chapterIndices,
  userSide,
  mode,
  length,
  onExit,
  onFinished,
  onDrillSubset,
  onReviewChapter,
}: MixedDrillViewProps) {
  const chapterScope = useMemo(() => new Set(chapterIndices), [chapterIndices]);
  const drillCtx = useDrillContext();
  const chatScreen = useChatScreen();
  const drill = useMixedDrill({
    study,
    positions,
    chapterScope,
    userSide,
    mode,
    length,
    onFinished,
  });

  // Tell chat that a drill is active so the chat-invalidation warning fires
  // if the user opens chat mid-drill (same plumbing as DrillView). Register
  // the invalidator so the "Continue and invalidate" confirmation actually
  // flips state.invalidated → the ScreenContext below carries it to Elle.
  useEffect(() => {
    drillCtx.setActive(true);
    drillCtx.resetWarning();
    drillCtx.registerInvalidator(drill.invalidate);
    return () => {
      drillCtx.setActive(false);
      drillCtx.unregisterInvalidator();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [study.id, mode]);

  // Position-pool lookup by normalised fen - keeps the chat context's
  // "expected moves" view consistent with the engine's matching logic.
  const byFen = useMemo(() => {
    const m = new Map<string, DrillPositionRow>();
    for (const p of positions) m.set(p.fen, p);
    return m;
  }, [positions]);

  // Publish drill context to Elle for invalidated-chat questions. Updates
  // whenever the current position changes.
  useEffect(() => {
    const row = byFen.get(normalizeFenForExplorer(drill.state.fen));
    const sideChar = userSide === 'white' ? 'w' : 'b';
    const expectedDedup = new Map<string, { san: string; chapterTitle: string }>();
    for (const o of row?.occurrences ?? []) {
      if (!chapterScope.has(o.chapterIndex) || o.sideToMove !== sideChar) continue;
      if (!expectedDedup.has(o.san)) {
        expectedDedup.set(o.san, { san: o.san, chapterTitle: o.chapterTitle });
      }
    }
    const kindLabel = mode === 'spot' ? 'Spot drill' : 'Mixed drill';
    chatScreen.setScreen({
      kind: 'drill',
      drill: {
        studyName: study.name,
        kindLabel,
        userSide,
        currentFen: drill.state.fen,
        lastMoveSan: drill.state.feedback?.playedSan,
        expectedMoves: [...expectedDedup.values()],
        // Mixed sessions teleport across chapters - no single chapter
        // lead-up to surface.
        leadupSan: undefined,
        progressLabel:
          length > 0
            ? `${drill.state.userMovesMade}/${length}`
            : `${drill.state.userMovesMade} so far`,
        invalidated: drill.state.invalidated,
      },
    });
    return () => {
      chatScreen.setScreen({ kind: 'idle' });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    drill.state.fen,
    drill.state.userMovesMade,
    drill.state.invalidated,
    study.id,
    mode,
    userSide,
    length,
  ]);

  // Bail-out empty states.
  const totalUsable = positions.filter((p) =>
    p.occurrences.some(
      (o) => chapterScope.has(o.chapterIndex) && o.sideToMove === (userSide === 'white' ? 'w' : 'b'),
    ),
  ).length;
  if (mode === 'spot' && drill.spotCount === 0) {
    return (
      <EmptyState
        title="No spot positions in scope"
        body={`No position in the selected chapters has exactly one ${userSide}-side move at ply 3 or later. Try free-mode or widen the scope.`}
        onExit={onExit}
      />
    );
  }
  if (totalUsable === 0) {
    return (
      <EmptyState
        title="Nothing to drill"
        body={`No ${userSide}-side moves found in the selected chapters. Pick a different side or wider scope.`}
        onExit={onExit}
      />
    );
  }

  const scopeLabel =
    chapterIndices.length === study.chapters.length
      ? 'All chapters'
      : `${chapterIndices.length} of ${study.chapters.length} chapters`;
  // Spot mode shows "X/Y correct of Z attempted" so the user can see
  // running accuracy live. Free mode keeps the simpler "X of N" view.
  const progressLabel =
    mode === 'spot'
      ? `${drill.state.userMovesMade}/${drill.state.userMovesAttempted} correct${
          length > 0 ? ` · ${drill.state.userMovesAttempted}/${length}` : ''
        }`
      : length > 0
        ? `${drill.state.userMovesMade}/${length}`
        : `${drill.state.userMovesMade}`;

  return (
    <div className="flex flex-col gap-3">
      {/* Header / breadcrumb. Per spec: "Mixed drill · 8/25" or
          "Italian Opening · Ch.2 · 4/12" - the latter only applies to
          per-chapter; here we always show study + scope. */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onExit} className="btn-secondary text-sm">
          ← Exit drill
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold">
            {mode === 'spot' ? 'Spot drill' : 'Mixed drill'} · {study.name}
          </h2>
          <p className="text-[11px] text-muted">
            {scopeLabel} · training as <span className="font-semibold">{userSide}</span>
            {' · '}
            {progressLabel} moves
          </p>
        </div>
      </div>

      {drill.state.invalidated && (
        <div className="card border-l-4 border-l-inaccuracy bg-inaccuracy/10 px-3 py-2 text-xs text-primary">
          This attempt is invalidated (chat was used) - stats are not being
          recorded. You can keep going for practice value.
        </div>
      )}

      {/* Board + side panel */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,_1fr)_320px]">
        <div className="mx-auto w-full max-w-[min(80vh,_640px)]">
          <Board
            fen={drill.state.fen}
            orientation={userSide}
            lastMove={drill.state.lastMove}
            // Disable during feedback / wrong / complete so a stray click
            // can't fire submitMove on a stale FEN.
            viewOnly={drill.state.status !== 'playing' || !drill.state.awaitingUser}
            movableColor={userSide}
            onUserMove={(uci) => drill.submitMove(uci)}
          />
        </div>

        <div className="flex flex-col gap-3">
          {drill.state.status === 'playing' && (
            <PromptCard awaiting={drill.state.awaitingUser} userSide={userSide} mode={mode} />
          )}
          {drill.state.status === 'feedback' && drill.state.feedback && (
            <FeedbackCard feedback={drill.state.feedback} onNext={drill.next} onExit={onExit} />
          )}
          {drill.state.status === 'wrong' && drill.state.wrong && (
            <WrongCard
              wrong={drill.state.wrong}
              onRetry={drill.retry}
              onExit={onExit}
            />
          )}
          {drill.state.status === 'complete' && (
            <CompleteCard
              state={drill.state}
              study={study}
              onRetry={drill.retry}
              onExit={onExit}
              onDrillSubset={onDrillSubset}
              onReviewChapter={onReviewChapter}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function PromptCard({
  awaiting,
  userSide,
  mode,
}: {
  awaiting: boolean;
  userSide: DrillSide;
  mode: MixedDrillMode;
}) {
  if (!awaiting) {
    return <div className="card px-3 py-2 text-sm text-muted">Opponent thinking…</div>;
  }
  return (
    <div className="card flex flex-col gap-1 px-3 py-2 text-sm">
      <p className="font-semibold">Your move</p>
      <p className="text-xs text-muted">
        Side to play: {userSide}. {mode === 'spot' ? 'Find the one correct move from the chapter.' : 'Play a move that matches the chapter\'s line.'}
      </p>
    </div>
  );
}

/**
 * Spot-mode result card - pass or fail. Shown between user moves so the
 * user gets explicit feedback before the engine advances to the next
 * position. The Next button is the only way forward, so the user has to
 * acknowledge the outcome before continuing.
 */
function FeedbackCard({
  feedback,
  onNext,
  onExit,
}: {
  feedback: {
    pass: boolean;
    playedSan: string;
    expected: { san: string; chapterTitle: string }[];
    matchedChapterTitle?: string;
  };
  onNext: () => void;
  onExit: () => void;
}) {
  if (feedback.pass) {
    return (
      <div className="card flex flex-col gap-2 border-l-4 border-l-best p-3 text-sm">
        <p className="font-semibold text-best">Correct.</p>
        <p className="text-xs">
          You played <span className="font-mono font-semibold">{feedback.playedSan}</span>
          {feedback.matchedChapterTitle && (
            <span className="text-muted"> (from {feedback.matchedChapterTitle})</span>
          )}
          .
        </p>
        <div className="mt-1 flex gap-2">
          <button type="button" onClick={onNext} className="btn-primary flex-1 text-xs">
            Next spot →
          </button>
          <button type="button" onClick={onExit} className="btn-secondary text-xs">
            Exit
          </button>
        </div>
      </div>
    );
  }
  // De-dup expected by SAN - multiple chapters may agree on the same move.
  const byMove = new Map<string, string[]>();
  for (const e of feedback.expected) {
    const list = byMove.get(e.san) ?? [];
    list.push(e.chapterTitle);
    byMove.set(e.san, list);
  }
  return (
    <div className="card flex flex-col gap-2 border-l-4 border-l-blunder p-3 text-sm">
      <p className="font-semibold text-blunder">Not in the line.</p>
      <p className="text-xs">
        You played <span className="font-mono">{feedback.playedSan || '(illegal)'}</span>. Expected:
      </p>
      <ul className="space-y-1 text-xs">
        {[...byMove.entries()].map(([san, titles]) => (
          <li key={san} className="font-mono">
            <span className="font-semibold">{san}</span>
            <span className="text-muted"> ({titles.join(', ')})</span>
          </li>
        ))}
      </ul>
      <div className="mt-1 flex gap-2">
        <button type="button" onClick={onNext} className="btn-primary flex-1 text-xs">
          Next spot →
        </button>
        <button type="button" onClick={onExit} className="btn-secondary text-xs">
          Exit
        </button>
      </div>
    </div>
  );
}

function WrongCard({
  wrong,
  onRetry,
  onExit,
}: {
  wrong: { playedSan: string; expected: { san: string; chapterTitle: string }[] };
  onRetry: () => void;
  onExit: () => void;
}) {
  // De-dup expected by SAN - multiple chapters may agree on the same move.
  const byMove = new Map<string, string[]>();
  for (const e of wrong.expected) {
    const list = byMove.get(e.san) ?? [];
    list.push(e.chapterTitle);
    byMove.set(e.san, list);
  }
  return (
    <div className="card flex flex-col gap-2 border-l-4 border-l-blunder p-3 text-sm">
      <p className="font-semibold text-blunder">Not in the line.</p>
      <p className="text-xs">
        You played <span className="font-mono">{wrong.playedSan || '(illegal)'}</span>. Expected:
      </p>
      <ul className="space-y-1 text-xs">
        {[...byMove.entries()].map(([san, titles]) => (
          <li key={san} className="font-mono">
            <span className="font-semibold">{san}</span>
            <span className="text-muted"> ({titles.join(', ')})</span>
          </li>
        ))}
      </ul>
      <div className="mt-1 flex gap-2">
        <button type="button" onClick={onRetry} className="btn-primary flex-1 text-xs">
          Drill again
        </button>
        <button type="button" onClick={onExit} className="btn-secondary flex-1 text-xs">
          Exit
        </button>
      </div>
    </div>
  );
}

interface CompleteState {
  userMovesMade: number;
  target: number;
  perChapterPasses: Map<number, number>;
  perChapterAttempts: Map<number, number>;
  failures: {
    fen: string;
    playedSan: string;
    expected: { san: string; chapterIndex: number; chapterTitle: string }[];
  }[];
}

function CompleteCard({
  state,
  study,
  onRetry,
  onExit,
  onDrillSubset,
  onReviewChapter,
}: {
  state: CompleteState;
  study: StudyRow;
  onRetry: () => void;
  onExit: () => void;
  onDrillSubset?: (chapterIndices: number[]) => void;
  onReviewChapter?: (chapterIndex: number) => void;
}) {
  const total = state.userMovesMade + state.failures.length;
  const accuracy = total > 0 ? Math.round((state.userMovesMade / total) * 100) : 0;

  // Chapters where accuracy was below 70% - used by "Drill weak spots" to
  // pre-select a narrower scope. Skips chapters with 0 attempts to avoid
  // false weakness signals.
  const weakChapters: number[] = [...state.perChapterAttempts.entries()]
    .filter(([, att]) => att > 0)
    .filter(([cIdx, att]) => {
      const passes = state.perChapterPasses.get(cIdx) ?? 0;
      return passes / att < 0.7;
    })
    .map(([cIdx]) => cIdx)
    .sort((a, b) => a - b);

  return (
    <div className="card flex flex-col gap-2 border-l-4 border-l-best p-3 text-sm">
      <p className="font-semibold text-best">Drill complete</p>
      <p className="text-xs">
        Accuracy: {state.userMovesMade}/{total} ({accuracy}%).
      </p>
      {state.perChapterAttempts.size > 0 && (
        <div className="text-xs">
          <div className="mb-1 font-semibold text-muted">By chapter</div>
          <ul className="space-y-0.5">
            {[...state.perChapterAttempts.entries()]
              .sort(([a], [b]) => a - b)
              .map(([chapterIndex, attempts]) => {
                const passes = state.perChapterPasses.get(chapterIndex) ?? 0;
                const pct = attempts > 0 ? Math.round((passes / attempts) * 100) : 0;
                return (
                  <li key={chapterIndex} className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      {study.chapters[chapterIndex]?.title ?? `Chapter ${chapterIndex + 1}`}
                    </span>
                    <span className={`font-mono tabular-nums ${pct < 70 ? 'text-mistake' : 'text-muted'}`}>
                      {passes}/{attempts} ({pct}%)
                    </span>
                  </li>
                );
              })}
          </ul>
        </div>
      )}
      {state.failures.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer font-semibold text-muted">
            Failed positions ({state.failures.length})
          </summary>
          <ul className="mt-1 space-y-1 border-l border-border pl-2">
            {state.failures.slice(0, 10).map((f, i) => {
              const expectedByChapter = new Map<number, string>();
              for (const e of f.expected) expectedByChapter.set(e.chapterIndex, e.san);
              return (
                <li key={i} className="flex flex-col gap-0.5">
                  <span>
                    Played <span className="font-mono">{f.playedSan || '(illegal)'}</span>; expected{' '}
                    {[...expectedByChapter.entries()].map(([cIdx, san], j, arr) => (
                      <span key={cIdx}>
                        <span className="font-mono font-semibold">{san}</span>
                        <span className="text-muted">
                          {' '}({study.chapters[cIdx]?.title ?? `Ch.${cIdx + 1}`})
                        </span>
                        {j < arr.length - 1 ? ', ' : ''}
                      </span>
                    ))}
                  </span>
                  {onReviewChapter && f.expected[0] && (
                    <button
                      type="button"
                      onClick={() => onReviewChapter(f.expected[0].chapterIndex)}
                      className="self-start text-[11px] text-secondary hover:underline"
                    >
                      Review chapter →
                    </button>
                  )}
                </li>
              );
            })}
            {state.failures.length > 10 && (
              <li className="text-[11px] text-muted">…and {state.failures.length - 10} more.</li>
            )}
          </ul>
        </details>
      )}
      <div className="mt-1 flex flex-wrap gap-2">
        <button type="button" onClick={onRetry} className="btn-secondary flex-1 text-xs">
          Drill again
        </button>
        {weakChapters.length > 0 && onDrillSubset && (
          <button
            type="button"
            onClick={() => onDrillSubset(weakChapters)}
            className="btn-secondary flex-1 text-xs"
            title={`Re-run with only the chapters that scored under 70% (${weakChapters.length} chapter${weakChapters.length === 1 ? '' : 's'})`}
          >
            Drill weak spots
          </button>
        )}
        <button type="button" onClick={onExit} className="btn-primary flex-1 text-xs">
          Back to library
        </button>
      </div>
    </div>
  );
}

function EmptyState({
  title,
  body,
  onExit,
}: {
  title: string;
  body: string;
  onExit: () => void;
}) {
  return (
    <div className="card flex flex-col gap-3 border-l-4 border-l-secondary p-4 text-sm">
      <p className="font-semibold">{title}</p>
      <p className="text-xs text-muted">{body}</p>
      <button type="button" onClick={onExit} className="btn-secondary self-start text-xs">
        Back to library
      </button>
    </div>
  );
}
