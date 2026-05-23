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
import { useChatScreen } from '../chat/ChatContextProvider';
import { useChatHost } from '../chat/ChatHost';
import { MoveCommentary } from '../chat/MoveCommentary';
import { sanSequenceWithNumbers, uciSequenceToSan } from '../lib/uciToSan';
import type { PositionEvalRow } from '../db/db';

export function AnalyzeView() {
  const g = useGame();
  const { settings } = useSettings();
  const chatScreen = useChatScreen();
  const chatHost = useChatHost();

  // Per-position live engine for the move-by-move review.
  const engine = useEngine({
    fen: g.currentFen,
    depth: settings.analysisDepth,
    enabled: settings.engineEnabled && settings.engineVariant === 'lite',
  });

  // Full-game analysis pass — runs on a separate engine worker so it doesn't
  // queue behind the interactive `engine` above.
  const analysis = useGameAnalysis(g.game, settings.analysisDepth, settings.engineVariant);

  // Publish the current screen context to the chat host so the floating
  // chat panel knows we're looking at a specific game / position. Reverts
  // to idle on unmount so the General thread comes back when navigating.
  useEffect(() => {
    chatHost.setRawPgn(g.rawPgn);
    if (!g.game) {
      chatScreen.setScreen({ kind: 'idle' });
      return;
    }
    const playedMove = g.ply > 0 ? g.game.moves[g.ply - 1] : undefined;
    const engineSummary = summarizeEngine(engine.snapshot);
    const currentMove = playedMove
      ? {
          label: `${playedMove.moveNumber}${playedMove.color === 'w' ? '.' : '...'}`,
          san: playedMove.san,
          uci: `${playedMove.from}${playedMove.to}`,
          color: playedMove.color,
          moveNumber: playedMove.moveNumber,
          classification: analysis.result.classifications[g.ply - 1] ?? undefined,
          evalBefore: pawnsFromRow(analysis.result.evals[g.ply - 1]),
          evalAfter: pawnsFromRow(analysis.result.evals[g.ply]),
          // Counterfactual lines (what should have been played) come from
          // the eval row for the position BEFORE the played move.
          bestLinesBefore: renderLines(
            g.game.fens[g.ply - 1],
            analysis.result.evals[g.ply - 1],
          ),
          // Refutation lines (how the opponent now exploits / responds)
          // come from the eval row for the position AFTER the played move.
          bestLinesAfter: renderLines(
            g.game.fens[g.ply],
            analysis.result.evals[g.ply],
          ),
        }
      : undefined;
    const trajectory = summarizeTrajectory(g.game, analysis.result);
    chatScreen.setScreen({
      kind: 'game',
      gameLabel: gameLabel(g.game.headers),
      result: g.game.headers.Result,
      pgn: g.rawPgn ?? undefined,
      ply: g.ply,
      currentFen: g.currentFen ?? g.game.startingFen,
      currentMove,
      engineSummary,
      trajectory,
    });
    // chatScreen.setScreen identity is stable; chatHost.setRawPgn is stable too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    g.game,
    g.rawPgn,
    g.ply,
    g.currentFen,
    engine.snapshot,
    analysis.result,
  ]);

  useEffect(() => {
    return () => {
      chatHost.setRawPgn(null);
      chatScreen.setScreen({ kind: 'idle' });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

          {/* Per-move commentary card — only meaningful when a move has
              actually been played (ply > 0). The card itself surfaces an
              "Explain move" button; clicking it calls Elle and caches the
              result so subsequent renders are instant. */}
          {g.ply > 0 && g.game && (() => {
            const move = g.game.moves[g.ply - 1];
            if (!move) return null;
            const fenBefore = g.game.fens[g.ply - 1];
            return (
              <MoveCommentary
                visible
                fenBefore={fenBefore}
                uciMove={`${move.from}${move.to}`}
                sanMove={move.san}
                evalBefore={analysis.result.evals[g.ply - 1] ?? undefined}
                evalAfter={analysis.result.evals[g.ply] ?? undefined}
                classification={analysis.result.classifications[g.ply - 1] ?? undefined}
                gameLabel={gameLabel(g.game.headers)}
                moveNumber={move.moveNumber}
                color={move.color}
              />
            );
          })()}
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

/**
 * Compact, model-readable summary of the current engine snapshot. Used by
 * the chat host to ground Elle's responses in the same eval the user is
 * looking at on the board.
 */
function summarizeEngine(snapshot: { lines: { pvIndex: number; scoreCp?: number; mate?: number; uciMoves: string[]; depth: number }[]; depth: number } | null): string | undefined {
  if (!snapshot || snapshot.lines.length === 0) return undefined;
  const lines = snapshot.lines.slice(0, 3).map((l) => {
    const score = l.mate != null ? `M${l.mate}` : l.scoreCp != null ? `${(l.scoreCp / 100).toFixed(2)}` : '—';
    const pv = l.uciMoves.slice(0, 6).join(' ');
    return `  PV${l.pvIndex}: ${score}  ${pv}`;
  });
  return `Depth ${snapshot.depth} — top lines:\n${lines.join('\n')}`;
}

/**
 * Convert a cached PositionEvalRow to a White-POV pawn value. Mate flattens
 * to ±10 so prompts stay readable. Returns undefined when there's no eval
 * data (un-analyzed position).
 */
function pawnsFromRow(
  row: { turn: 'w' | 'b'; scoreCp?: number; mate?: number } | undefined,
): number | undefined {
  if (!row) return undefined;
  if (row.mate != null) {
    if (row.mate > 0) return row.turn === 'w' ? 10 : -10;
    if (row.mate < 0) return row.turn === 'w' ? -10 : 10;
    return row.turn === 'w' ? -10 : 10; // mate=0 means side-to-move is mated
  }
  if (row.scoreCp == null) return undefined;
  const fromWhite = row.turn === 'w' ? row.scoreCp : -row.scoreCp;
  return fromWhite / 100;
}

/**
 * Compact game-wide eval trajectory for the system prompt. Format:
 *   1.  e4    [opening]  +0.18 → -0.05
 *   1... e5   [opening]  -0.05 → -0.00
 *   ...
 *   15. Bf4   [mistake]  +0.42 → -0.10
 *
 * Includes every analyzed move; unanalyzed ones are skipped. Truncates to
 * 200 lines so the prompt stays bounded for very long games.
 */
function summarizeTrajectory(
  game: import('../lib/pgn').ParsedGame,
  result: { evals: (import('../db/db').PositionEvalRow | undefined)[]; classifications: (string | null)[] },
): string | undefined {
  if (!result.evals.length) return undefined;
  const rows: string[] = [];
  for (let i = 0; i < game.moves.length; i++) {
    const m = game.moves[i];
    const before = pawnsFromRow(result.evals[i]);
    const after = pawnsFromRow(result.evals[i + 1]);
    if (before == null && after == null) continue;
    const label = `${m.moveNumber}${m.color === 'w' ? '.' : '...'} ${m.san}`.padEnd(10);
    const cls = result.classifications[i] ? `[${result.classifications[i]}]` : '';
    const evalText =
      before != null && after != null
        ? `${fmt(before)} → ${fmt(after)}`
        : before != null
          ? `${fmt(before)} → ?`
          : after != null
            ? `? → ${fmt(after)}`
            : '';
    rows.push(`  ${label} ${cls.padEnd(14)} ${evalText}`);
    if (rows.length >= 200) {
      rows.push('  […truncated]');
      break;
    }
  }
  return rows.length > 0 ? rows.join('\n') : undefined;
}

function fmt(p: number): string {
  if (Math.abs(p) >= 10) return p > 0 ? '+M' : '-M';
  return `${p >= 0 ? '+' : ''}${p.toFixed(2)}`;
}

/**
 * Render the engine's top PV lines at a position as SAN sequences with
 * move numbers, e.g. "15. Nf3 Nxe4 16. Qxe4 Nf6". Used both for
 * counterfactual ("what should have been played") and refutation ("how
 * the opponent exploits this") rendering in the chat prompt.
 *
 * Returns up to 3 lines, each truncated to ~8 plies — enough for Elle to
 * narrate the key idea without overflowing the prompt.
 */
function renderLines(
  fen: string | undefined,
  row: PositionEvalRow | undefined,
): Array<{ score: string; sanLine: string }> | undefined {
  if (!fen || !row || !row.lines.length) return undefined;
  const out: Array<{ score: string; sanLine: string }> = [];
  for (const line of row.lines.slice(0, 3)) {
    const sans = uciSequenceToSan(fen, line.uciMoves.slice(0, 8));
    if (sans.length === 0) continue;
    const score = line.mate != null
      ? `M${line.mate}`
      : line.scoreCp != null
        ? `${(line.scoreCp / 100).toFixed(2)}`
        : '—';
    out.push({ score, sanLine: sanSequenceWithNumbers(fen, sans) });
  }
  return out.length > 0 ? out : undefined;
}
