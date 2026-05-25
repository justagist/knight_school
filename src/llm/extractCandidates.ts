import { Chess, type Move } from 'chess.js';

/**
 * One candidate move the user's chat message referenced, validated as
 * legal at the current position.
 */
export interface Candidate {
  /** Canonical SAN (e.g. "Nf3", "O-O", "exd5"). */
  san: string;
  /** UCI form ("g1f3", "e1g1", "e7e8q"). */
  uci: string;
  from: string;
  to: string;
  promotion?: string;
}

const PIECE_BY_NAME: Record<string, 'K' | 'Q' | 'R' | 'B' | 'N' | 'P'> = {
  king: 'K',
  queen: 'Q',
  rook: 'R',
  bishop: 'B',
  knight: 'N',
  pawn: 'P',
  // common informal variants
  horse: 'N',
};

/**
 * Pull candidate moves out of a free-text chat message. Handles:
 *
 *  - SAN, case-insensitive: `nf3`, `Nf3`, `BxD5`, `exd5`, `e4`, `o-o`,
 *    `O-O-O`, `0-0`, `e8=q`, plus the optional `+` / `#` suffix.
 *  - Natural-language: "knight to f3", "bishop takes e5", "rook on a1
 *    moves to a5", "castle short", "kingside castle", "pawn captures
 *    d5", "queen takes f7+".
 *
 * Each candidate is validated against the actual legal-move list at
 * `currentFen` (chess.js's `chess.moves({ verbose: true })`). Illegal,
 * ambiguous-with-no-disambiguator, or unparseable strings drop out
 * silently - the goal is "what specific moves does the user clearly
 * mean", not strict parsing.
 *
 * De-duped by UCI. Order preserved by first mention in the message.
 */
export function extractCandidates(message: string, currentFen: string): Candidate[] {
  let chess: Chess;
  try {
    chess = new Chess(currentFen);
  } catch {
    return [];
  }
  const legal = chess.moves({ verbose: true }) as Move[];
  if (legal.length === 0) return [];

  // Lookup tables for SAN matching:
  // - lowercase-SAN -> Move (covers "nf3" and "Nf3", "o-o" and "O-O", etc.)
  // - lowercase-SAN-without-decorations -> Move (drops + / # / x in the SAN
  //   string itself so a casual "Nxf3" still matches "Nf3" if the user
  //   wrote it that way and vice versa).
  const byLowerSan = new Map<string, Move>();
  for (const m of legal) {
    byLowerSan.set(m.san.toLowerCase(), m);
    // Also index without any decoration so "nf3" matches "Nf3+".
    const undecorated = m.san.replace(/[+#x=]/g, '').toLowerCase();
    if (!byLowerSan.has(undecorated)) byLowerSan.set(undecorated, m);
  }

  const found: Candidate[] = [];
  const seen = new Set<string>();
  const push = (m: Move) => {
    const uci = `${m.from}${m.to}${m.promotion ?? ''}`;
    if (seen.has(uci)) return;
    seen.add(uci);
    found.push({ san: m.san, uci, from: m.from, to: m.to, promotion: m.promotion });
  };

  // 1. Castling phrases.
  const castleRe = /\b(?:castle[s]?\s+(?:short|long|king[- ]?side|queen[- ]?side)|(?:short|long|king[- ]?side|queen[- ]?side)[- ]?castle[s]?)\b/gi;
  for (const match of message.matchAll(castleRe)) {
    const txt = match[0].toLowerCase();
    const short = /short|king/.test(txt);
    const wantSan = short ? 'o-o' : 'o-o-o';
    const m = byLowerSan.get(wantSan);
    if (m) push(m);
  }

  // 2. SAN tokens (covers "nf3", "Nf3", "exd5", "e4", "o-o", "0-0",
  //    promotions like "e8=Q", with optional + / # suffix).
  //    The regex is intentionally permissive; validation happens via
  //    the lookup against actual legal moves.
  const sanRe = /\b(?:[KQRBN][a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|[a-h]x[a-h][1-8](?:=[QRBN])?[+#]?|[a-h][1-8](?:=[QRBN])?[+#]?|O-O(?:-O)?|0-0(?:-0)?)\b/gi;
  for (const match of message.matchAll(sanRe)) {
    const raw = match[0];
    // Normalise: piece letter uppercase, file letter lowercase, rank
    // digit unchanged, decoration unchanged. `0-0` -> `O-O`.
    const normalised = normaliseSan(raw);
    // Try the exact normalised form first, then the undecorated form.
    const exact = byLowerSan.get(normalised.toLowerCase());
    if (exact) {
      push(exact);
      continue;
    }
    const undecorated = normalised.replace(/[+#x=]/g, '').toLowerCase();
    const alt = byLowerSan.get(undecorated);
    if (alt) push(alt);
  }

  // 3. Natural-language piece moves: "knight to f3", "bishop takes e5",
  //    "rook on a1 moves to a5", "queen captures f7". Optional source
  //    square disambiguator is honoured.
  const nlRe = /\b(king|queen|rook|bishop|knight|pawn|horse)(?:\s+on\s+([a-h][1-8]))?\s+(?:to|moves?\s+to|goes?\s+to|takes?|captures?|x)\s+([a-h][1-8])\b/gi;
  for (const match of message.matchAll(nlRe)) {
    const piece = PIECE_BY_NAME[match[1].toLowerCase()];
    const fromSq = match[2]?.toLowerCase();
    const toSq = match[3].toLowerCase();
    if (!piece) continue;
    const matches = legal.filter((m) => {
      const pieceMatches = piece === 'P' ? m.piece === 'p' : m.piece.toUpperCase() === piece;
      if (!pieceMatches) return false;
      if (m.to !== toSq) return false;
      if (fromSq && m.from !== fromSq) return false;
      return true;
    });
    // Only push when the description resolves to exactly one legal
    // move - otherwise the user's intent is ambiguous and silently
    // ignoring is better than guessing wrong.
    if (matches.length === 1) push(matches[0]);
  }

  return found;
}

/**
 * Best-effort SAN normalisation. Uppercase the piece letter, leave
 * everything else as-is. Doesn't validate - the caller looks the
 * result up against the actual legal-move table.
 */
function normaliseSan(raw: string): string {
  // `0-0` and `0-0-0` -> `O-O` / `O-O-O`.
  if (/^0-0-0$/i.test(raw)) return 'O-O-O';
  if (/^0-0$/i.test(raw)) return 'O-O';
  if (/^o-o-o$/i.test(raw)) return 'O-O-O';
  if (/^o-o$/i.test(raw)) return 'O-O';
  // Uppercase the leading piece letter when present.
  if (/^[KQRBN]/i.test(raw)) {
    return raw[0].toUpperCase() + raw.slice(1).replace(/=([qrbn])/i, (_, p) => `=${p.toUpperCase()}`);
  }
  // Pawn moves: lowercase first char unless it's the en-passant capture
  // file already lowercase. Just lowercase the file letters defensively
  // and uppercase any promotion piece.
  return raw.replace(/=([qrbn])/i, (_, p) => `=${p.toUpperCase()}`);
}
