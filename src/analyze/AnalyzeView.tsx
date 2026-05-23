import { useEffect, useMemo, useState } from 'react';
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
import { useGuessMode } from '../guess/useGuessMode';
import { GuessModePanel } from '../guess/GuessModePanel';
import { useExploration } from './useExploration';
import { summarizeCaptures } from './captures';
import { summarizeEngine } from '../llm/engineSummary';
import { MobileAnalysisTabs } from './MobileAnalysisTabs';
import { humanizeEngineError } from '../engine/humanizeError';
import { PlayerStrip } from './PlayerStrip';
import { OpeningBadge, OpeningHeader } from './OpeningBadge';
import { normalizeFenForExplorer } from '../db/explorer';
import { lookupOpening } from '../data/eco';
import { useLichessAuth } from '../hooks/useLichessAuth';

export function AnalyzeView() {
  const g = useGame();
  const lichessAuth = useLichessAuth();
  const { settings } = useSettings();
  const chatScreen = useChatScreen();
  const chatHost = useChatHost();

  // Interactive exploration. When the user drags a piece on the board
  // (outside guess mode), they branch off the main line. The exploration
  // FEN supersedes the game's FEN for both the board display and engine
  // analysis. Navigating moves resets it.
  const exploration = useExploration({ anchorFen: g.currentFen, anchorPly: g.ply });

  // FEN actually displayed: exploration if active, else the game's FEN.
  const displayFen = exploration.active
    ? exploration.state!.currentFen
    : g.currentFen ?? null;

  // Per-position live engine — analyzes whatever the user is *looking at*,
  // exploration or game line. That's the whole point of the interactive
  // mode: try a move, see the eval.
  const engine = useEngine({
    fen: displayFen,
    depth: settings.analysisDepth,
    enabled: settings.engineEnabled && settings.engineVariant === 'lite',
  });

  // Full-game analysis pass — runs on a separate engine worker so it doesn't
  // queue behind the interactive `engine` above.
  const analysis = useGameAnalysis(g.game, settings.analysisDepth, settings.engineVariant);

  // Guess-the-move mode. When active, hides the engine UI, makes the board
  // interactive for the side to move, and records guesses to Dexie.
  const guess = useGuessMode({
    game: g.game,
    rawPgn: g.rawPgn,
    ply: g.ply,
    setPly: g.setPly,
    evals: analysis.result.evals,
  });

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

    // Build the exploration block when the user has branched off — gives
    // Elle both the user's tried line AND the game's continuation so she
    // can compare on request.
    let explorationCtx: import('../llm/personaPrompt').ScreenContext['exploration'];
    if (exploration.active && exploration.state) {
      const bp = exploration.state.branchPly;
      const branchMove = g.game.moves[bp - 1]; // last actual game move before the branch
      const branchLabel = branchMove
        ? `${branchMove.moveNumber}${branchMove.color === 'w' ? '.' : '...'} ${branchMove.san}`
        : 'start';
      const gameContinuation = g.game.moves.slice(bp).map((m) => m.san);
      explorationCtx = {
        branchPly: bp,
        branchLabel,
        userMoves: exploration.state.moves.map((m) => m.san),
        gameContinuation,
        explorationEval: pawnsFromRow(analysis.result.evals[bp]) ?? undefined,
        gameLineEval: pawnsFromRow(analysis.result.evals[bp + exploration.state.moves.length]),
      };
    }

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
      openingName: analysis.result.openingName,
      ecoCode: analysis.result.ecoCode,
      exploration: explorationCtx,
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
    exploration.active,
    exploration.state,
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

  // Captured pieces + material balance for the player strips. Recomputes
  // when the ply changes or an exploration move is played.
  const captures = useMemo(
    () => summarizeCaptures(g.game, g.ply, exploration.state?.moves ?? []),
    [g.game, g.ply, exploration.state],
  );

  // Opening breadcrumb: scan ECO + Explorer rows for plies 0..currentPly so
  // the "Last recognized theory" out-of-book fallback only goes as deep as
  // the user has navigated (not the entire game). ECO is the offline-first
  // source (always available, ~3,700 named positions from bundled Lichess
  // chess-openings data). Explorer adds the same name when authed — we
  // prefer ECO since it's free of API state.
  const openingBreadcrumb = useMemo(() => {
    if (!g.game) return { name: undefined as string | undefined, eco: undefined as string | undefined };
    let name: string | undefined;
    let eco: string | undefined;
    const upTo = Math.min(g.ply, g.game.fens.length - 1);
    for (let i = 0; i <= upTo; i++) {
      // ECO first (offline, deterministic).
      const ecoEntry = lookupOpening(g.game.fens[i]);
      if (ecoEntry) {
        name = ecoEntry.name;
        eco = ecoEntry.eco;
      }
      // Explorer fills the same fields when present — useful for richer
      // names sometimes (Lichess has finer-grained tags than the ECO TSV).
      const row = analysis.result.explorerByFen[normalizeFenForExplorer(g.game.fens[i])];
      if (row?.openingName) name = row.openingName;
      if (row?.ecoCode) eco = row.ecoCode;
    }
    return { name, eco };
  }, [g.game, g.ply, analysis.result.explorerByFen]);

  // Opening name from ECO at the CURRENT ply — primary display source.
  // Works fully offline; doesn't depend on Explorer / Lichess token.
  const currentEco = g.game ? lookupOpening(g.currentFen ?? g.game.startingFen) : undefined;

  // Explorer row for the position currently on the board (only meaningful
  // when we're on the actual game line — not while exploring branches).
  const currentExplorerRow = g.game
    ? analysis.result.explorerByFen[
        normalizeFenForExplorer(g.currentFen ?? g.game.startingFen)
      ]
    : undefined;

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
  const compactTitle = compactGameLabel(g.game.headers);
  const fullTitle = gameLabel(g.game.headers);
  const sideToMove: 'w' | 'b' =
    g.currentFen?.split(' ')[1] === 'b' || (g.ply === 0 && g.game.startingFen.split(' ')[1] === 'b')
      ? 'b'
      : g.ply % 2 === 0
        ? 'w'
        : 'b';

  return (
    <div className="space-y-3">
      {/* Compact header — small back button + truncated title. Tap title
          to reveal the full header line (useful when the truncation hides
          a tournament / location detail). */}
      <CompactHeader
        compactTitle={compactTitle}
        fullTitle={fullTitle}
        onBack={g.clear}
        result={result}
        opening={
          <OpeningHeader
            eco={currentEco}
            current={currentExplorerRow}
            currentStatus={
              g.game
                ? analysis.result.explorerStatus[
                    normalizeFenForExplorer(g.currentFen ?? g.game.startingFen)
                  ]
                : undefined
            }
            lastKnownName={openingBreadcrumb.name}
            lastKnownEco={openingBreadcrumb.eco}
            atStartingPosition={g.ply === 0}
            hasLichessToken={lichessAuth.hasToken}
          />
        }
      />

      {/* Status row — one short line telling the user where they are. */}
      <StatusRow ply={g.ply} totalPlies={totalPlies} sideToMove={sideToMove} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        {/* Board column */}
        <div className="space-y-3">
          {/* Guess-mode toggle. Sits above the board so it's discoverable
              and so toggling immediately re-frames everything below. */}
          <div className="flex items-center justify-between gap-2 text-xs">
            <button
              type="button"
              onClick={() => (guess.active ? guess.stop() : guess.start())}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                guess.active
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-ink-200 text-ink-600 hover:bg-ink-100 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800'
              }`}
              aria-pressed={guess.active}
              title="Toggle Guess-the-move mode. Hides engine eval while you pick a move."
            >
              {guess.active ? 'Guessing on' : 'Guess the move'}
            </button>
            {guess.active && (
              <span className="text-[11px] text-ink-500 dark:text-ink-400">
                Engine eval is hidden until you commit a guess or exit.
              </span>
            )}
          </div>

          {/* Top player strip — the side facing away from the user. Whoever
              has captured the most material gets a +N badge. */}
          <PlayerStrip
            name={g.orientation === 'white' ? g.game.headers.Black : g.game.headers.White}
            side={g.orientation === 'white' ? 'black' : 'white'}
            captured={g.orientation === 'white' ? captures.blackCaptured : captures.whiteCaptured}
            advantage={
              g.orientation === 'white'
                ? Math.max(0, -captures.materialDelta)
                : Math.max(0, captures.materialDelta)
            }
            toMove={sideToMove === (g.orientation === 'white' ? 'b' : 'w')}
          />

          {/*
            Board sizing: cap by both width AND viewport-height so the board
            stays square-ish across screen shapes. 90vh upper bound matches
            chess.com / lichess-style "big board" feel; 920px stops it from
            getting silly on ultra-wide monitors.
          */}
          <div className="mx-auto flex w-full max-w-[min(90vh,920px)] items-stretch gap-1">
            {/* Eval bar flush to the board (gap-1 instead of gap-2). Hidden
                during guessing so the user doesn't see the answer before
                they pick — reappears after reveal. */}
            {settings.engineEnabled && guess.mode !== 'guessing' && (
              <div className="flex w-9 flex-col items-stretch">
                <EvalBar
                  snapshot={engine.snapshot}
                  orientation={g.orientation}
                  analyzing={engine.analyzing}
                />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <Board
                fen={displayFen ?? g.game.startingFen}
                orientation={g.orientation}
                // In exploration the lastMove is the user's just-played
                // branch move; otherwise the game's last move.
                lastMove={exploration.active ? exploration.lastMove : g.lastMove}
                // Hide classification shape while exploring — the eval
                // applies to the live position, not the game-ply move.
                shapes={
                  guess.mode === 'guessing' || exploration.active ? [] : classificationShapes
                }
                // Board is interactive when guess-mode is asking for input
                // OR whenever we're showing a normal (non-guess) view —
                // dragging starts/continues an exploration line.
                viewOnly={guess.mode === 'revealed'}
                movableColor={guess.mode === 'guessing' ? guess.sideToMove : 'both'}
                onUserMove={(uci) => {
                  if (guess.mode === 'guessing') {
                    guess.submit(uci);
                  } else if (!guess.active) {
                    exploration.play(uci);
                  }
                }}
              />
            </div>
          </div>

          {/* Bottom player strip — the side facing the user. */}
          <PlayerStrip
            name={g.orientation === 'white' ? g.game.headers.White : g.game.headers.Black}
            side={g.orientation}
            captured={g.orientation === 'white' ? captures.whiteCaptured : captures.blackCaptured}
            advantage={
              g.orientation === 'white'
                ? Math.max(0, captures.materialDelta)
                : Math.max(0, -captures.materialDelta)
            }
            toMove={sideToMove === (g.orientation === 'white' ? 'w' : 'b')}
          />

          <BoardControls
            ply={g.ply}
            totalPlies={totalPlies}
            onStart={g.goToStart}
            onPrev={g.prev}
            onNext={g.next}
            onEnd={g.goToEnd}
            onFlip={g.flip}
          />

          {exploration.active && !guess.active && (
            <ExplorationBanner
              moves={exploration.state!.moves}
              onTakeBack={exploration.takeBack}
              onExit={exploration.exit}
            />
          )}

          {guess.active && g.game && (
            <GuessModePanel
              mode={guess.mode}
              sideToMove={guess.sideToMove}
              ply={g.ply}
              totalPlies={totalPlies}
              comparison={guess.comparison}
              gameStats={guess.gameStats}
              overallStats={guess.overallStats}
              onNext={guess.next}
              onSkip={guess.skip}
              onStop={guess.stop}
              moveLabel={guessMoveLabel(g.game, g.ply)}
            />
          )}

          {!guess.active && (
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
          )}

          {!guess.active && !exploration.active && (
            <OpeningBadge current={currentExplorerRow} atStartingPosition={g.ply === 0} />
          )}

          {/* Mobile-only tabbed secondary content. Replaces the stack of
              cards below the board (eval graph + engine lines) and the
              right-side move list panel that desktop keeps. */}
          {!guess.active && (
            <MobileAnalysisTabs
              badges={{ moves: String(totalPlies) }}
              panels={{
                moves: (
                  <MoveList
                    moves={g.game.moves}
                    ply={g.ply}
                    onSelectPly={g.setPly}
                    classifications={analysis.result.classifications}
                  />
                ),
                engine: settings.engineEnabled ? (
                  <div className="p-2">
                    <EngineLines
                      snapshot={engine.snapshot}
                      ready={engine.ready}
                      error={engine.error}
                      variant={settings.engineVariant}
                      fen={displayFen ?? g.game.startingFen}
                    />
                  </div>
                ) : (
                  <div className="grid place-items-center p-6 text-xs text-ink-500 dark:text-ink-400">
                    Engine analysis is disabled in Settings.
                  </div>
                ),
                graph: (
                  <GraphPanel
                    evals={analysis.result.evals}
                    ply={g.ply}
                    onSelectPly={g.setPly}
                    totalPlies={totalPlies}
                    onStartAnalysis={analysis.start}
                    analysisRunning={analysis.running}
                    progress={analysis.progress}
                  />
                ),
              }}
            />
          )}

          {/* Desktop-only below-board stack — eval graph + engine lines. On
              mobile these live inside MobileAnalysisTabs above. */}
          <div className="hidden space-y-3 lg:block">
            {!guess.active && analysis.progress.done > 0 && (
              <EvalGraph
                evals={analysis.result.evals}
                ply={g.ply}
                onSelectPly={g.setPly}
              />
            )}

            {!guess.active && settings.engineEnabled && (
              <EngineLines
                snapshot={engine.snapshot}
                ready={engine.ready}
                error={engine.error}
                variant={settings.engineVariant}
                // Use the FEN the engine is *actually* analyzing — during
                // exploration this differs from g.currentFen, and EngineLines
                // uses it to replay UCI as SAN. Passing the wrong FEN makes
                // chess.js reject every move, leaving the preview empty.
                fen={displayFen ?? g.game.startingFen}
              />
            )}
          </div>

          {/* Per-move commentary card — only meaningful when a move has
              actually been played (ply > 0). The card itself surfaces an
              "Explain move" button; clicking it calls Elle and caches the
              result so subsequent renders are instant. Hidden during guess
              mode because the commentary would reveal what we're asking
              the user to deduce. */}
          {!guess.active && g.ply > 0 && g.game && (() => {
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

        {/* Side panel: move list + load new. Desktop only — mobile uses the
            MobileAnalysisTabs above. */}
        <aside className="card hidden min-h-[300px] flex-col overflow-hidden lg:flex">
          <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b-2 border-ink-200 bg-ink-50 px-3 py-2 dark:border-ink-800 dark:bg-ink-900">
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

interface GraphPanelProps {
  evals: (PositionEvalRow | undefined)[];
  ply: number;
  onSelectPly: (ply: number) => void;
  totalPlies: number;
  onStartAnalysis: () => void;
  analysisRunning: boolean;
  progress: { done: number; total: number };
}

/**
 * Wraps EvalGraph with a placeholder for the "not enough data yet" state.
 * A near-empty graph reads as broken — the spec calls for a clear "Analyze
 * the game first" message until at least 25% of positions are evaluated.
 */
function GraphPanel({
  evals,
  ply,
  onSelectPly,
  totalPlies,
  onStartAnalysis,
  analysisRunning,
  progress,
}: GraphPanelProps) {
  const analyzed = evals.filter((e) => e !== undefined).length;
  const enough = totalPlies > 0 ? analyzed / Math.max(1, totalPlies + 1) >= 0.25 : false;
  if (enough) {
    return (
      <div className="p-2">
        <EvalGraph evals={evals} ply={ply} onSelectPly={onSelectPly} />
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-8 text-center text-sm">
      <p className="text-ink-600 dark:text-ink-300">
        Run full-game analysis to see the eval graph.
      </p>
      <button
        type="button"
        onClick={onStartAnalysis}
        disabled={analysisRunning || totalPlies === 0}
        className="btn-primary text-xs"
      >
        {analysisRunning
          ? `Analyzing ${progress.done}/${progress.total}…`
          : '▶ Analyze now'}
      </button>
      <p className="text-[11px] text-ink-500 dark:text-ink-400">
        Graph appears once at least a quarter of the game has been evaluated.
      </p>
    </div>
  );
}

/**
 * Trim a game-headers object into a tight one-liner suitable for the
 * mobile header. Drops Event when long, strips date placeholders, prefers
 * surname-only player labels. Falls back to gameLabel() on short titles
 * that don't need any trimming.
 */
function compactGameLabel(headers: Record<string, string>): string {
  const rawW = headers.White || 'White';
  const rawB = headers.Black || 'Black';
  const w = lastName(rawW);
  const b = lastName(rawB);
  // Strip Lichess-style `1858.??.??` placeholders down to the year, and
  // drop the date entirely if no year survived.
  let yearOrDate = headers.Date && headers.Date !== '????.??.??' ? headers.Date : '';
  if (yearOrDate) {
    const m = yearOrDate.match(/^(\d{4})/);
    if (m) yearOrDate = m[1];
    else yearOrDate = '';
  }
  return yearOrDate ? `${w} vs ${b} — ${yearOrDate}` : `${w} vs ${b}`;
}
function lastName(full: string): string {
  // "Adolf Anderssen" → "Anderssen". Keep single-token names as-is.
  const parts = full.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : full;
}

interface CompactHeaderProps {
  compactTitle: string;
  fullTitle: string;
  onBack: () => void;
  result?: string;
  opening: React.ReactNode;
}

function CompactHeader({ compactTitle, fullTitle, onBack, result, opening }: CompactHeaderProps) {
  const [expanded, setExpanded] = useState(false);
  return (
    // Fixed height — OpeningHeader is now locked to a single line (see
    // src/analyze/OpeningBadge.tsx) so total here is back-btn row (9) +
    // title (5) + result (3.5) + opening (6) ≈ 5.5rem. The `expanded`
    // toggle adds another line; that case is rare enough that the small
    // shift on tap is acceptable.
    <div className="flex h-[5.5rem] items-start gap-2">
      <button
        type="button"
        onClick={onBack}
        title="Back to PGN import"
        aria-label="Back to PGN import"
        className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-base text-primary transition-colors hover:bg-surface-2"
      >
        ←
      </button>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="block w-full truncate text-left text-sm font-medium hover:text-accent"
          title={fullTitle}
          aria-expanded={expanded}
        >
          {compactTitle}
        </button>
        {expanded && fullTitle !== compactTitle && (
          <p className="mt-1 text-[11px] text-muted">{fullTitle}</p>
        )}
        {result && (
          <span className="mt-0.5 text-[11px] text-muted">Result: {result}</span>
        )}
        {opening}
      </div>
    </div>
  );
}

interface StatusRowProps {
  ply: number;
  totalPlies: number;
  sideToMove: 'w' | 'b';
}

function StatusRow({ ply, totalPlies, sideToMove }: StatusRowProps) {
  const moveNumber = Math.floor(ply / 2) + 1;
  const sideLabel = sideToMove === 'w' ? 'White to play' : 'Black to play';
  const label =
    ply === 0
      ? `Starting position · ${sideLabel}`
      : ply >= totalPlies
        ? `End of game · ply ${ply}/${totalPlies}`
        : `Move ${moveNumber} · ${sideLabel} · ply ${ply}/${totalPlies}`;
  return (
    <div className="flex h-6 items-center gap-2 text-[12px] text-muted">
      <span
        className={`inline-block h-2.5 w-2.5 rounded-full ring-1 ring-border ${
          sideToMove === 'w' ? 'bg-white' : 'bg-primary'
        }`}
        aria-hidden="true"
      />
      <span>{label}</span>
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

  // Once analysis is complete the CTA disappears — keep the depth + error
  // hints, since those still matter, but lose the full banner so the user's
  // scroll doesn't fight a permanent "Done" pill.
  if (complete && !depthTooLow && !error) return null;

  return (
    <div className="card flex flex-col gap-2 px-3 py-2 text-sm">
      {!complete && (
        <>
          {/* Primary action — full-width on mobile, content-width on
              desktop. Progress + cancel live inside the button text when
              running so the user doesn't have to find a separate control. */}
          <div className="flex items-stretch gap-2">
            {!running && (
              <button
                type="button"
                onClick={onStart}
                disabled={engineDisabled || progress.total === 0}
                title={engineDisabled ? 'Enable engine analysis in Settings first.' : undefined}
                className="btn-primary flex-1 py-2.5 text-sm font-semibold sm:flex-none sm:px-6"
              >
                ▶ Analyze full game
                {progress.total > 0 && (
                  <span className="ml-2 text-[11px] font-normal opacity-80 tabular-nums">
                    ({progress.done}/{progress.total}
                    {cachedOnly ? ' cached' : ''})
                  </span>
                )}
              </button>
            )}
            {running && (
              <>
                <div className="flex-1 rounded-md bg-accent/15 px-3 py-2.5 text-sm font-semibold text-accent">
                  Analyzing {progress.done}/{progress.total}…
                </div>
                <button type="button" className="btn-ghost text-xs" onClick={onCancel}>
                  Cancel
                </button>
              </>
            )}
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
              analysis (engine evals are shared across games by FEN). Tap above to fill in the rest.
            </div>
          )}
        </>
      )}
      {depthTooLow && (
        <div className="text-[11px] text-ink-500 dark:text-ink-400">
          Depth {depth} is too low for classification — raise to ≥ {MIN_CLASSIFY_DEPTH} in Settings to
          surface inaccuracy / mistake / blunder marks.
        </div>
      )}
      {error && (
        <div className="rounded-md border border-blunder/40 bg-blunder/10 px-3 py-2 text-xs text-blunder">
          <div className="font-semibold">Analysis error</div>
          <div className="mt-0.5">{humanizeEngineError(error)}</div>
        </div>
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
  // 48×48dp minimum tap target — matches the Android material guideline
  // and iOS HIG (44pt). Buttons grouped tightly with subtle dividers between
  // start/prev | next/end | flip so the row reads as one control surface
  // even though it has 5 actions.
  const Btn = (props: {
    onClick: () => void;
    disabled?: boolean;
    title: string;
    'aria-label': string;
    children: React.ReactNode;
  }) => (
    <button
      type="button"
      className="flex h-12 w-12 items-center justify-center rounded-md text-base text-ink-700 transition-colors hover:bg-ink-200 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:text-ink-200 dark:hover:bg-ink-700"
      {...props}
    />
  );
  return (
    <div className="card flex items-center justify-center gap-1 px-2 py-1">
      <Btn onClick={onStart} disabled={ply === 0} title="Start (Home)" aria-label="Go to start">
        ⏮
      </Btn>
      <Btn onClick={onPrev} disabled={ply === 0} title="Previous (←)" aria-label="Previous move">
        ◀
      </Btn>
      <span className="h-6 w-px bg-ink-200 dark:bg-ink-700" aria-hidden="true" />
      <Btn onClick={onNext} disabled={ply >= totalPlies} title="Next (→)" aria-label="Next move">
        ▶
      </Btn>
      <Btn onClick={onEnd} disabled={ply >= totalPlies} title="End (End)" aria-label="Go to end">
        ⏭
      </Btn>
      <span className="h-6 w-px bg-ink-200 dark:bg-ink-700" aria-hidden="true" />
      <Btn onClick={onFlip} title="Flip (f)" aria-label="Flip board">
        ⇅
      </Btn>
    </div>
  );
}

// summarizeEngine lives in src/llm/engineSummary.ts (shared with the lesson viewer).

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
 * Human-readable move-number label for the move at the given ply.
 * Examples: "8." for White's 8th move, "8..." for Black's 8th move.
 * Returns an empty string when no move exists at the ply.
 */
function guessMoveLabel(game: import('../lib/pgn').ParsedGame, ply: number): string {
  if (ply >= game.moves.length) return '';
  const m = game.moves[ply];
  return `${m.moveNumber}${m.color === 'w' ? '.' : '...'}`;
}

interface ExplorationBannerProps {
  moves: { san: string }[];
  onTakeBack: () => void;
  onExit: () => void;
}

/**
 * Small banner shown above the analysis cards when the user has played at
 * least one exploration move. Echoes back the moves they've tried, lets
 * them undo or exit. The engine eval shown below this banner is for the
 * exploration position, not the game-line position.
 */
function ExplorationBanner({ moves, onTakeBack, onExit }: ExplorationBannerProps) {
  return (
    <div className="card flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">
          Exploring
        </div>
        <div className="truncate font-mono text-xs">
          {moves.map((m) => m.san).join(' ')}
        </div>
        <div className="text-[11px] text-ink-500 dark:text-ink-400">
          Engine eval below is for this branched position, not the game line.
        </div>
      </div>
      <div className="flex gap-2">
        <button type="button" className="btn-ghost text-xs" onClick={onTakeBack}>
          Take back
        </button>
        <button type="button" className="btn-secondary text-xs" onClick={onExit}>
          Back to game
        </button>
      </div>
    </div>
  );
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
