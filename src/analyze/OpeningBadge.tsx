import { Link } from 'react-router-dom';
import type { ExplorerEntryRow } from '../db/db';
import type { EcoEntry } from '../data/eco';

/** Build a deep-link into the Openings tab for a given opening name. */
function openingsLink(name: string): string {
  return `/openings?name=${encodeURIComponent(name)}`;
}

interface OpeningBadgeProps {
  /** Cached Explorer row for the CURRENT ply. */
  current: ExplorerEntryRow | undefined;
  /** True at ply 0 — never render anything. */
  atStartingPosition: boolean;
}

/**
 * Slim "Variations" card showing only the top popular continuations from
 * the current position (chess.com / lichess Explorer panel style). The
 * opening NAME itself lives inline in the game header — this card is just
 * the explorer drill-down.
 *
 * Hidden when:
 *   - At the starting position.
 *   - Current position has no Explorer data (out of book).
 *   - Explorer row exists but has no useful continuations.
 */
export function OpeningBadge({ current, atStartingPosition }: OpeningBadgeProps) {
  if (atStartingPosition) return null;
  if (!current || current.totalGames === 0) return null;

  const cont = (current.topContinuations ?? []).filter((c) => c.gameCount > 0);
  if (cont.length === 0) return null;

  return (
    <div className="card flex flex-col gap-1 px-3 py-2 text-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">
        Variations from here
      </div>
      <ul className="space-y-0.5">
        {cont.slice(0, 5).map((c, i) => (
          <li
            key={`${c.san}-${i}`}
            className="grid grid-cols-[3rem_1fr_auto] items-baseline gap-2 text-xs"
          >
            <span className="font-mono text-ink-700 dark:text-ink-300">{c.san}</span>
            <span className="truncate text-ink-700 dark:text-ink-200">
              {c.openingName ? (
                <Link
                  to={openingsLink(c.openingName)}
                  className="hover:text-accent hover:underline"
                  title={`Open ${c.openingName} in the Openings tab`}
                >
                  {c.openingName}
                </Link>
              ) : (
                <span className="text-ink-500 dark:text-ink-400">—</span>
              )}
            </span>
            <span className="font-mono tabular-nums text-[10px] text-ink-500 dark:text-ink-400">
              {formatCount(c.gameCount)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface OpeningHeaderProps {
  /** ECO entry for the current ply, if any. Primary name source — offline, always available. */
  eco: EcoEntry | undefined;
  /** Explorer row for the current ply when Lichess token is configured. Adds game-count enrichment. */
  current: ExplorerEntryRow | undefined;
  /** Status of the Explorer fetch (undefined if no token / fetch never started). */
  currentStatus: 'loading' | 'loaded' | 'error' | undefined;
  lastKnownName: string | undefined;
  lastKnownEco: string | undefined;
  atStartingPosition: boolean;
  /** True when a Lichess API token is configured (gates Explorer fetches). */
  hasLichessToken: boolean;
}

/**
 * Inline opening-name caption for the game header. Mirrors the
 * "B13 Caro-Kann Defense, Exchange Variation" line shown by Lichess /
 * chess.com under the game tags.
 *
 * Name resolution order:
 *   1. ECO bundled lookup (offline, ~3,700 named positions). Authoritative.
 *   2. Explorer row name (only differs when Lichess has finer tags). Adds
 *      master-game count when present.
 *
 * Display states:
 *   - ply 0                       → "Starting position — play a move to see theory"
 *   - ECO + Explorer match        → "<ECO> <Name> · 47k master games"
 *   - ECO only (no Explorer)      → "<ECO> <Name>"
 *   - No ECO, breadcrumb exists   → "Out of book — last theory: <Name>"
 *   - Nothing matched ever        → "Not in opening theory."
 */
export function OpeningHeader(props: OpeningHeaderProps) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
      <span className="rounded bg-ink-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-600 dark:bg-ink-800 dark:text-ink-300">
        Opening
      </span>
      {renderBody(props)}
    </div>
  );
}

function renderBody({
  eco,
  current,
  currentStatus,
  lastKnownName,
  lastKnownEco,
  atStartingPosition,
  hasLichessToken,
}: OpeningHeaderProps) {
  if (atStartingPosition) {
    return (
      <span className="text-ink-500 dark:text-ink-400">
        Starting position — play a move to see theory.
      </span>
    );
  }

  // Resolve name. Prefer Explorer's name when it exists (finer-grained),
  // fall back to bundled ECO. ECO code follows the chosen name source.
  const resolvedName = current?.openingName ?? eco?.name;
  const resolvedEco = current?.openingName ? current.ecoCode : eco?.eco;

  if (resolvedName) {
    return (
      <span className="flex flex-wrap items-baseline gap-1.5">
        {resolvedEco && (
          <span className="font-mono text-xs text-ink-500 dark:text-ink-400">{resolvedEco}</span>
        )}
        <Link
          to={openingsLink(resolvedName)}
          className="text-sm font-medium hover:text-accent hover:underline"
          title="Open in the Openings tab"
        >
          {resolvedName}
        </Link>
        {current && current.totalGames > 0 && (
          <span className="text-[11px] text-ink-500 dark:text-ink-400">
            · {formatCount(current.totalGames)} master games
          </span>
        )}
        {!hasLichessToken && (
          <a
            href="#/settings"
            className="text-[10px] text-sky-700 hover:underline dark:text-sky-400"
            title="Configure in Settings → Lichess account"
          >
            (add Lichess token for game stats)
          </a>
        )}
      </span>
    );
  }

  // No ECO match — show breadcrumb if we matched theory earlier.
  if (lastKnownName) {
    return (
      <span className="text-ink-500 dark:text-ink-400">
        Out of book — last theory:{' '}
        <span className="font-medium text-ink-700 dark:text-ink-200">{lastKnownName}</span>
        {lastKnownEco && <span className="ml-1 font-mono">({lastKnownEco})</span>}
      </span>
    );
  }

  if (currentStatus === 'loading') {
    return <span className="italic text-ink-500 dark:text-ink-400">looking up…</span>;
  }

  // Past opening + no theory matched. Middle-game / endgame territory.
  return (
    <span className="italic text-ink-500 dark:text-ink-400">Not in opening theory.</span>
  );
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(0)}k`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString();
}

