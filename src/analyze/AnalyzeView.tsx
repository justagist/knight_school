import { useEffect } from 'react';
import { Board } from '../components/Board';
import { MoveList } from '../components/MoveList';
import { PgnImport } from '../components/PgnImport';
import { gameLabel } from '../lib/pgn';
import { useGame } from './useGame';

export function AnalyzeView() {
  const g = useGame();

  // Keyboard shortcuts: ← prev, → next, Home start, End end, f flip
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore when typing in a form field
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
        <Header />
        <PgnImport onLoad={g.loadPgn} error={g.error ?? undefined} />
      </div>
    );
  }

  const totalPlies = g.game.moves.length;
  const result = g.game.headers.Result;

  return (
    <div className="space-y-4">
      <Header />

      <div className="text-sm">
        <div className="font-medium">{gameLabel(g.game.headers)}</div>
        {result && (
          <div className="text-xs text-ink-500 dark:text-ink-400">Result: {result}</div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        {/* Board column */}
        <div className="space-y-3">
          <div className="mx-auto w-full max-w-[680px]">
            <Board
              fen={g.currentFen ?? g.game.startingFen}
              orientation={g.orientation}
              lastMove={g.lastMove}
            />
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
        </div>

        {/* Side panel: move list + load new */}
        <aside className="card flex min-h-[300px] flex-col overflow-hidden">
          <div className="border-b border-ink-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-500 dark:border-ink-800 dark:text-ink-400">
            Moves ({totalPlies})
          </div>
          <div className="flex-1 overflow-hidden">
            <MoveList moves={g.game.moves} ply={g.ply} onSelectPly={g.setPly} />
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

function Header() {
  return (
    <div>
      <h1 className="text-xl font-semibold">Analyze</h1>
      <p className="text-sm text-ink-500 dark:text-ink-400">
        Paste a PGN or upload a file to review a game move-by-move.
      </p>
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
