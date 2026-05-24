import { Link } from 'react-router-dom';
import type { ExplorerEntryRow } from '../db/db';
import type { EcoEntry } from '../data/eco';

/**
 * Build a deep-link into the Study tab that pre-fills the search bar with
 * the given opening name. The Study page then shows whichever curated
 * studies match (substring against title / blurb / aliases) plus an
 * external "Search on Lichess" link as the fallback.
 */
function openingsLink(name: string): string {
  return `/study?search=${encodeURIComponent(name)}`;
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
                  title={`Open ${c.openingName} in the Study tab`}
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
  currentStatus: 'loading' | 'loaded' | 'skipped' | 'empty' | 'error' | undefined;
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
  // Fixed-height single-line row. `flex-wrap` would let long opening names
  // wrap to a 2nd line, which on mobile pushes the board down 1.5rem per
  // ply transition (state "name vs none vs out-of-book" all have different
  // wrapped heights). `truncate` on the inner body keeps it locked at h-6.
  return (
    <div className="mt-1 flex h-6 items-center gap-1.5 overflow-hidden whitespace-nowrap text-xs">
      <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
        Opening
      </span>
      <span className="min-w-0 flex-1 truncate">{renderBody(props)}</span>
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
      <span className="text-muted">Play a move to see opening theory.</span>
    );
  }

  // Resolve name. Prefer Explorer's name when it exists (finer-grained),
  // fall back to bundled ECO. ECO code follows the chosen name source.
  const resolvedName = current?.openingName ?? eco?.name;
  const resolvedEco = current?.openingName ? current.ecoCode : eco?.eco;

  if (resolvedName) {
    return (
      <span className="flex min-w-0 items-baseline gap-1.5">
        {resolvedEco && (
          <span className="shrink-0 font-mono text-xs text-muted">{resolvedEco}</span>
        )}
        <Link
          to={openingsLink(resolvedName)}
          className="min-w-0 truncate text-sm font-medium hover:text-accent hover:underline"
          title="Open in the Study tab"
        >
          {resolvedName}
        </Link>
        {current && current.totalGames > 0 && (
          <span className="shrink-0 text-[11px] text-muted">
            · {formatCount(current.totalGames)}
          </span>
        )}
        {/* "Add Lichess token" CTA — hidden on mobile (no room next to the
            opening name) and rendered as a brief link on larger screens.
            Settings is reachable from the bottom tab bar / top nav anyway. */}
        {!hasLichessToken && (
          <Link
            to="/settings#lichess"
            className="hidden shrink-0 text-[10px] text-secondary hover:underline lg:inline"
            title="Configure in Settings → Lichess account"
          >
            (add token for stats)
          </Link>
        )}
      </span>
    );
  }

  // No ECO match — show breadcrumb if we matched theory earlier. The
  // opening name itself links to the Openings tab the same way the live
  // header does, so the user can drill into theory for whatever they last
  // recognised even after the game has wandered out of book.
  if (lastKnownName) {
    return (
      <span className="text-muted">
        Out of book — last theory:{' '}
        <Link
          to={openingsLink(lastKnownName)}
          className="font-medium text-primary hover:text-accent hover:underline"
          title="Open in the Study tab"
        >
          {lastKnownName}
        </Link>
        {lastKnownEco && <span className="ml-1 font-mono">({lastKnownEco})</span>}
      </span>
    );
  }

  if (currentStatus === 'loading') {
    return <span className="italic text-muted">looking up…</span>;
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

