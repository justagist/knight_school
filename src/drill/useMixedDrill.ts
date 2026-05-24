import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { uuid } from '../lib/uuid';
import type { DrillPositionRow, StudyRow } from '../db/db';
import { recordDrillAttempt } from '../db/drillLines';
import { normalizeFenForExplorer } from '../db/explorer';
import { parsePgn } from '../lib/pgn';

export type MixedDrillMode = 'free' | 'spot';
export type DrillSide = 'white' | 'black';

interface ExpectedMove {
  san: string;
  uci: string;
  chapterIndex: number;
  chapterTitle: string;
  /** Occurrence count across the scope - used to weight opponent replies. */
  weight: number;
}

export interface MixedDrillState {
  /**
   * - `playing`  - board interactive, awaiting user move (or engine reply).
   * - `feedback` - spot-mode pause after a user move; the result card is on
   *                screen and the user must tap "Next spot" to continue.
   * - `wrong`    - free-mode end-of-drill failure card.
   * - `complete` - drill finished (target reached or pool exhausted).
   *
   * Exiting mid-drill is intentionally not recorded as an attempt - the
   * caller just unmounts. No 'aborted' terminal state.
   */
  status: 'playing' | 'feedback' | 'wrong' | 'complete';
  fen: string;
  awaitingUser: boolean;
  /** How many user moves the user has played correctly. */
  userMovesMade: number;
  /** How many user moves the user has played, regardless of correctness.
   *  Used by spot mode for "4/7 correct" tallies in the breadcrumb. */
  userMovesAttempted: number;
  /** True when the user opened chat mid-drill and acknowledged the
   *  invalidation warning. Surfaces in the chat ScreenContext so Elle
   *  knows the user is here for a question, not to keep scoring. */
  invalidated: boolean;
  /** Per-chapter pass count, keyed by chapter index. Filled as we go. */
  perChapterPasses: Map<number, number>;
  /** Per-chapter attempt count (passes + fails). */
  perChapterAttempts: Map<number, number>;
  /** Cumulative failure log - one entry per wrong move (drill ends on first
   *  wrong move in free mode, can have multiple entries in spot mode). */
  failures: Array<{
    fen: string;
    playedSan: string;
    expected: ExpectedMove[];
  }>;
  wrong?: {
    playedSan: string;
    expected: ExpectedMove[];
  };
  /** Spot-mode feedback payload - set when status='feedback'. Holds
   *  pass/fail + the move details so the result card can render. */
  feedback?: {
    pass: boolean;
    playedSan: string;
    expected: ExpectedMove[];
    matchedChapterTitle?: string;
  };
  lastMove?: [string, string];
  /** Target length (number of user moves the drill targets). 0 = all (∞). */
  target: number;
}

interface UseMixedDrillArgs {
  study: StudyRow;
  positions: DrillPositionRow[];
  chapterScope: Set<number>;
  userSide: DrillSide;
  mode: MixedDrillMode;
  /** 0 = unlimited. */
  length: number;
  onFinished?: (result: 'pass' | 'fail', invalidated: boolean) => void;
}

const OPPONENT_MOVE_DELAY_MS = 450;

/**
 * Mixed-drill state machine. Walks user-side moves across the pool of
 * positions for the chosen chapter scope. On each user turn:
 *
 *   1. Look up the current FEN in the position pool.
 *   2. Filter occurrences to (chapterScope) + (sideToMove === userSide).
 *   3. Compare user's move against the expected set. Match → advance and
 *      have the app play a weighted-random opponent reply from the same
 *      filtered occurrences at the next FEN. Miss → record + (free mode)
 *      end drill / (spot mode) move on to the next spot position.
 *
 * On line exhaustion (no continuation found in the pool), the engine
 * teleports to a fresh starting position from the scope so the drill can
 * keep accumulating user moves toward the target length.
 */
export function useMixedDrill({
  study,
  positions,
  chapterScope,
  userSide,
  mode,
  length,
  onFinished,
}: UseMixedDrillArgs): {
  state: MixedDrillState;
  submitMove: (input: string) => void;
  /** Advance the drill after a spot-mode feedback card. No-op in free
   *  mode (free transitions automatically between user turns). */
  next: () => void;
  /** Mark the current attempt as invalidated - called by the chat
   *  warning modal when the user opens chat mid-drill. */
  invalidate: () => void;
  retry: () => void;
  /** All entries in the pool that are spot-position candidates (used by the
   *  modal's "no spots available" empty state). */
  spotCount: number;
} {
  // Build a fast lookup: fenKey → position row.
  const byFen = useMemo(() => {
    const map = new Map<string, DrillPositionRow>();
    for (const p of positions) map.set(p.fen, p);
    return map;
  }, [positions]);

  // All chapter starting FENs, filtered to scope. We mine them from the
  // parsed chapter PGNs because the pool indexer only records "this FEN +
  // move from here" pairs, not the bare starting positions.
  const startingFens = useMemo(() => {
    const out: { fen: string; chapterIndex: number }[] = [];
    for (let i = 0; i < study.chapters.length; i++) {
      if (!chapterScope.has(i)) continue;
      try {
        const parsed = parsePgn(study.chapters[i].pgn);
        out.push({ fen: parsed.startingFen, chapterIndex: i });
      } catch {
        // skip
      }
    }
    return out;
  }, [study, chapterScope]);

  // Spot positions: FENs where exactly one user-move exists across scope
  // AND ply >= 3 in some chapter. Pre-computed so spot mode picks fast.
  const spotPositions = useMemo(() => {
    const out: { fen: string; expected: ExpectedMove; chapterIndex: number; ply: number }[] = [];
    for (const p of positions) {
      const filtered = p.occurrences.filter(
        (o) => chapterScope.has(o.chapterIndex) && o.sideToMove === sideChar(userSide),
      );
      if (filtered.length === 0) continue;
      const sans = new Set(filtered.map((o) => o.san));
      if (sans.size !== 1) continue;
      const minPly = Math.min(...filtered.map((o) => o.ply));
      if (minPly < 3) continue;
      const o = filtered[0];
      out.push({
        fen: p.fen,
        expected: {
          san: o.san,
          uci: o.uci,
          chapterIndex: o.chapterIndex,
          chapterTitle: o.chapterTitle,
          weight: filtered.length,
        },
        chapterIndex: o.chapterIndex,
        ply: minPly,
      });
    }
    return out;
  }, [positions, chapterScope, userSide]);

  const [state, setState] = useState<MixedDrillState>(() =>
    initialState({ startingFens, target: length, userSide }),
  );

  // Stable attempt id so all recordDrillAttempt calls under this hook
  // share one row.
  const attemptIdRef = useRef<string>(uuid());
  const startedAtRef = useRef<number>(Date.now());
  const persistedRef = useRef(false);
  // Mirror state into a ref so the persist callback (memoised once) can
  // read the latest `invalidated` flag without rebuilding on every state
  // change.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  // Reset when the inputs change (a new drill session).
  useEffect(() => {
    attemptIdRef.current = uuid();
    startedAtRef.current = Date.now();
    persistedRef.current = false;
    setState(initialState({ startingFens, target: length, userSide, spotPositions, mode }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [study.id, length, userSide, mode]);

  const persist = useCallback(
    (result: 'pass' | 'fail') => {
      if (persistedRef.current) return;
      persistedRef.current = true;
      void recordDrillAttempt({
        id: attemptIdRef.current,
        // drillLineId is intentionally omitted - mixed sessions span chapters.
        startedAt: startedAtRef.current,
        endedAt: Date.now(),
        result,
        variant: 'board',
        invalidated: stateRef.current.invalidated,
        // The session-level mode is free|spot; map to the persistence-
        // level tag ('mixed' covers free, 'spot' stays its own bucket)
        // so the planner can pick later.
        mode: mode === 'spot' ? 'spot' : 'mixed',
      });
      onFinished?.(result, stateRef.current.invalidated);
    },
    [mode, onFinished],
  );

  // Opponent auto-move (free mode). In spot mode the engine never plays -
  // the user is shown a single position, plays one move, and we advance.
  useEffect(() => {
    if (mode !== 'free') return;
    if (state.status !== 'playing') return;
    if (state.awaitingUser) return;
    // Not the user's turn. Pick an opponent move from the pool.
    const stm = sideToMove(state.fen);
    if (stm === sideChar(userSide)) return; // shouldn't happen - awaitingUser would be true
    // byFen is keyed on the NORMALISED 4-field fen (what the indexer
    // writes). state.fen here is the full chess.js fen, including
    // halfmove + fullmove counters, so the raw lookup misses and the
    // engine thinks the line ran out - teleporting the user to a fresh
    // chapter after every correct move. Normalise first.
    const row = byFen.get(normalizeFenForExplorer(state.fen));
    // Aggregate occurrences by uci so the weighted pick is biased toward
    // the most-common reply across the scope (matches spec's "weighted by
    // occurrence count").
    const bucket = new Map<string, { uci: string; weight: number }>();
    for (const o of row?.occurrences ?? []) {
      if (!chapterScope.has(o.chapterIndex) || o.sideToMove !== stm) continue;
      const existing = bucket.get(o.uci);
      if (existing) existing.weight++;
      else bucket.set(o.uci, { uci: o.uci, weight: 1 });
    }
    const candidates = [...bucket.values()];
    if (candidates.length === 0) {
      // No continuation in the pool - jump to a fresh chapter start so the
      // user keeps drilling toward the target.
      const next = pickStartingFen(startingFens, state.fen);
      if (next) {
        const padded = ensureFullFen(next);
        setState((s) => ({ ...s, fen: padded, awaitingUser: sideToMove(padded) === sideChar(userSide), lastMove: undefined }));
      } else {
        setState((s) => ({ ...s, status: 'complete' }));
        persist('pass');
      }
      return;
    }
    const pick = weightedPick(candidates);
    const t = window.setTimeout(() => {
      const chess = new Chess(state.fen);
      const m = chess.move({
        from: pick.uci.slice(0, 2),
        to: pick.uci.slice(2, 4),
        promotion: pick.uci.length > 4 ? pick.uci.slice(4, 5) : undefined,
      });
      if (!m) {
        // Bad UCI from the pool - bail out gracefully.
        setState((s) => ({ ...s, status: 'complete' }));
        persist('pass');
        return;
      }
      const newFen = chess.fen();
      setState((s) => ({
        ...s,
        fen: newFen,
        awaitingUser: sideToMove(newFen) === sideChar(userSide),
        lastMove: [m.from, m.to],
      }));
    }, OPPONENT_MOVE_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [state.status, state.awaitingUser, state.fen, mode, byFen, chapterScope, userSide, startingFens, persist]);

  // Detect completion in free mode - target reached.
  useEffect(() => {
    if (mode !== 'free') return;
    if (state.status !== 'playing') return;
    if (state.target > 0 && state.userMovesMade >= state.target) {
      setState((s) => ({ ...s, status: 'complete' }));
      persist('pass');
    }
  }, [mode, state.status, state.userMovesMade, state.target, persist]);

  // Line-exhaustion guard. If the user is about to move from a position
  // that has no indexed user-side moves in scope, the chapter ran out
  // here - silently teleport to a fresh chapter start instead of letting
  // submitMove mark the user's next move as wrong-with-empty-expected
  // (which produces the "You played X. Expected:" blank-list bug).
  useEffect(() => {
    if (mode !== 'free') return;
    if (state.status !== 'playing') return;
    if (!state.awaitingUser) return;
    const row = byFen.get(normalizeFenForExplorer(state.fen));
    const exp = aggregateExpected(row, chapterScope, sideChar(userSide));
    if (exp.length > 0) return;
    const next = pickStartingFen(startingFens, state.fen);
    if (next && next !== state.fen) {
      const padded = ensureFullFen(next);
      setState((s) => ({
        ...s,
        fen: padded,
        awaitingUser: sideToMove(padded) === sideChar(userSide),
        lastMove: undefined,
      }));
    } else {
      setState((s) => ({ ...s, status: 'complete' }));
      persist('pass');
    }
  }, [
    mode,
    state.status,
    state.awaitingUser,
    state.fen,
    byFen,
    chapterScope,
    userSide,
    startingFens,
    persist,
  ]);

  const submitMove = useCallback(
    (input: string) => {
      if (state.status !== 'playing') return;
      if (!state.awaitingUser) return;
      const row = byFen.get(normalizeFenForExplorer(state.fen));
      const expected: ExpectedMove[] = aggregateExpected(row, chapterScope, sideChar(userSide));
      // Race with the line-exhaustion guard above - if the user clicked
      // faster than the teleport effect, ignore the click rather than
      // marking a legal move wrong against an empty expected set.
      if (expected.length === 0) return;
      // Resolve user's input to UCI for comparison.
      const chess = new Chess(state.fen);
      let move: ReturnType<typeof chess.move> | null = null;
      try {
        if (/^[a-h][1-8][a-h][1-8][qrnb]?$/i.test(input)) {
          move = chess.move({
            from: input.slice(0, 2),
            to: input.slice(2, 4),
            promotion: input.length > 4 ? input.slice(4, 5) : undefined,
          });
        } else {
          move = chess.move(input);
        }
      } catch {
        move = null;
      }
      if (!move) {
        setState((s) => recordFailure(s, input, expected, mode, spotPositions));
        if (mode === 'free') persist('fail');
        return;
      }
      const playedUci = `${move.from}${move.to}${move.promotion ?? ''}`;
      const matched = expected.find((e) => e.uci.toLowerCase() === playedUci.toLowerCase());
      if (!matched) {
        setState((s) => recordFailure(s, move!.san, expected, mode, spotPositions));
        if (mode === 'free') persist('fail');
        return;
      }
      // Correct. Advance.
      const newFen = chess.fen();
      const chapterIdx = matched.chapterIndex;
      setState((s) => {
        const perChapterPasses = new Map(s.perChapterPasses);
        perChapterPasses.set(chapterIdx, (perChapterPasses.get(chapterIdx) ?? 0) + 1);
        const perChapterAttempts = new Map(s.perChapterAttempts);
        perChapterAttempts.set(chapterIdx, (perChapterAttempts.get(chapterIdx) ?? 0) + 1);
        if (mode === 'spot') {
          // Spot mode: show the result card, wait for user to tap "Next"
          // before advancing. Avoids the silent "click made nothing
          // happen" experience the prior version gave.
          return {
            ...s,
            status: 'feedback' as const,
            awaitingUser: false,
            fen: newFen,
            userMovesMade: s.userMovesMade + 1,
            userMovesAttempted: s.userMovesAttempted + 1,
            perChapterPasses,
            perChapterAttempts,
            lastMove: [move!.from, move!.to],
            feedback: {
              pass: true,
              playedSan: move!.san,
              expected,
              matchedChapterTitle: matched.chapterTitle,
            },
          };
        }
        return {
          ...s,
          fen: newFen,
          awaitingUser: sideToMove(newFen) === sideChar(userSide),
          userMovesMade: s.userMovesMade + 1,
          userMovesAttempted: s.userMovesAttempted + 1,
          perChapterPasses,
          perChapterAttempts,
          lastMove: [move!.from, move!.to],
        };
      });
    },
    [state, byFen, chapterScope, userSide, mode, spotPositions, persist],
  );

  const invalidate = useCallback(() => {
    setState((s) => ({ ...s, invalidated: true }));
  }, []);

  const next = useCallback(() => {
    // Advance to the next spot position after the feedback card is shown.
    // Free mode doesn't use this - its 'wrong' status terminates the drill.
    setState((s) => {
      if (s.status !== 'feedback') return s;
      if (mode !== 'spot') return { ...s, status: 'playing' };
      // Target reached → complete.
      if (s.target > 0 && s.userMovesAttempted >= s.target) {
        return { ...s, status: 'complete', feedback: undefined };
      }
      const nextSpot = pickNextSpot(spotPositions, s.fen);
      if (!nextSpot) {
        return { ...s, status: 'complete', feedback: undefined };
      }
      const padded = ensureFullFen(nextSpot.fen);
      return {
        ...s,
        status: 'playing',
        fen: padded,
        awaitingUser: sideToMove(padded) === sideChar(userSide),
        feedback: undefined,
        lastMove: undefined,
      };
    });
  }, [mode, spotPositions]);

  const retry = useCallback(() => {
    attemptIdRef.current = uuid();
    startedAtRef.current = Date.now();
    persistedRef.current = false;
    setState(initialState({ startingFens, target: length, userSide, spotPositions, mode }));
  }, [startingFens, length, userSide, spotPositions, mode]);

  return { state, submitMove, next, invalidate, retry, spotCount: spotPositions.length };
}

function initialState(args: {
  startingFens: { fen: string; chapterIndex: number }[];
  target: number;
  userSide: DrillSide;
  spotPositions?: { fen: string }[];
  mode?: MixedDrillMode;
}): MixedDrillState {
  const { startingFens, target, userSide, spotPositions, mode } = args;
  // Pick starting FEN. Spot mode draws from the spot pool when available;
  // free mode draws from chapter starts.
  //
  // TODO(spot-setup-walk): per the original mixed-drill spec, spot mode
  // should play the previous 2–4 moves automatically before asking the
  // user to find the critical move - gives them the lead-up context.
  // Plug-in point: when picking a spot here, look up the matching
  // occurrence's chapter + ply, replay that chapter's moves from
  // (ply - 3) up to (ply - 1) via a short animation loop, THEN set
  // `awaitingUser: true` and the user moves. Skipped for MVP - the
  // current behaviour teleports straight to the spot FEN.
  let fen =
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  if (mode === 'spot' && spotPositions && spotPositions.length > 0) {
    fen = ensureFullFen(spotPositions[Math.floor(Math.random() * spotPositions.length)].fen);
  } else if (startingFens.length > 0) {
    fen = ensureFullFen(startingFens[Math.floor(Math.random() * startingFens.length)].fen);
  }
  return {
    status: 'playing',
    fen,
    awaitingUser: sideToMove(fen) === sideChar(userSide),
    userMovesMade: 0,
    userMovesAttempted: 0,
    invalidated: false,
    perChapterPasses: new Map(),
    perChapterAttempts: new Map(),
    failures: [],
    wrong: undefined,
    feedback: undefined,
    lastMove: undefined,
    target,
  };
}

function recordFailure(
  s: MixedDrillState,
  playedSan: string,
  expected: ExpectedMove[],
  mode: MixedDrillMode,
  // spotPositions stays in the arg list so spot-mode advancement is
  // a future-friendly tweak; currently we land on 'feedback' instead
  // of teleporting.
  _spotPositions: { fen: string }[],
): MixedDrillState {
  const failures = [...s.failures, { fen: s.fen, playedSan, expected }];
  const perChapterAttempts = new Map(s.perChapterAttempts);
  for (const e of expected) {
    perChapterAttempts.set(e.chapterIndex, (perChapterAttempts.get(e.chapterIndex) ?? 0) + 1);
  }
  if (mode === 'free') {
    return {
      ...s,
      status: 'wrong',
      wrong: { playedSan, expected },
      failures,
      perChapterAttempts,
      userMovesAttempted: s.userMovesAttempted + 1,
    };
  }
  // Spot mode: land on 'feedback' so the result card renders. The user
  // taps "Next spot" to advance (handled by the `next()` action below).
  return {
    ...s,
    status: 'feedback',
    awaitingUser: false,
    failures,
    perChapterAttempts,
    userMovesAttempted: s.userMovesAttempted + 1,
    feedback: { pass: false, playedSan, expected },
  };
}

function pickNextSpot(
  spots: { fen: string }[],
  current: string,
): { fen: string } | undefined {
  const remaining = spots.filter((s) => s.fen !== current);
  if (remaining.length === 0) return undefined;
  return remaining[Math.floor(Math.random() * remaining.length)];
}

function aggregateExpected(
  row: DrillPositionRow | undefined,
  scope: Set<number>,
  side: 'w' | 'b',
): ExpectedMove[] {
  if (!row) return [];
  const bucket = new Map<string, ExpectedMove>();
  for (const o of row.occurrences) {
    if (!scope.has(o.chapterIndex)) continue;
    if (o.sideToMove !== side) continue;
    const key = o.uci;
    const existing = bucket.get(key);
    if (existing) {
      existing.weight++;
    } else {
      bucket.set(key, {
        san: o.san,
        uci: o.uci,
        chapterIndex: o.chapterIndex,
        chapterTitle: o.chapterTitle,
        weight: 1,
      });
    }
  }
  return [...bucket.values()];
}

function weightedPick<T extends { weight: number }>(items: T[]): T {
  const total = items.reduce((acc, x) => acc + x.weight, 0);
  let r = Math.random() * total;
  for (const it of items) {
    r -= it.weight;
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

function pickStartingFen(
  starts: { fen: string; chapterIndex: number }[],
  exclude: string,
): string | undefined {
  const candidates = starts.filter((s) => s.fen !== exclude);
  if (candidates.length === 0) return starts[0]?.fen;
  return candidates[Math.floor(Math.random() * candidates.length)].fen;
}

function sideChar(side: DrillSide): 'w' | 'b' {
  return side === 'white' ? 'w' : 'b';
}

function sideToMove(fen: string): 'w' | 'b' {
  return fen.split(' ')[1] === 'b' ? 'b' : 'w';
}

/**
 * The position indexer keys positions by a 4-field FEN (drops halfmove +
 * fullmove counters). chess.js requires the full 6-field FEN to construct
 * a Chess instance - without it, legalDests() throws and the board appears
 * dead. Pad missing fields with sensible defaults so any FEN coming out of
 * the pool is safe to hand back to chess.js.
 */
function ensureFullFen(fen: string): string {
  const parts = fen.split(' ');
  if (parts.length >= 6) return fen;
  while (parts.length < 4) parts.push('-');
  if (parts.length < 5) parts.push('0');
  if (parts.length < 6) parts.push('1');
  return parts.join(' ');
}
