import { useEffect, useRef } from 'react';
import type { ParsedMove } from '../lib/pgn';

interface MoveListProps {
  moves: ParsedMove[];
  /** Current ply (0 = before move 1; moves.length = after final move) */
  ply: number;
  onSelectPly: (ply: number) => void;
}

export function MoveList({ moves, ply, onSelectPly }: MoveListProps) {
  const activeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [ply]);

  if (moves.length === 0) {
    return (
      <div className="grid place-items-center p-6 text-sm text-ink-500 dark:text-ink-400">
        No moves to display.
      </div>
    );
  }

  // Group into pairs: { number, white, black? }
  const pairs: { num: number; white?: ParsedMove; whiteIdx?: number; black?: ParsedMove; blackIdx?: number }[] = [];
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (m.color === 'w') {
      pairs.push({ num: m.moveNumber, white: m, whiteIdx: i });
    } else {
      const last = pairs[pairs.length - 1];
      if (last && last.white && last.num === m.moveNumber) {
        last.black = m;
        last.blackIdx = i;
      } else {
        pairs.push({ num: m.moveNumber, black: m, blackIdx: i });
      }
    }
  }

  return (
    <ol
      className="flex max-h-[60vh] flex-col overflow-y-auto text-sm lg:max-h-none"
      aria-label="Move list"
    >
      {pairs.map((p) => (
        <li
          key={`${p.num}-${p.whiteIdx ?? ''}-${p.blackIdx ?? ''}`}
          className="grid grid-cols-[2.5rem_1fr_1fr] items-center gap-1 px-2 py-0.5 odd:bg-ink-100/60 dark:odd:bg-ink-800/40"
        >
          <span className="text-xs tabular-nums text-ink-500 dark:text-ink-400">{p.num}.</span>
          <MoveCell
            move={p.white}
            isActive={p.whiteIdx !== undefined && p.whiteIdx + 1 === ply}
            onClick={() => p.whiteIdx !== undefined && onSelectPly(p.whiteIdx + 1)}
            activeRef={activeRef}
          />
          <MoveCell
            move={p.black}
            isActive={p.blackIdx !== undefined && p.blackIdx + 1 === ply}
            onClick={() => p.blackIdx !== undefined && onSelectPly(p.blackIdx + 1)}
            activeRef={activeRef}
            placeholder={p.white !== undefined && p.black === undefined}
          />
        </li>
      ))}
    </ol>
  );
}

interface MoveCellProps {
  move?: ParsedMove;
  isActive: boolean;
  onClick: () => void;
  activeRef: React.MutableRefObject<HTMLButtonElement | null>;
  placeholder?: boolean;
}

function MoveCell({ move, isActive, onClick, activeRef, placeholder }: MoveCellProps) {
  if (!move) {
    return (
      <span className="px-2 py-0.5 text-ink-400 dark:text-ink-600">
        {placeholder ? '…' : ''}
      </span>
    );
  }
  return (
    <button
      ref={isActive ? activeRef : null}
      type="button"
      onClick={onClick}
      className={`rounded px-2 py-0.5 text-left font-mono text-[13px] transition-colors ${
        isActive
          ? 'bg-accent text-white'
          : 'hover:bg-ink-200 dark:hover:bg-ink-700'
      }`}
      aria-current={isActive ? 'true' : undefined}
    >
      {move.san}
    </button>
  );
}
