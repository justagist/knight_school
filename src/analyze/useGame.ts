import { useCallback, useEffect, useMemo, useState } from 'react';
import { parsePgn, PgnParseError, type ParsedGame } from '../lib/pgn';
import { recordGameView } from '../db/gameHistory';

export interface UseGameReturn {
  game: ParsedGame | null;
  /** Raw PGN text the game was loaded from, exactly as the user pasted/uploaded. */
  rawPgn: string | null;
  /** 0 = starting position; game.moves.length = after final move */
  ply: number;
  setPly: (n: number) => void;
  goToStart: () => void;
  goToEnd: () => void;
  prev: () => void;
  next: () => void;
  /** Orientation: 'white' or 'black' */
  orientation: 'white' | 'black';
  flip: () => void;
  loadPgn: (pgn: string) => void;
  clear: () => void;
  error: string | null;
  currentFen: string | null;
  /** [from, to] of the move that just produced currentFen (for last-move highlight). undefined at ply 0. */
  lastMove?: [string, string];
}

const STORAGE_KEY = 'ks-last-pgn';

export function useGame(): UseGameReturn {
  const [game, setGame] = useState<ParsedGame | null>(null);
  const [rawPgn, setRawPgn] = useState<string | null>(null);
  const [ply, setPlyState] = useState(0);
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const [error, setError] = useState<string | null>(null);

  // Restore last PGN on first mount (best-effort).
  useEffect(() => {
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (!cached) return;
      const parsed = parsePgn(cached);
      setGame(parsed);
      setRawPgn(cached);
    } catch {
      // Stale or invalid - clear it so we don't keep failing.
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
    }
  }, []);

  const clampPly = useCallback(
    (n: number) => {
      if (!game) return 0;
      if (n < 0) return 0;
      if (n > game.moves.length) return game.moves.length;
      return n;
    },
    [game],
  );

  const setPly = useCallback((n: number) => setPlyState((_p) => clampPly(n)), [clampPly]);
  const goToStart = useCallback(() => setPlyState(0), []);
  const goToEnd = useCallback(() => setPlyState(game?.moves.length ?? 0), [game]);
  const prev = useCallback(() => setPlyState((p) => Math.max(0, p - 1)), []);
  const next = useCallback(
    () => setPlyState((p) => (game ? Math.min(game.moves.length, p + 1) : 0)),
    [game],
  );
  const flip = useCallback(
    () => setOrientation((o) => (o === 'white' ? 'black' : 'white')),
    [],
  );

  const loadPgn = useCallback((pgn: string) => {
    try {
      const parsed = parsePgn(pgn);
      setGame(parsed);
      setRawPgn(pgn);
      setPlyState(0);
      setError(null);
      try {
        localStorage.setItem(STORAGE_KEY, pgn);
      } catch {}
      // Fire-and-forget: record the open in the Analyze recent-games
      // list. Failure (e.g. quota / Dexie open error) is silent so the
      // history feature can never block a successful load.
      void recordGameView(pgn, parsed).catch(() => {});
    } catch (err) {
      if (err instanceof PgnParseError) setError(err.message);
      else setError(err instanceof Error ? err.message : 'Failed to parse PGN.');
    }
  }, []);

  const clear = useCallback(() => {
    setGame(null);
    setRawPgn(null);
    setPlyState(0);
    setError(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);

  const currentFen = useMemo(() => {
    if (!game) return null;
    return game.fens[ply] ?? game.startingFen;
  }, [game, ply]);

  const lastMove = useMemo<[string, string] | undefined>(() => {
    if (!game || ply === 0) return undefined;
    const m = game.moves[ply - 1];
    return m ? [m.from, m.to] : undefined;
  }, [game, ply]);

  return {
    game,
    rawPgn,
    ply,
    setPly,
    goToStart,
    goToEnd,
    prev,
    next,
    orientation,
    flip,
    loadPgn,
    clear,
    error,
    currentFen,
    lastMove,
  };
}
