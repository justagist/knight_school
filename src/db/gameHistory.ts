import { db, type GameHistoryRow } from './db';
import { pgnHash } from './chat';
import type { ParsedGame } from '../lib/pgn';
import { gameLabel } from '../lib/pgn';

const GAME_HISTORY_EVENT = 'ks-history-changed';

function notify(): void {
  window.dispatchEvent(new Event(GAME_HISTORY_EVENT));
}

export function subscribeGameHistory(listener: () => void): () => void {
  window.addEventListener(GAME_HISTORY_EVENT, listener);
  return () => window.removeEventListener(GAME_HISTORY_EVENT, listener);
}

/**
 * Record (or refresh) a game in the Analyze recent-games list.
 *
 * Idempotent on `gameKey` (PGN hash). Re-opening the same game bumps
 * `lastViewedAt` and `viewCount` rather than creating a duplicate row.
 * Wrapped in a transaction so concurrent opens from two tabs can't
 * lose an increment.
 */
export async function recordGameView(rawPgn: string, parsed: ParsedGame): Promise<void> {
  const gameKey = pgnHash(rawPgn);
  const label = gameLabel(parsed.headers);
  const headers: GameHistoryRow['headers'] = {
    White: parsed.headers.White,
    Black: parsed.headers.Black,
    Event: parsed.headers.Event,
    Site: parsed.headers.Site,
    Date: parsed.headers.Date,
    Result: parsed.headers.Result,
  };
  await db().transaction('rw', db().gameHistory, async () => {
    const existing = await db().gameHistory.get(gameKey);
    const now = Date.now();
    if (existing) {
      await db().gameHistory.put({
        ...existing,
        // Refresh cached display fields in case the PGN was re-parsed
        // and the headers improved.
        label,
        headers,
        rawPgn,
        lastViewedAt: now,
        viewCount: existing.viewCount + 1,
      });
    } else {
      await db().gameHistory.put({
        gameKey,
        rawPgn,
        label,
        headers,
        firstViewedAt: now,
        lastViewedAt: now,
        viewCount: 1,
      });
    }
  });
  notify();
}

/** Most recently viewed first. */
export async function listGameHistory(): Promise<GameHistoryRow[]> {
  return db().gameHistory.orderBy('lastViewedAt').reverse().toArray();
}

export async function deleteGameHistory(gameKey: string): Promise<void> {
  await db().gameHistory.delete(gameKey);
  notify();
}

export async function clearGameHistory(): Promise<void> {
  await db().gameHistory.clear();
  notify();
}
