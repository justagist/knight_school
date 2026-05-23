import { useEffect, useRef } from 'react';
import type { ParsedMove } from '../lib/pgn';
import { MOVE_CLASS_STYLES, type MoveClass } from '../analysis/classify';

interface MoveListProps {
  moves: ParsedMove[];
  /** Current ply (0 = before move 1; moves.length = after final move) */
  ply: number;
  onSelectPly: (ply: number) => void;
  /** Per-move classification, parallel to `moves`. null entries render no glyph. */
  classifications?: (MoveClass | null)[];
}

export function MoveList({ moves, ply, onSelectPly, classifications }: MoveListProps) {
  const olRef = useRef<HTMLOListElement | null>(null);
  const activeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    // Scroll the move list internally only — never let scrollIntoView bubble
    // up to the window (which on mobile would yank the screen away from the
    // board the user is actually looking at).
    const el = activeRef.current;
    const ol = olRef.current;
    if (!el || !ol) return;
    if (ol.scrollHeight <= ol.clientHeight) return; // no internal scrollbar; nothing to do
    const elTop = el.offsetTop - ol.offsetTop;
    const elBottom = elTop + el.offsetHeight;
    const visibleTop = ol.scrollTop;
    const visibleBottom = visibleTop + ol.clientHeight;
    if (elTop < visibleTop) {
      ol.scrollTo({ top: Math.max(0, elTop - 8), behavior: 'smooth' });
    } else if (elBottom > visibleBottom) {
      ol.scrollTo({ top: elBottom - ol.clientHeight + 8, behavior: 'smooth' });
    }
  }, [ply]);

  if (moves.length === 0) {
    return (
      <div className="grid place-items-center p-6 text-sm text-ink-500 dark:text-ink-400">
        No moves to display.
      </div>
    );
  }

  const pairs: {
    num: number;
    white?: ParsedMove;
    whiteIdx?: number;
    black?: ParsedMove;
    blackIdx?: number;
  }[] = [];
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
      ref={olRef}
      className="flex max-h-[60vh] flex-col overflow-y-auto text-sm lg:max-h-[70vh]"
      aria-label="Move list"
    >
      {pairs.map((p, rowIdx) => {
        // Every 5th row gets a subtle bottom border for visual rhythm —
        // helps scanning long move lists without adding heavy zebra striping.
        const rhythm = rowIdx > 0 && rowIdx % 5 === 0;
        return (
        <li
          key={`${p.num}-${p.whiteIdx ?? ''}-${p.blackIdx ?? ''}`}
          className={`grid min-h-[44px] grid-cols-[2.5rem_1fr_1fr] items-center gap-1 px-2 py-0.5 odd:bg-ink-100/60 dark:odd:bg-ink-800/40 ${
            rhythm ? 'border-t border-ink-200/70 dark:border-ink-700/60' : ''
          }`}
        >
          <span className="text-xs tabular-nums text-ink-500 dark:text-ink-400">{p.num}.</span>
          <MoveCell
            move={p.white}
            isActive={p.whiteIdx !== undefined && p.whiteIdx + 1 === ply}
            onClick={() => p.whiteIdx !== undefined && onSelectPly(p.whiteIdx + 1)}
            activeRef={activeRef}
            klass={p.whiteIdx !== undefined ? classifications?.[p.whiteIdx] ?? null : null}
          />
          <MoveCell
            move={p.black}
            isActive={p.blackIdx !== undefined && p.blackIdx + 1 === ply}
            onClick={() => p.blackIdx !== undefined && onSelectPly(p.blackIdx + 1)}
            activeRef={activeRef}
            placeholder={p.white !== undefined && p.black === undefined}
            klass={p.blackIdx !== undefined ? classifications?.[p.blackIdx] ?? null : null}
          />
        </li>
        );
      })}
    </ol>
  );
}

interface MoveCellProps {
  move?: ParsedMove;
  isActive: boolean;
  onClick: () => void;
  activeRef: React.MutableRefObject<HTMLButtonElement | null>;
  placeholder?: boolean;
  klass: MoveClass | null;
}

function MoveCell({ move, isActive, onClick, activeRef, placeholder, klass }: MoveCellProps) {
  if (!move) {
    return (
      <span className="px-2 py-0.5 text-ink-400 dark:text-ink-600">
        {placeholder ? '…' : ''}
      </span>
    );
  }
  const style = klass ? MOVE_CLASS_STYLES[klass] : null;
  const showGlyph = !!style && style.glyph.length > 0;
  return (
    <button
      ref={isActive ? activeRef : null}
      type="button"
      onClick={onClick}
      className={`flex h-11 items-center gap-1 rounded border-l-[3px] px-2 py-0.5 text-left font-mono text-[13px] transition-colors ${
        isActive
          ? 'border-l-accent bg-accent/10 font-bold text-ink-900 dark:text-ink-100'
          : 'border-l-transparent hover:bg-ink-200 dark:hover:bg-ink-700'
      }`}
      aria-current={isActive ? 'true' : undefined}
      title={style ? style.label : undefined}
    >
      <span>{move.san}</span>
      {showGlyph && (
        <span
          className={`text-[11px] font-bold ${style.colorClass}`}
          aria-label={style.ariaLabel}
        >
          {style.glyph}
        </span>
      )}
    </button>
  );
}
