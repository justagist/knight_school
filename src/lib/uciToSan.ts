import { Chess } from 'chess.js';

/**
 * Replay a UCI move sequence on a starting FEN and return the SAN of each
 * move. Stops at the first illegal move (returns whatever was parsed up to
 * that point — better than throwing inside system-prompt generation).
 *
 * UCI moves are coordinate notation: "e2e4", "e7e8q" (promotion). chess.js
 * accepts the same {from, to, promotion} shape after we slice the string.
 */
export function uciSequenceToSan(startFen: string, uciMoves: string[]): string[] {
  if (uciMoves.length === 0) return [];
  let chess: Chess;
  try {
    chess = new Chess(startFen);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const uci of uciMoves) {
    if (uci.length < 4) break;
    try {
      const move = chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.length > 4 ? uci.slice(4, 5) : undefined,
      });
      if (!move) break;
      out.push(move.san);
    } catch {
      break;
    }
  }
  return out;
}

/**
 * Format a SAN sequence with move numbers prefixed (e.g.
 * "15. Nf3 Nxe4 16. Qxe4 Bxh2+"). Uses the FEN to pick up the side-to-move
 * and full-move counter for accurate numbering. Caller decides how many
 * moves to pass in.
 */
export function sanSequenceWithNumbers(startFen: string, sans: string[]): string {
  if (sans.length === 0) return '';
  const fields = startFen.split(' ');
  const stm = fields[1] === 'b' ? 'b' : 'w';
  const fullMoveNum = Number.parseInt(fields[5] ?? '1', 10) || 1;

  const parts: string[] = [];
  let move = fullMoveNum;
  let side = stm;
  for (let i = 0; i < sans.length; i++) {
    if (side === 'w') {
      parts.push(`${move}. ${sans[i]}`);
    } else {
      if (i === 0) parts.push(`${move}... ${sans[i]}`);
      else parts.push(sans[i]);
      move++;
    }
    side = side === 'w' ? 'b' : 'w';
  }
  return parts.join(' ');
}
