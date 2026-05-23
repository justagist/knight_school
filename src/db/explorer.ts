import { db, type ExplorerEntryRow } from './db';

/** 30-day stale-while-revalidate window for Explorer responses. */
export const EXPLORER_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Strip the halfmove + fullmove counters from a FEN so the same position
 * reached via different transposition lengths shares a cache row.
 */
export function normalizeFenForExplorer(fen: string): string {
  const parts = fen.split(' ');
  // Position + side-to-move + castling + en-passant. Drop fields 5 & 6.
  return parts.slice(0, 4).join(' ');
}

export async function getExplorerEntry(fen: string): Promise<ExplorerEntryRow | undefined> {
  return db().explorerEntries.get(normalizeFenForExplorer(fen));
}

export async function getExplorerEntries(fens: string[]): Promise<(ExplorerEntryRow | undefined)[]> {
  if (fens.length === 0) return [];
  const keys = fens.map(normalizeFenForExplorer);
  return db().explorerEntries.bulkGet(keys);
}

export async function putExplorerEntry(row: ExplorerEntryRow): Promise<void> {
  await db().explorerEntries.put(row);
}

/** Treat an entry as fresh while still inside the 30-day SWR window. */
export function isExplorerEntryFresh(row: ExplorerEntryRow | undefined, now = Date.now()): boolean {
  if (!row) return false;
  return now - row.fetchedAt < EXPLORER_TTL_MS;
}
