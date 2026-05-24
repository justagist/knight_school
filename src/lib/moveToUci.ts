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
