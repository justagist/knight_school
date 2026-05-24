import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { uuid } from '../lib/uuid';
import type { DrillLineRow } from '../db/db';
import {
  fenAtPly,
  isUserTurn,
  recordDrillAttempt,
} from '../db/drillLines';

export type DrillStatus = 'playing' | 'feedback' | 'wrong' | 'complete';
export type DrillVariant = 'board' | 'guess';

export interface DrillWrongDetails {
  ply: number;
  playedSan: string;
  playedUci: string;
  expectedSan: string;
  expectedUci: string;
}

export interface DrillState {
  status: DrillStatus;
  /** How many plies of the line have been played so far. */
  ply: number;
  /** Current board FEN - derived from ply. */
  fen: string;
  /** True when it's the user's turn (i.e. app waiting on input). */
  awaitingUser: boolean;
  /** Filled when status === 'wrong'. */
  wrong?: DrillWrongDetails;
  /** Filled when status === 'feedback' - chapter author's note shown
   *  after a correct user move. User taps "Next" to advance. */
  feedbackComment?: string;
  /** True when chat was used during this attempt - does not count toward stats. */
  invalidated: boolean;
  variant: DrillVariant;
}

interface UseDrillArgs {
  line: DrillLineRow;
  variant?: DrillVariant;
  /** Fires when the drill completes (pass / fail). UI can show next-line CTA. */
  onFinished?: (result: 'pass' | 'fail') => void;
}

export interface UseDrillReturn {
  state: DrillState;
  /** Submit a UCI move from the board (or a SAN string from the guess input). */
  submitMove: (input: string) => void;
  /** Mark this attempt as invalidated (chat used). */
  invalidate: () => void;
  /** Dismiss the feedback card and resume play. No-op outside 'feedback'. */
  next: () => void;
  /** Restart the drill from ply 0. */
  retry: () => void;
  /** Last move played by user or app (for board highlight). */
  lastMove?: [string, string];
}

const OPPONENT_MOVE_DELAY_MS = 500;

/**
 * Drill state machine. Walks the user through the chapter's main line one
 * move at a time:
 *
 *   1. If it's the user's turn, wait for {@link submitMove}. Compare against
 *      the chapter's expected move. Match → advance. Miss → status='wrong'.
 *   2. If it's the opponent's turn, automatically play after a short delay
 *      (so the board animates instead of teleporting).
 *   3. When `ply === uciMoves.length`, status='complete'.
 *
 * Submit accepts either a UCI string (board drag) or a SAN string (guess
 * variant) - we resolve SAN against the current FEN with chess.js.
 *
 * Stats persistence happens inside this hook on terminal state - the caller
 * doesn't need to call recordDrillAttempt manually.
 */
export function useDrill({ line, variant = 'board', onFinished }: UseDrillArgs): UseDrillReturn {
  const total = line.uciMoves.length;
  const [ply, setPly] = useState(0);
  const [status, setStatus] = useState<DrillStatus>('playing');
  const [wrong, setWrong] = useState<DrillWrongDetails | undefined>(undefined);
  const [feedbackComment, setFeedbackComment] = useState<string | undefined>(undefined);
  const [invalidated, setInvalidated] = useState(false);
  const [lastMove, setLastMove] = useState<[string, string] | undefined>(undefined);

  // Stable attempt id so all recorded attempts under this hook share one id.
  const attemptIdRef = useRef<string>(uuid());
  const startedAtRef = useRef<number>(Date.now());
  const persistedRef = useRef(false);

  // Reset internal state when the line itself changes (Practice queue moves
  // to the next line, or user switches chapters).
  useEffect(() => {
    attemptIdRef.current = uuid();
    startedAtRef.current = Date.now();
    persistedRef.current = false;
    setPly(0);
    setStatus('playing');
    setWrong(undefined);
    setFeedbackComment(undefined);
    setInvalidated(false);
    setLastMove(undefined);
  }, [line.id]);

  const fen = useMemo(() => fenAtPly(line, ply), [line, ply]);
  const awaitingUser = status === 'playing' && ply < total && isUserTurn(line, ply);

  // Persist terminal state exactly once per attempt.
  const persist = useCallback(
    (result: 'pass' | 'fail', failure?: DrillWrongDetails) => {
      if (persistedRef.current) return;
      persistedRef.current = true;
      void recordDrillAttempt({
        id: attemptIdRef.current,
        drillLineId: line.id,
        startedAt: startedAtRef.current,
        endedAt: Date.now(),
        result,
        failurePly: failure?.ply,
        failurePlayedSan: failure?.playedSan,
        expectedSan: failure?.expectedSan,
        variant,
        invalidated,
        mode: 'chapter',
      });
      onFinished?.(result);
    },
    [line.id, variant, invalidated, onFinished],
  );

  // Automatically play opponent moves after a short delay.
  useEffect(() => {
    if (status !== 'playing' || ply >= total) return;
    if (isUserTurn(line, ply)) return;
    const t = window.setTimeout(() => {
      const next = line.uciMoves[ply];
      setLastMove([next.slice(0, 2), next.slice(2, 4)]);
      setPly((p) => p + 1);
    }, OPPONENT_MOVE_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [status, ply, total, line]);

  // Detect completion. Done in its own effect so opponent-move advance gets
  // a render before the terminal callback fires.
  useEffect(() => {
    if (status === 'playing' && ply >= total) {
      setStatus('complete');
      persist('pass');
    }
  }, [status, ply, total, persist]);

  const submitMove = useCallback(
    (input: string) => {
      if (status !== 'playing') return;
      if (!isUserTurn(line, ply)) return;
      // Resolve the user's input to a UCI string. Accept either UCI ("e2e4")
      // or SAN ("e4", "Nxf3+") - chess.js handles both via move().
      const chess = new Chess(fen);
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
        // Illegal - treat as wrong so user gets feedback rather than silence.
        const expectedUci = line.uciMoves[ply];
        const expectedSan = line.sanMoves[ply];
        const w: DrillWrongDetails = {
          ply,
          playedSan: input,
          playedUci: '',
          expectedSan,
          expectedUci,
        };
        setWrong(w);
        setStatus('wrong');
        persist('fail', w);
        return;
      }
      const playedUci = `${move.from}${move.to}${move.promotion ?? ''}`;
      const expectedUci = line.uciMoves[ply];
      const expectedSan = line.sanMoves[ply];
      if (playedUci.toLowerCase() === expectedUci.toLowerCase()) {
        const newPly = ply + 1;
        setLastMove([move.from, move.to]);
        setPly(newPly);
        // Pause on the author's note for this move (if any) - gives the
        // user a beat to read the explanation before the opponent
        // teleports in. comments are indexed by post-move ply.
        const comment = line.comments[newPly];
        if (comment) {
          setFeedbackComment(comment);
          setStatus('feedback');
        }
        return;
      }
      const w: DrillWrongDetails = {
        ply,
        playedSan: move.san,
        playedUci,
        expectedSan,
        expectedUci,
      };
      setWrong(w);
      setStatus('wrong');
      persist('fail', w);
    },
    [status, line, ply, fen, persist],
  );

  const invalidate = useCallback(() => setInvalidated(true), []);

  const next = useCallback(() => {
    setStatus((s) => (s === 'feedback' ? 'playing' : s));
    setFeedbackComment(undefined);
  }, []);

  const retry = useCallback(() => {
    // Start a fresh attempt - new id, reset state.
    attemptIdRef.current = uuid();
    startedAtRef.current = Date.now();
    persistedRef.current = false;
    setPly(0);
    setStatus('playing');
    setWrong(undefined);
    setFeedbackComment(undefined);
    setInvalidated(false);
    setLastMove(undefined);
  }, []);

  return {
    state: { status, ply, fen, awaitingUser, wrong, feedbackComment, invalidated, variant },
    submitMove,
    invalidate,
    next,
    retry,
    lastMove,
  };
}
