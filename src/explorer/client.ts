import type { ExplorerEntryRow } from '../db/db';
import {
  getExplorerEntry,
  isExplorerEntryFresh,
  normalizeFenForExplorer,
  putExplorerEntry,
} from '../db/explorer';
import { getLichessToken } from '../db/lichessAuth';

/** Shape of the Lichess Masters DB response we care about. */
interface LichessMastersResponse {
  /** Games won by white from this position. */
  white?: number;
  draws?: number;
  /** Games won by black from this position. */
  black?: number;
  /** Opening tag attached to this position, if Lichess recognized one. */
  opening?: {
    eco?: string;
    name?: string;
  };
  /** Most-played continuations from this position. */
  moves?: Array<{
    uci?: string;
    san?: string;
    white?: number;
    draws?: number;
    black?: number;
    opening?: { eco?: string; name?: string };
  }>;
}

/** Cap how many continuations we display + cache per position. */
const MAX_CONTINUATIONS = 6;

/** Lichess Opening Explorer threshold for "this is opening theory." */
export const BOOK_MIN_GAMES = 1000;

const EXPLORER_BASE = 'https://explorer.lichess.ovh/masters';

/**
 * Fetch + parse + cache a single FEN's Masters DB entry. Stale rows are
 * returned immediately (stale-while-revalidate); a background fetch refreshes
 * Dexie + the SW runtime cache so the next lookup is current.
 *
 * Returns:
 *   - The fresh row from Dexie if it's inside the 30-day window.
 *   - A freshly-fetched row otherwise (and writes it to Dexie).
 *   - The stale row if the network call fails (better than nothing).
 *   - null if neither cache nor network produced anything (eg first-load,
 *     offline, no Lichess presence for the position).
 *
 * Caller decides what to do with null: typically "no Explorer data yet,
 * skip the 'book' classification, fall back to engine-only."
 */
export async function fetchExplorerEntry(fen: string): Promise<ExplorerEntryRow | null> {
  const normalized = normalizeFenForExplorer(fen);
  const cached = await getExplorerEntry(normalized);
  if (isExplorerEntryFresh(cached)) return cached!;

  // Lichess started requiring auth on the Masters Explorer in 2026. Without
  // a token we skip the network call entirely — the UI falls back to the
  // bundled ECO data (data/eco.json) for opening names. Cached rows from
  // a prior auth'd session can still be returned.
  const token = await getLichessToken();
  if (!token) return cached ?? null;

  try {
    // moves=MAX_CONTINUATIONS so we get the popular branching options for
    // the "narrows to:" list. Payload stays small (~1 KB per position).
    const url = `${EXPLORER_BASE}?fen=${encodeURIComponent(normalized)}&moves=${MAX_CONTINUATIONS}`;
    const resp = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) {
      // 429 is the most likely failure. Don't burn the user's stale entry;
      // they'll get the same answer they had before.
      // eslint-disable-next-line no-console
      console.warn('[explorer] HTTP', resp.status, 'for', normalized);
      return cached ?? null;
    }
    const json = (await resp.json()) as LichessMastersResponse;
    const totalGames = (json.white ?? 0) + (json.draws ?? 0) + (json.black ?? 0);
    const topContinuations =
      Array.isArray(json.moves) && json.moves.length > 0
        ? json.moves
            .map((m) => ({
              san: m.san ?? m.uci ?? '?',
              openingName: m.opening?.name,
              ecoCode: m.opening?.eco,
              gameCount: (m.white ?? 0) + (m.draws ?? 0) + (m.black ?? 0),
            }))
            .filter((c) => c.gameCount > 0)
            .slice(0, MAX_CONTINUATIONS)
        : undefined;
    const row: ExplorerEntryRow = {
      fen: normalized,
      totalGames,
      openingName: json.opening?.name,
      ecoCode: json.opening?.eco,
      topContinuations,
      fetchedAt: Date.now(),
    };
    await putExplorerEntry(row);
    return row;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[explorer] fetch error for', normalized, err);
    return cached ?? null;
  }
}

/** Convenience: does the cached Explorer row say this is "book"? */
export function isBookPositionFromExplorer(row: ExplorerEntryRow | undefined): boolean {
  return !!row && row.totalGames >= BOOK_MIN_GAMES;
}
