/**
 * Build a UCI string ("e2e4", "e7e8q") from any move-like object that
 * carries from/to + optional promotion. Centralising this avoids the
 * recurring bug where callers concatenate `${from}${to}` and silently
 * drop the promotion suffix - engines + chess.js then treat the move
 * as illegal/wrong on promotion squares.
 */
export interface MoveLike {
  from: string;
  to: string;
  /** Promotion piece letter ('q' | 'r' | 'b' | 'n'), if applicable. */
  promotion?: string;
}

export function moveToUci(m: MoveLike): string {
  return `${m.from}${m.to}${m.promotion ?? ''}`;
}

/**
 * Normalise chess960-style castling UCI to the form chess.js v1.4
 * accepts.
 *
 * chessops's `makeUci()` outputs king-to-rook-square for castling
 * (`e1h1` / `e1a1` / `e8h8` / `e8a8`), which is the FIDE-correct
 * Chess960 form. chess.js v1.4's `move({from, to})`, on the other
 * hand, only accepts king-to-destination-square (`e1g1` / `e1c1` /
 * `e8g8` / `e8c8`) and THROWS (not returns null) on the 960 form.
 * Anywhere the drill engine hands a pool-sourced UCI to chess.js,
 * pipe it through this helper first.
 */
export function normalizeCastlingUci(uci: string): string {
  if (uci.length < 4) return uci;
  const fromFile = uci[0];
  const fromRank = uci[1];
  const toFile = uci[2];
  const toRank = uci[3];
  if (fromFile !== 'e') return uci;
  if (fromRank !== toRank) return uci;
  if (fromRank !== '1' && fromRank !== '8') return uci;
  if (toFile === 'h') return `e${fromRank}g${fromRank}${uci.slice(4)}`;
  if (toFile === 'a') return `e${fromRank}c${fromRank}${uci.slice(4)}`;
  return uci;
}
