import { db, type GuessRecordRow } from './db';
import { uuid } from '../lib/uuid';

export type NewGuess = Omit<GuessRecordRow, 'id' | 'createdAt'> & { createdAt?: number };

export async function addGuess(input: NewGuess): Promise<GuessRecordRow> {
  const row: GuessRecordRow = {
    ...input,
    id: uuid(),
    createdAt: input.createdAt ?? Date.now(),
  };
  await db().guessRecords.add(row);
  return row;
}

/**
 * Most recent guess at the given (game, ply), if any. Used by useGuessMode
 * to skip plies the user has already guessed when advancing forward -
 * matches the spec's per-game accuracy story.
 */
export async function getLatestGuess(
  gameKey: string,
  ply: number,
): Promise<GuessRecordRow | undefined> {
  const rows = await db().guessRecords
    .where('[gameKey+ply]')
    .equals([gameKey, ply])
    .toArray();
  if (rows.length === 0) return undefined;
  // Most recent wins - user can re-guess and the latest result is the one shown.
  return rows.sort((a, b) => b.createdAt - a.createdAt)[0];
}

export async function listGuessesForGame(gameKey: string): Promise<GuessRecordRow[]> {
  return db().guessRecords.where('gameKey').equals(gameKey).sortBy('ply');
}

/**
 * Aggregate stats across all guesses for a single game. Per-ply duplicates
 * collapse to the most recent attempt.
 */
export async function getGameStats(gameKey: string): Promise<GuessStats> {
  const all = await db().guessRecords.where('gameKey').equals(gameKey).toArray();
  return summarize(dedupeByPly(all));
}

/** Aggregate stats across every guess the user has ever made. */
export async function getOverallStats(): Promise<GuessStats> {
  const all = await db().guessRecords.toArray();
  return summarize(dedupeByPly(all));
}

export interface GuessStats {
  totalGuessed: number;
  matchesPlayed: number;
  matchesEngine: number;
  /** Fraction in [0, 1] - 0 when totalGuessed == 0. */
  playedRate: number;
  engineRate: number;
}

function summarize(rows: GuessRecordRow[]): GuessStats {
  const total = rows.length;
  const played = rows.filter((r) => r.matchesPlayed).length;
  const engine = rows.filter((r) => r.matchesEngine).length;
  return {
    totalGuessed: total,
    matchesPlayed: played,
    matchesEngine: engine,
    playedRate: total === 0 ? 0 : played / total,
    engineRate: total === 0 ? 0 : engine / total,
  };
}

/**
 * Keep only the most recent guess per (gameKey, ply). Used everywhere we
 * present stats, so re-guessing the same move doesn't inflate the count.
 */
function dedupeByPly(rows: GuessRecordRow[]): GuessRecordRow[] {
  const byKey = new Map<string, GuessRecordRow>();
  for (const r of rows) {
    const k = `${r.gameKey}::${r.ply}`;
    const existing = byKey.get(k);
    if (!existing || existing.createdAt < r.createdAt) byKey.set(k, r);
  }
  return Array.from(byKey.values());
}
