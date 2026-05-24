import { useState } from 'react';
import { useGameHistory } from './useGameHistory';
import type { GameHistoryRow } from '../db/db';

interface RecentGamesCardProps {
  /** Reload a game in the Analyze view. Hands the stored raw PGN back
   *  to useGame.loadPgn. */
  onPickGame: (rawPgn: string) => void;
}

const MAX_VISIBLE = 8;

/**
 * "Recent games" list shown on the Analyze empty state. Clicking a row
 * reloads that PGN into the analyser. Each row has a small remove (x)
 * button and the whole card has a "Clear all" footer link.
 */
export function RecentGamesCard({ onPickGame }: RecentGamesCardProps) {
  const history = useGameHistory();
  const [confirmingClear, setConfirmingClear] = useState(false);

  if (history.loading || history.rows.length === 0) return null;

  const visible = history.rows.slice(0, MAX_VISIBLE);
  const moreCount = history.rows.length - visible.length;

  return (
    <section className="card flex flex-col gap-2 p-3">
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
          Recent games
        </h2>
        <span className="text-[11px] text-faint">
          {history.rows.length} game{history.rows.length === 1 ? '' : 's'}
        </span>
      </header>
      <ul className="flex flex-col">
        {visible.map((row) => (
          <RecentRow
            key={row.gameKey}
            row={row}
            onPick={() => onPickGame(row.rawPgn)}
            onRemove={() => void history.remove(row.gameKey)}
          />
        ))}
      </ul>
      {moreCount > 0 && (
        <p className="text-[11px] text-faint">
          + {moreCount} older game{moreCount === 1 ? '' : 's'} not shown.
        </p>
      )}
      <footer className="flex items-center justify-end gap-2 border-t border-border pt-2">
        {confirmingClear ? (
          <>
            <span className="text-[11px] text-muted">
              Clear all {history.rows.length} entr{history.rows.length === 1 ? 'y' : 'ies'}?
            </span>
            <button
              type="button"
              onClick={() => setConfirmingClear(false)}
              className="btn-ghost text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={async () => {
                await history.clearAll();
                setConfirmingClear(false);
              }}
              className="btn-primary text-xs"
            >
              Clear history
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingClear(true)}
            className="text-[11px] text-muted hover:text-blunder hover:underline"
          >
            Clear history
          </button>
        )}
      </footer>
    </section>
  );
}

function RecentRow({
  row,
  onPick,
  onRemove,
}: {
  row: GameHistoryRow;
  onPick: () => void;
  onRemove: () => void;
}) {
  const dateLabel = formatDate(row.lastViewedAt);
  return (
    <li className="group flex min-h-[2.75rem] items-center gap-2 border-b border-border/40 py-1 last:border-b-0">
      <button
        type="button"
        onClick={onPick}
        className="min-w-0 flex-1 truncate text-left text-sm text-secondary hover:underline"
        title={row.label}
      >
        {row.label}
      </button>
      <span className="shrink-0 text-[11px] tabular-nums text-faint">
        {dateLabel}
      </span>
      {row.viewCount > 1 && (
        <span
          className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-muted"
          title={`Opened ${row.viewCount} times`}
        >
          x{row.viewCount}
        </span>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded text-base text-muted hover:bg-blunder/10 hover:text-blunder"
        title="Remove from history"
        aria-label={`Remove ${row.label} from history`}
      >
        x
      </button>
    </li>
  );
}

function formatDate(ms: number): string {
  const now = Date.now();
  const diff = now - ms;
  const day = 86_400_000;
  if (diff < day) return 'today';
  if (diff < 2 * day) return 'yesterday';
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
