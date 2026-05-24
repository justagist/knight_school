/**
 * Bundled ECO (Encyclopaedia of Chess Openings) lookup.
 *
 * Backing data: src/data/eco.json - a position-keyed map produced by
 * scripts/build-eco.mjs from Lichess's chess-openings repo (CC0). 3,700+
 * positions covering the full ECO A00–E99 range.
 *
 * Why this exists: Lichess Opening Explorer requires a personal API token
 * (as of 2026). Bundled ECO gives offline, no-auth opening-name lookup
 * that works on every game forever. The Explorer adds richer stats
 * (master game counts, popular continuations, win rates) when a token is
 * present; ECO covers the always-available name baseline.
 *
 * Position key format: FEN with halfmove + fullmove counters stripped
 * (`position + stm + castling + en-passant`). Transpositions resolve to
 * the same entry.
 */

import ecoJson from './eco.json';

export interface EcoEntry {
  eco: string;
  name: string;
}

/** Cast the JSON to a typed record at the boundary. */
const ECO_BY_POSITION = ecoJson as Record<string, EcoEntry>;

/** Strip halfmove + fullmove counters - match the build script's keys. */
function positionKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

/**
 * Look up the named ECO opening for a position, if any. Transpositions
 * resolve to a single canonical entry. Returns undefined for positions
 * that aren't tagged in ECO (the vast majority - only ~3,700 of
 * billions of positions are).
 */
export function lookupOpening(fen: string): EcoEntry | undefined {
  return ECO_BY_POSITION[positionKey(fen)];
}
