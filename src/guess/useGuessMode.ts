import { useCallback, useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { addGuess, getGameStats, getOverallStats, type GuessStats } from '../db/guess';
import { pgnHash } from '../db/chat';
import type { ParsedGame } from '../lib/pgn';
import { moveToUci } from '../lib/moveToUci';
import type { PositionEvalRow } from '../db/db';

export type GuessMode = 'off' | 'guessing' | 'revealed';

export interface GuessComparison {
  guessUci: string;
  guessSan: string;
  playedUci: string;
  playedSan: string;
  engineBestUci?: string;
  engineBestSan?: string;
  matchesPlayed: boolean;
  matchesEngine: boolean;
}

export interface UseGuessModeArgs {
  game: ParsedGame | null;
  rawPgn: string | null;
  /** Current ply the board is displaying (0 = starting position). */
  ply: number;
  /** Hand the ply state back when guess-mode advances. */
  setPly: (n: number) => void;
  /** Engine eval rows by ply index — read to derive engine's top move. */
  evals: (PositionEvalRow | undefined)[];
}

export interface UseGuessModeReturn {
  mode: GuessMode;
  /** True when the toggle is on (mode != 'off'). */
  active: boolean;
  /** UI-side comparison after a guess is submitted. null until revealed. */
  comparison: GuessComparison | null;
  /** Side to move at the current ply. Used by Board to limit dragging. */
  sideToMove: 'white' | 'black';
  /** The move that's being guessed at the current ply, if any. */
  expectedMove: { san: string; uci: string } | null;
  /** Stats — refreshed after each submit. */
  gameStats: GuessStats;
  overallStats: GuessStats;

  /** Enter guess mode. */
  start: () => void;
  /** Leave guess mode and clear pending state. */
  stop: () => void;
  /**
   * Submit a guess. uci = "e2e4" / "e7e8q". Returns the resulting
   * comparison, or null if the guess was illegal at this position.
   */
  submit: (uci: string) => GuessComparison | null;
  /** Advance to the next ply and re-arm the prompt. No-op at end-of-game. */
  next: () => void;
  /** Skip this ply without recording a guess. Advances the ply. */
  skip: () => void;
}

const EMPTY_STATS: GuessStats = {
  totalGuessed: 0,
  matchesPlayed: 0,
  matchesEngine: 0,
  playedRate: 0,
  engineRate: 0,
};

/**
 * State machine + Dexie I/O for "Guess the move" mode.
 *
 * Lifecycle:
 *  - off       : feature disabled. Board is view-only, engine shows normally.
 *  - guessing  : board is interactive for the side to move; user picks a move.
 *  - revealed  : we've recorded the guess; show comparison; user clicks Next.
 *
 * Each submission writes a row to Dexie via {@link addGuess}, then stats
 * refresh. The comparison shows BOTH "matches played" and "matches engine"
 * because they're different things — Guess-mode rewards the more-correct
 * answer when the actual played move was a mistake.
 */
export function useGuessMode(args: UseGuessModeArgs): UseGuessModeReturn {
  const { game, rawPgn, ply, setPly, evals } = args;
  const [mode, setMode] = useState<GuessMode>('off');
  const [comparison, setComparison] = useState<GuessComparison | null>(null);
  const [gameStats, setGameStats] = useState<GuessStats>(EMPTY_STATS);
  const [overallStats, setOverallStats] = useState<GuessStats>(EMPTY_STATS);

  const gameKey = useMemo(() => (rawPgn ? pgnHash(rawPgn) : null), [rawPgn]);

  // Side to move at the current ply.
  const sideToMove: 'white' | 'black' = useMemo(() => {
    if (!game) return 'white';
    const fen = game.fens[ply];
    if (!fen) return 'white';
    return fen.split(' ')[1] === 'b' ? 'black' : 'white';
  }, [game, ply]);

  const expectedMove = useMemo(() => {
    if (!game || ply >= game.moves.length) return null;
    const m = game.moves[ply];
    return { san: m.san, uci: moveToUci(m) };
  }, [game, ply]);

  // Reset transient state when the game or ply changes externally.
  useEffect(() => {
    setComparison(null);
    if (mode === 'revealed') setMode('guessing');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, ply]);

  // Pull stats whenever the game/key changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [gs, os] = await Promise.all([
        gameKey ? getGameStats(gameKey) : Promise.resolve(EMPTY_STATS),
        getOverallStats(),
      ]);
      if (!cancelled) {
        setGameStats(gs);
        setOverallStats(os);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gameKey]);

  const refreshStats = useCallback(async () => {
    const [gs, os] = await Promise.all([
      gameKey ? getGameStats(gameKey) : Promise.resolve(EMPTY_STATS),
      getOverallStats(),
    ]);
    setGameStats(gs);
    setOverallStats(os);
  }, [gameKey]);

  const start = useCallback(() => {
    if (!game) return;
    setComparison(null);
    setMode('guessing');
  }, [game]);

  const stop = useCallback(() => {
    setComparison(null);
    setMode('off');
  }, []);

  const submit = useCallback(
    (uci: string): GuessComparison | null => {
      if (!game || !gameKey || mode !== 'guessing') return null;
      if (ply >= game.moves.length) return null;

      const fenBefore = game.fens[ply];
      let san: string;
      try {
        // Validate the move is legal at this position; chess.js gives us
        // SAN as a side effect, which we want for display + records.
        const chess = new Chess(fenBefore);
        const result = chess.move({
          from: uci.slice(0, 2),
          to: uci.slice(2, 4),
          promotion: uci.length > 4 ? uci.slice(4, 5) : undefined,
        });
        if (!result) return null;
        san = result.san;
      } catch {
        return null;
      }

      const playedMove = game.moves[ply];
      const playedUci = moveToUci(playedMove);
      const engineBestUci = evals[ply]?.bestUci;
      let engineBestSan: string | undefined;
      if (engineBestUci) {
        try {
          const c2 = new Chess(fenBefore);
          const m = c2.move({
            from: engineBestUci.slice(0, 2),
            to: engineBestUci.slice(2, 4),
            promotion: engineBestUci.length > 4 ? engineBestUci.slice(4, 5) : undefined,
          });
          if (m) engineBestSan = m.san;
        } catch {}
      }
      const matchesPlayed = uci === playedUci;
      const matchesEngine = !!engineBestUci && uci === engineBestUci;

      const cmp: GuessComparison = {
        guessUci: uci,
        guessSan: san,
        playedUci,
        playedSan: playedMove.san,
        engineBestUci,
        engineBestSan,
        matchesPlayed,
        matchesEngine,
      };
      setComparison(cmp);
      setMode('revealed');

      // Fire-and-forget the persistence. The UI doesn't block on it.
      void (async () => {
        await addGuess({
          gameKey,
          ply: ply + 1, // 1-based for human-readable record
          fenBefore,
          guessUci: uci,
          guessSan: san,
          playedUci,
          playedSan: playedMove.san,
          engineBestUci,
          engineBestSan,
          matchesPlayed,
          matchesEngine,
        });
        await refreshStats();
      })();

      return cmp;
    },
    [game, gameKey, mode, ply, evals, refreshStats],
  );

  const next = useCallback(() => {
    if (!game) return;
    const lastPly = game.moves.length;
    if (ply >= lastPly) return;
    setComparison(null);
    setMode('guessing');
    setPly(ply + 1);
  }, [game, ply, setPly]);

  const skip = useCallback(() => {
    next();
  }, [next]);

  return {
    mode,
    active: mode !== 'off',
    comparison,
    sideToMove,
    expectedMove,
    gameStats,
    overallStats,
    start,
    stop,
    submit,
    next,
    skip,
  };
}
