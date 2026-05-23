import type { DrillLineRow } from '../db/db';

/**
 * Priority ordering for the drill queue. Spec says, in order:
 *   1. Lines whose last attempt failed.
 *   2. Lines not drilled in 7+ days (or never drilled).
 *   3. Everything else, fresh-first.
 *
 * Within each bucket, older `lastDrilledAt` comes first (stalest needs work
 * the most). Lines with no `lastDrilledAt` outrank lines that were drilled
 * recently — never-drilled lines should surface before previously-passed ones.
 *
 * No SM-2 / spaced repetition — intentionally simple per the MVP spec.
 */
export function sortByDrillPriority(
  lines: DrillLineRow[],
  now: number = Date.now(),
): DrillLineRow[] {
  const stale = (l: DrillLineRow): boolean =>
    !l.lastDrilledAt || now - l.lastDrilledAt > 7 * 24 * 60 * 60 * 1000;

  const bucket = (l: DrillLineRow): number => {
    if (l.lastResult === 'fail') return 0; // failed last time — top priority
    if (stale(l)) return 1; // not drilled recently
    return 2; // recently passed — bottom
  };

  return [...lines].sort((a, b) => {
    const ba = bucket(a);
    const bb = bucket(b);
    if (ba !== bb) return ba - bb;
    // Within a bucket: oldest lastDrilledAt first; never-drilled before drilled.
    const ax = a.lastDrilledAt ?? 0;
    const bx = b.lastDrilledAt ?? 0;
    return ax - bx;
  });
}

/** Pick the next line to drill, or `undefined` if the user has no drill lines. */
export function nextDrillLine(
  lines: DrillLineRow[],
  now: number = Date.now(),
): DrillLineRow | undefined {
  return sortByDrillPriority(lines, now)[0];
}

/**
 * Human-readable label for the scheduler bucket — surfaced in the queue UI
 * as a one-word badge so the user knows why this line is next.
 */
export function priorityLabel(line: DrillLineRow, now: number = Date.now()): 'failed' | 'stale' | 'review' {
  if (line.lastResult === 'fail') return 'failed';
  if (!line.lastDrilledAt || now - line.lastDrilledAt > 7 * 24 * 60 * 60 * 1000) return 'stale';
  return 'review';
}
