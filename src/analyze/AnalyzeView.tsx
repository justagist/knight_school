import { useEffect, useMemo } from 'react';
import { Board } from '../components/Board';
import { MoveList } from '../components/MoveList';
import { PgnImport } from '../components/PgnImport';
import { EvalBar } from '../components/EvalBar';
import { EngineLines } from '../components/EngineLines';
import { EvalGraph } from '../components/EvalGraph';
import { CopyButton } from '../components/CopyButton';
import { gameLabel } from '../lib/pgn';
import { useGame } from './useGame';
import { useEngine } from '../engine/useEngine';
import { useGameAnalysis } from '../analysis/useGameAnalysis';
import { useSettings } from '../settings/SettingsProvider';
import { useGameSounds } from '../sounds/useGameSounds';
import { buildClassificationShapes } from './classificationShapes';
import { MIN_CLASSIFY_DEPTH } from '../analysis/classify';

export function AnalyzeView() {
  const g = useGame();
  const { settings } = useSettings();

  // Per-position live engine for the move-by-move review.
  const engine = useEngine({
    fen: g.currentFen,
    depth: settings.analysisDepth,
    enabled: settings.engineEnabled && settings.engineVariant === 'lite',
  });

  // Full-game analysis pass — runs on a separate engine worker so it doesn't
  // queue behind the interactive `engine` above.
  const analysis = useGameAnalysis(g.game, settings.analysisDepth, settings.engineVariant);

  // Sound playback on ply transitions.
  useGameSounds({
    game: g.game,
    ply: g.ply,
    soundsEnabled: settings.soundsEnabled,
  });

  // Build a board overlay shape for the most recent move's classification.
  // Shows nothing when the user is at the starting position or analysis
  // hasn't reached this ply yet — keeps the board uncluttered.
  const currentMoveClass = g.ply > 0 ? analysis.result.classifications[g.ply - 1] ?? null : null;
  const classificationShapes = useMemo(
    () => buildClassificationShapes(g.lastMove, currentMoveClass),
    [g.lastMove, currentMoveClass],
  );

  // Keyboard shortcuts: ← prev, → next, Home start, End end, f flip
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          g.prev();
          break;
        case 'ArrowRight':
          e.preventDefault();
          g.next();
          break;
        case 'Home':
          e.preventDefault();
          g.goToStart();
          break;
        case 'End':
          e.preventDefault();
          g.goToEnd();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          g.flip();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [g]);

  // Empty state — no game loaded
  if (!g.game) {
    return (
      <div className="space-y-4">
        <Header showSubtitle />
        <PgnImport onLoad={g.loadPgn} error={g.error ?? undefined} />
      </div>
    );
  }

  const totalPlies = g.game.moves.length;
  const result = g.game.headers.Result;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="btn-ghost px-2 text-xs"
          onClick={g.clear}
          title="Back to PGN import"
          aria-label="Back to PGN import"
        >
          ← Back
        </button>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{gameLabel(g.game.headers)}</div>
          {result && (
            <div className="text-xs text-ink-500 dark:text-ink-400">Result: {result}</div>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        {/* Board column */}
        <div className="space-y-3">
          <div className="mx-auto flex w-full max-w-[720px] items-stretch gap-2">
            {settings.engineEnabled && (
              <div className="flex w-8 flex-col items-stretch">
                <EvalBar
                  snapshot={engine.snapshot}
                  orientation={g.orientation}
                  analyzing={engine.analyzing}
                />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <Board
                fen={g.currentFen ?? g.game.startingFen}
                orientation={g.orientation}
                lastMove={g.lastMove}
                shapes={classificationShapes}
              />
            </div>
          </div>

          <BoardControls
            ply={g.ply}
            totalPlies={totalPlies}
            onStart={g.goToStart}
            onPrev={g.prev}
            onNext={g.next}
            onEnd={g.goToEnd}
            onFlip={g.flip}
          />

          <AnalyzeAllBanner
            running={analysis.running}
            progress={analysis.progress}
            complete={analysis.complete}
            error={analysis.error}
            onStart={analysis.start}
            onCancel={analysis.cancel}
            engineDisabled={!settings.engineEnabled}
            depth={settings.analysisDepth}
          />

          {analysis.progress.done > 0 && (
            <EvalGraph
              evals={analysis.result.evals}
              ply={g.ply}
              onSelectPly={g.setPly}
            />
          )}

          {settings.engineEnabled && (
            <EngineLines
              snapshot={engine.snapshot}
              ready={engine.ready}
              error={engine.error}
              variant={settings.engineVariant}
              fen={g.currentFen ?? g.game.startingFen}
            />
          )}
        </div>

        {/* Side panel: move list + load new */}
        <aside className="card flex min-h-[300px] flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-ink-200 px-3 py-2 dark:border-ink-800">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">
              Moves ({totalPlies})
            </span>
            {g.rawPgn && (
              <CopyButton
                text={() => g.rawPgn ?? ''}
                label="Copy PGN"
                copiedLabel="Copied"
                title="Copy this game's PGN to clipboard"
              />
            )}
          </div>
          <div className="flex-1 overflow-hidden">
            <MoveList
              moves={g.game.moves}
              ply={g.ply}
              onSelectPly={g.setPly}
              classifications={analysis.result.classifications}
            />
          </div>
          <div className="flex items-center justify-between border-t border-ink-200 px-3 py-2 text-xs dark:border-ink-800">
            <span className="text-ink-500 dark:text-ink-400">
              Ply {g.ply} / {totalPlies}
            </span>
            <button className="btn-ghost text-xs" onClick={g.clear}>
              Load another
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Header({ showSubtitle = false }: { showSubtitle?: boolean }) {
  return (
    <div>
      <h1 className="text-xl font-semibold">Analyze</h1>
      {showSubtitle && (
        <p className="text-sm text-ink-500 dark:text-ink-400">
          Paste a PGN or upload a file to review a game move-by-move.
        </p>
      )}
    </div>
  );
}

interface AnalyzeAllBannerProps {
  running: boolean;
  progress: { done: number; total: number };
  complete: boolean;
  error: string | null;
  onStart: () => void;
  onCancel: () => void;
  engineDisabled: boolean;
  depth: number;
}

function AnalyzeAllBanner({
  running,
  progress,
  complete,
  error,
  onStart,
  onCancel,
  engineDisabled,
  depth,
}: AnalyzeAllBannerProps) {
  const pct = progress.total > 0 ? (progress.done / progress.total) * 100 : 0;
  const depthTooLow = depth < MIN_CLASSIFY_DEPTH;
  // Distinguish "engine evals reused from cache" from "actually-in-progress."
  // Engine evaluations are keyed by FEN globally — the starting position and
  // common opening lines are shared across every game, so a freshly-loaded
  // PGN often shows X/N "ready" without the user analyzing it. Mark that
  // case so the user doesn't read it as half-finished work.
  const cachedOnly = !running && !complete && progress.done > 0;
  return (
    <div className="card flex flex-col gap-2 px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">
          Full-game analysis
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] tabular-nums text-ink-500 dark:text-ink-400">
            {progress.done} / {progress.total}
            {cachedOnly && ' cached'}
          </span>
          {!running && !complete && (
            <button
              type="button"
              className="btn-primary text-xs"
              onClick={onStart}
              disabled={engineDisabled || progress.total === 0}
              title={engineDisabled ? 'Enable engine analysis in Settings first.' : undefined}
            >
              Analyze game
            </button>
          )}
          {running && (
            <button type="button" className="btn-ghost text-xs" onClick={onCancel}>
              Cancel
            </button>
          )}
          {complete && (
            <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              Done
            </span>
          )}
        </div>
      </div>
      {(running || progress.done > 0) && (
        <div className="h-1 w-full overflow-hidden rounded-full bg-ink-200 dark:bg-ink-800">
          <div
            className="h-full bg-accent transition-[width] duration-200"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {cachedOnly && (
        <div className="text-[11px] text-ink-500 dark:text-ink-400">
          {progress.done} position{progress.done === 1 ? '' : 's'} already evaluated in earlier
          analysis (engine evals are shared across games by FEN). Click <em>Analyze game</em> to
          fill in the rest.
        </div>
      )}
      {depthTooLow && (
        <div className="text-[11px] text-ink-500 dark:text-ink-400">
          Depth {depth} is too low for classification — raise to ≥ {MIN_CLASSIFY_DEPTH} in Settings to
          surface inaccuracy / mistake / blunder marks.
        </div>
      )}
      {error && (
        <div className="text-xs text-red-600 dark:text-red-400">Analysis error: {error}</div>
      )}
    </div>
  );
}

interface BoardControlsProps {
  ply: number;
  totalPlies: number;
  onStart: () => void;
  onPrev: () => void;
  onNext: () => void;
  onEnd: () => void;
  onFlip: () => void;
}

function BoardControls({
  ply,
  totalPlies,
  onStart,
  onPrev,
  onNext,
  onEnd,
  onFlip,
}: BoardControlsProps) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <button
        className="btn-ghost px-3"
        onClick={onStart}
        disabled={ply === 0}
        title="Start (Home)"
        aria-label="Go to start"
      >
        ⏮
      </button>
      <button
        className="btn-ghost px-3"
        onClick={onPrev}
        disabled={ply === 0}
        title="Previous (←)"
        aria-label="Previous move"
      >
        ◀
      </button>
      <button
        className="btn-ghost px-3"
        onClick={onNext}
        disabled={ply >= totalPlies}
        title="Next (→)"
        aria-label="Next move"
      >
        ▶
      </button>
      <button
        className="btn-ghost px-3"
        onClick={onEnd}
        disabled={ply >= totalPlies}
        title="End (End)"
        aria-label="Go to end"
      >
        ⏭
      </button>
      <button className="btn-ghost px-3" onClick={onFlip} title="Flip (f)" aria-label="Flip board">
        ⇅
      </button>
    </div>
  );
}
