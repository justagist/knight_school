/**
 * Move classification.
 *
 * Switched from raw centipawn-loss thresholds to **win-probability based**
 * classification (the Lichess approach). CP-loss thresholds are wildly
 * miscalibrated in the opening: a 50 cp shift around equal play barely moves
 * a real chess outcome, but it would still flag a perfectly normal opening
 * move as an "inaccuracy." Win probability is roughly linear in expected
 * outcome, so it gives much saner classifications.
 *
 * Conversion (Lichess formula):
 *   winChance = 50 + 50 * (2 / (1 + exp(-0.00368 * cp)) - 1)
 * where `cp` is centipawns from the moving side's perspective.
 *
 * Thresholds on **drop in mover's win probability** (before → after):
 *   ≥ 20%     → blunder    (??)
 *   ≥ 10%     → mistake    (?)
 *   ≥  5%     → inaccuracy (?!)
 *   <  5%     → 'best' if mover played the engine's #1 line, else 'good'
 *
 * Additional guards:
 *  - Skip classification entirely if either cached row is shallower than
 *    {@link MIN_CLASSIFY_DEPTH}. The eval at depth < 16 isn't reliable enough
 *    to call a move a mistake.
 *  - For moves 1–6 of every game, label 'opening' instead of classifying.
 *    This is a deliberate placeholder until Step 7 (Opening Explorer)
 *    delivers true book-position detection via Lichess masters DB. See
 *    DEVELOPMENT.md "Move classification logic" for details.
 *  - The 'book' classification type is reserved for Step 7 — currently
 *    unused but kept in the type union so the UI work doesn't need to
 *    change when Explorer lands.
 *
 * "Brilliant" is intentionally skipped for MVP (per the build spec).
 */

import type { ExplorerEntryRow, PositionEvalRow } from '../db/db';
import { BOOK_MIN_GAMES } from '../explorer/client';

export type MoveClass =
  | 'opening' // Temporary: first 6 moves; unclassified by design
  | 'book'    // Reserved for Step 7: position appears in Lichess masters DB
  | 'best'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder';

export interface ClassifyArgs {
  /** Eval of position BEFORE the move was made. side-to-move = mover. */
  before: { scoreCp?: number; mate?: number; bestUci?: string };
  /** Eval of position AFTER the move was made. side-to-move = opponent. */
  after: { scoreCp?: number; mate?: number };
  /** The actual UCI move that was played. */
  playedUci: string;
}

/** Minimum cached eval depth required to classify (else: no glyph + UI note). */
export const MIN_CLASSIFY_DEPTH = 16;

/** Number of plies (half-moves) at the start treated as 'opening' fallback. */
export const OPENING_PLY_THRESHOLD = 12; // moves 1–6 of every game

/** Win-probability thresholds on the drop (mover POV, percentage points). */
const WP_BLUNDER = 20;
const WP_MISTAKE = 10;
const WP_INACCURACY = 5;

/** Mate "centipawn" magnitude used in winChance(). Saturates the sigmoid. */
const MATE_CP = 10000;

/**
 * Lichess's centipawn → win-probability conversion. Input is in centipawns
 * from the moving side's POV; output is a percentage in [0, 100].
 *
 * The sigmoid is calibrated so ~+100 cp ≈ 59% win chance, ~+300 cp ≈ 76%,
 * matching empirical game outcomes in Lichess's database.
 */
export function winChance(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368 * cp)) - 1);
}

/**
 * Express a side-to-move-perspective eval as a centipawn value from a
 * chosen POV. Mate flattens to ±MATE_CP.
 *
 *   - `score` is the engine's eval (always from side-to-move's POV).
 *   - `isFromMoversTurn` is true when side-to-move IS the perspective we want.
 */
function asCpFromPerspective(
  score: { scoreCp?: number; mate?: number },
  isFromMoversTurn: boolean,
): number {
  let cp: number;
  if (score.mate != null) {
    // mate > 0: side-to-move mates. mate < 0: side-to-move gets mated.
    // mate = 0: side-to-move IS mated.
    if (score.mate > 0) cp = MATE_CP - score.mate;
    else if (score.mate < 0) cp = -MATE_CP - score.mate;
    else cp = -MATE_CP;
  } else if (score.scoreCp != null) {
    cp = score.scoreCp;
  } else {
    cp = 0;
  }
  return isFromMoversTurn ? cp : -cp;
}

export function classifyMove(args: ClassifyArgs): MoveClass {
  // before: side-to-move IS the mover.
  const beforeCp = asCpFromPerspective(args.before, true);
  // after: side-to-move is the opponent (mover already moved).
  const afterCp = asCpFromPerspective(args.after, false);

  const beforeWp = winChance(beforeCp);
  const afterWp = winChance(afterCp);
  const drop = beforeWp - afterWp;

  if (drop >= WP_BLUNDER) return 'blunder';
  if (drop >= WP_MISTAKE) return 'mistake';
  if (drop >= WP_INACCURACY) return 'inaccuracy';

  if (args.before.bestUci && args.before.bestUci === args.playedUci) return 'best';
  return 'good';
}

/**
 * Per-move classifier consuming cached eval rows.
 *
 * Returns:
 *   - `'book'` if Lichess Masters DB has >= {@link BOOK_MIN_GAMES} games at
 *     the BEFORE position (the played move is opening theory — engine eval
 *     isn't the right framing). This supersedes everything else.
 *   - `null` if either cached row is below {@link MIN_CLASSIFY_DEPTH} or
 *     missing — caller renders no glyph + can surface a "depth too low" note.
 *   - `'opening'` as an offline fallback for the first
 *     {@link OPENING_PLY_THRESHOLD} plies when no Explorer data is in cache
 *     yet (the user hasn't run analysis, hasn't been online, or this is
 *     transient before Explorer fetches resolve). Once Explorer lands a
 *     real "book" answer it takes over.
 *   - Otherwise the win-probability classification.
 *
 * `moveIndex` is the 0-based index of the move in the game (move 1 white = 0).
 * `explorerBefore` is the cached Explorer row for the position BEFORE the
 * move (may be undefined — for opening positions we still emit 'opening' as
 * a fallback, for later positions the absence is normal).
 */
export function classifyFromCachedRows(
  before: PositionEvalRow | undefined,
  after: PositionEvalRow | undefined,
  playedUci: string,
  moveIndex: number,
  explorerBefore?: ExplorerEntryRow | undefined,
): MoveClass | null {
  if (!before || !after) return null;

  // Real book: Lichess Masters DB has at least BOOK_MIN_GAMES master games
  // at this position. The played move is by-definition theory; engine
  // micro-eval differences are noise here.
  if (explorerBefore && explorerBefore.totalGames >= BOOK_MIN_GAMES) {
    return 'book';
  }

  // Offline / not-yet-fetched fallback: for the first few plies we still
  // suppress harsh classifications. Real Explorer data above supersedes
  // this once it arrives.
  if (moveIndex < OPENING_PLY_THRESHOLD && !explorerBefore) return 'opening';

  // Terminal rows are stored at depth 0; classify them anyway since they're
  // not "shallow analysis" — they're definitive outcomes.
  const isTerminalBefore = before.depth === 0 && (before.mate != null || before.scoreCp != null);
  const isTerminalAfter = after.depth === 0 && (after.mate != null || after.scoreCp != null);
  if (!isTerminalBefore && before.depth < MIN_CLASSIFY_DEPTH) return null;
  if (!isTerminalAfter && after.depth < MIN_CLASSIFY_DEPTH) return null;

  return classifyMove({
    before: { scoreCp: before.scoreCp, mate: before.mate, bestUci: before.bestUci },
    after: { scoreCp: after.scoreCp, mate: after.mate },
    playedUci,
  });
}

export interface MoveClassStyle {
  glyph: string;
  label: string;
  ariaLabel: string;
  colorClass: string;
}

export const MOVE_CLASS_STYLES: Record<MoveClass, MoveClassStyle> = {
  opening: {
    glyph: '○',
    label: 'Opening',
    ariaLabel: 'opening',
    colorClass: 'text-sky-600 dark:text-sky-400',
  },
  // Reserved for Step 7. Visually distinct from 'opening' so future games
  // analyzed with Explorer-aware classification stand out.
  book: {
    glyph: '◎',
    label: 'Theory',
    ariaLabel: 'opening theory',
    colorClass: 'text-sky-700 dark:text-sky-300',
  },
  best: {
    glyph: '!',
    label: 'Best',
    ariaLabel: 'best move',
    colorClass: 'text-emerald-600 dark:text-emerald-400',
  },
  good: {
    // No glyph by design — matches Lichess UX which keeps the move list quiet
    // on routine moves.
    glyph: '',
    label: 'Good',
    ariaLabel: 'good move',
    colorClass: 'text-ink-500 dark:text-ink-400',
  },
  inaccuracy: {
    glyph: '?!',
    label: 'Inaccuracy',
    ariaLabel: 'inaccuracy',
    colorClass: 'text-amber-600 dark:text-amber-400',
  },
  mistake: {
    glyph: '?',
    label: 'Mistake',
    ariaLabel: 'mistake',
    colorClass: 'text-orange-600 dark:text-orange-400',
  },
  blunder: {
    glyph: '??',
    label: 'Blunder',
    ariaLabel: 'blunder',
    colorClass: 'text-red-600 dark:text-red-400',
  },
};
