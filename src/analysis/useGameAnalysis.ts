import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createEngine, type EngineHandle } from '../engine/engine';
import type { EvalSnapshot } from '../engine/types';
import { db } from '../db/db';
import { getPositionEvals, putPositionEval } from '../db/positionEvals';
import { getExplorerEntries, normalizeFenForExplorer } from '../db/explorer';
import { fetchExplorerEntry } from '../explorer/client';
import { getLichessToken } from '../db/lichessAuth';
import { classifyFromCachedRows, type MoveClass } from './classify';
import { terminalEvalRow } from './terminal';
import type { ParsedGame } from '../lib/pgn';
import { moveToUci } from '../lib/moveToUci';
import type { PositionEvalRow, ExplorerEntryRow } from '../db/db';

/**
 * Plies past the start that we'll fetch Lichess Masters DB data for.
 * Masters DB coverage drops off sharply after the opening; past ~ply 30 the
 * vast majority of positions are unique to that game. Cap the network
 * traffic accordingly — anything past this is unlikely to be "book."
 */
const OPENING_FETCH_PLIES = 30;

/** Per-FEN Explorer lookup status — drives the "looking up…" vs "done"
 * vs "error" branches in the opening header. */
export type ExplorerStatus = 'loading' | 'loaded' | 'error';

export interface GameAnalysisResult {
  /** Eval per FEN index (parallel to game.fens). */
  evals: (PositionEvalRow | undefined)[];
  /** Classification per played move (parallel to game.moves). */
  classifications: (MoveClass | null)[];
  /** Lichess Explorer rows keyed by normalized FEN (only opening-phase). */
  explorerByFen: Record<string, ExplorerEntryRow | undefined>;
  /** Status of each Explorer fetch, keyed by normalized FEN. */
  explorerStatus: Record<string, ExplorerStatus | undefined>;
  /** Latest opening name detected in the trajectory, if any. */
  openingName?: string;
  /** ECO code for the deepest matched opening, if any. */
  ecoCode?: string;
}

export interface UseGameAnalysisReturn {
  result: GameAnalysisResult;
  /** Are we mid-run right now? */
  running: boolean;
  /** Completed positions (cached + freshly analyzed) out of total. */
  progress: { done: number; total: number };
  /** Kick off the full-game pass. Idempotent; no-op if already running. */
  start: () => void;
  /** Cancel the in-flight pass. Already-completed positions stay cached. */
  cancel: () => void;
  /** True if every position has an eval at the requested depth. */
  complete: boolean;
  error: string | null;
}

/**
 * Drive a sequential, cancelable, cache-first analysis pass over every
 * position in a loaded game.
 *
 * Design notes:
 * - Owns its own engine worker, dedicated to the batch. The interactive
 *   per-position useEngine() in AnalyzeView gets its own worker so the
 *   user's move-by-move review never queues behind the batch.
 * - Reads existing rows from Dexie up-front (bulkGet) and skips any FEN
 *   already cached at >= the requested depth. This makes re-runs
 *   essentially free (per spec: "re-analyzing is free").
 * - Awaits engine.analyze() one-FEN-at-a-time. The engine's own state
 *   machine guarantees clean transitions between positions.
 */
export function useGameAnalysis(
  game: ParsedGame | null,
  depth: number,
  engineVariant: 'lite' | 'full',
): UseGameAnalysisReturn {
  const [evals, setEvals] = useState<(PositionEvalRow | undefined)[]>([]);
  // Cached Lichess Masters DB rows aligned to game.fens by index. Drives
  // "Book" classification: when the BEFORE position has >=1000 master
  // games, the played move is labeled book. Limited to OPENING_FETCH_PLIES
  // plies — Masters DB has near-zero coverage past the opening anyway.
  const [explorerByFen, setExplorerByFen] = useState<
    Record<string, ExplorerEntryRow | undefined>
  >({});
  // Per-FEN fetch status. Lets the UI distinguish "still loading" from
  // "loaded but Lichess has nothing for this position" — both result in
  // an undefined row, but the user-facing message differs.
  const [explorerStatus, setExplorerStatus] = useState<
    Record<string, ExplorerStatus | undefined>
  >({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Engine handle lazily created on first start(). Destroyed on game change
  // or unmount so we don't leak workers when the user loads a new game.
  const engineRef = useRef<EngineHandle | null>(null);
  // Run-token guards against late writes after the user cancelled or
  // switched games while a run was in flight.
  const runIdRef = useRef(0);

  // Reset eval array whenever the game changes; rehydrate from cache.
  useEffect(() => {
    if (!game) {
      setEvals([]);
      setExplorerByFen({});
      setExplorerStatus({});
      setError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const cached = await getPositionEvals(game.fens);
        if (cancelled) return;
        const usable = cached.map((row) => {
          if (!row || row.engine !== engineVariant) return undefined;
          // Cached at sufficient depth for the same engine → use as-is.
          if (row.depth >= depth) return row;
          // Terminal rows live at depth:0 by design (no engine analysis
          // needed — the position has no legal moves). The depth filter
          // above would otherwise reject them and the runner would re-flag
          // the final move as "missing" on every reload. Accept those here.
          //
          // Critically: we only accept *cached* terminal rows. We don't
          // synthesize terminal evals from the FEN itself during rehydrate
          // — doing so would pre-populate progress on never-analyzed games
          // ("1/N done, Resume?") which is confusing. Fresh games get a
          // clean 0/N start; the runner's loop will synthesize the
          // terminal row on first pass.
          if (isCachedTerminalRow(row)) return row;
          return undefined;
        });
        setEvals(usable);
        // Rehydrate Explorer cache for the opening-phase positions. The
        // initial read is just Dexie (no network). When a Lichess token
        // is configured we also background-fetch missing entries; without
        // a token we rely on bundled ECO (data/eco.json) for opening names.
        const openingFens = game.fens.slice(0, OPENING_FETCH_PLIES);
        const cachedExplorer = await getExplorerEntries(openingFens);
        if (cancelled) return;
        const token = await getLichessToken();
        const indexed: Record<string, ExplorerEntryRow | undefined> = {};
        const initialStatus: Record<string, ExplorerStatus | undefined> = {};
        openingFens.forEach((fen, i) => {
          const key = normalizeFenForExplorer(fen);
          indexed[key] = cachedExplorer[i];
          if (cachedExplorer[i]) initialStatus[key] = 'loaded';
          // When no token: leave status undefined (NOT 'loading') so the UI
          // stops showing "looking up…" for things we won't fetch.
          else if (token) initialStatus[key] = 'loading';
        });
        setExplorerByFen(indexed);
        setExplorerStatus(initialStatus);

        if (!token) return; // ECO covers the offline baseline.

        const missingFens = openingFens.filter((_, i) => !cachedExplorer[i]);
        for (const fen of missingFens) {
          const key = normalizeFenForExplorer(fen);
          void fetchExplorerEntry(fen)
            .then((row) => {
              if (cancelled) return;
              if (row) {
                setExplorerByFen((prev) => ({ ...prev, [row.fen]: row }));
                setExplorerStatus((prev) => ({ ...prev, [key]: 'loaded' }));
              } else {
                setExplorerStatus((prev) => ({ ...prev, [key]: 'error' }));
              }
            })
            .catch(() => {
              if (!cancelled) {
                setExplorerStatus((prev) => ({ ...prev, [key]: 'error' }));
              }
            });
        }
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [game, depth, engineVariant]);

  // Destroy the engine when game changes or component unmounts.
  useEffect(() => {
    return () => {
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, [game]);

  const total = game?.fens.length ?? 0;

  const start = useCallback(() => {
    if (!game) return;
    if (running) return;
    if (engineVariant === 'full') {
      // TODO(full-mode): Once the NNUE-based worker is in place, drop this
      // guard. Today selecting 'full' is impossible from the UI anyway —
      // it's disabled in Settings — but guard defensively for safety.
      setError('Full engine mode is not available yet.');
      return;
    }

    const runId = ++runIdRef.current;
    setRunning(true);
    setError(null);

    // Lazily build the engine on first run.
    if (!engineRef.current) {
      try {
        engineRef.current = createEngine();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setRunning(false);
        return;
      }
    }
    const engine = engineRef.current;

    (async () => {
      try {
        await engine.ready();

        // Fire off Explorer fetches in parallel for the opening-phase FENs.
        // These don't block the engine loop — they trickle in to
        // explorerByFen as they resolve, and the classifier reads whatever
        // is current when it runs. Cached entries return immediately;
        // network ones piggyback on the SW runtime cache (30-day SWR).
        kickOffExplorerFetches(game.fens.slice(0, OPENING_FETCH_PLIES), runId);

        for (let i = 0; i < game.fens.length; i++) {
          if (runIdRef.current !== runId) return; // cancelled
          // Skip if we already have an eval at the requested depth.
          if (evals[i]) {
            continue;
          }
          const fen = game.fens[i];

          // Terminal position? Synthesize the row and persist it directly —
          // Stockfish would either hang or return nothing on these.
          const terminal = terminalEvalRow(fen, engineVariant);
          if (terminal) {
            await db().positionEvals.put(terminal);
            setEvals((prev) => writeAt(prev, i, terminal, game.fens.length));
            continue;
          }

          let snap: EvalSnapshot | null = null;
          try {
            snap = await engine.analyze({ fen, depth, multiPv: 3 });
          } catch (e) {
            // A single position failing shouldn't abort the whole pass.
            // eslint-disable-next-line no-console
            console.warn('[analysis] position failed:', fen, e);
            continue;
          }
          if (runIdRef.current !== runId) return;
          if (!snap || snap.lines.length === 0) continue;
          await putPositionEval(snap, engineVariant);

          // Write back to local state — one position at a time so the UI
          // can show incremental progress.
          const row: PositionEvalRow = {
            fen: snap.fen,
            turn: snap.turn,
            depth: snap.depth,
            bestUci: snap.lines[0]?.uciMoves[0],
            scoreCp: snap.lines[0]?.scoreCp,
            mate: snap.lines[0]?.mate,
            lines: snap.lines.map((l) => ({
              pvIndex: l.pvIndex,
              depth: l.depth,
              scoreCp: l.scoreCp,
              mate: l.mate,
              uciMoves: l.uciMoves,
            })),
            completedAt: Date.now(),
            engine: engineVariant,
          };
          setEvals((prev) => writeAt(prev, i, row, game.fens.length));
        }
      } catch (e) {
        if (runIdRef.current === runId) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (runIdRef.current === runId) setRunning(false);
      }
    })();
  }, [game, depth, engineVariant, evals, running]);

  const cancel = useCallback(() => {
    runIdRef.current += 1;
    setRunning(false);
    engineRef.current?.stop();
  }, []);

  // Helper: immutably write a row at index i, but only if the array length
  // matches the current game (guards against the game-change race).
  function writeAt(
    prev: (PositionEvalRow | undefined)[],
    i: number,
    row: PositionEvalRow,
    expectedLen: number,
  ): (PositionEvalRow | undefined)[] {
    if (prev.length !== expectedLen) return prev;
    const next = prev.slice();
    next[i] = row;
    return next;
  }

  // Recognize a cached row that was written by terminalEvalRow() — i.e. a
  // legal-move-less position (checkmate / stalemate / draw). These rows live
  // at depth 0 by design and need to pass the rehydrate depth filter.
  function isCachedTerminalRow(row: PositionEvalRow): boolean {
    return row.depth === 0 && row.lines.length > 0 && row.lines[0].uciMoves.length === 0;
  }

  /**
   * Fan-out Explorer fetches for the opening-phase FENs in parallel.
   * Each resolves to a cached row (Dexie) or a fresh fetch (network). As
   * each one lands, write it into the explorerByFen map so the classifier
   * picks up "book" status incrementally.
   *
   * Aborts (via runIdRef check) so stale lookups from a previous run can't
   * stomp state after the user switches games.
   */
  function kickOffExplorerFetches(fens: string[], runId: number) {
    for (const fen of fens) {
      const key = normalizeFenForExplorer(fen);
      // Only mark as 'loading' if we haven't already loaded it. Status
      // transitions: undefined → 'loading' → 'loaded' | 'error'.
      setExplorerStatus((prev) => (prev[key] ? prev : { ...prev, [key]: 'loading' }));
      void fetchExplorerEntry(fen)
        .then((row) => {
          if (runIdRef.current !== runId) return;
          if (row) {
            setExplorerByFen((prev) => ({ ...prev, [row.fen]: row }));
            setExplorerStatus((prev) => ({ ...prev, [key]: 'loaded' }));
          } else {
            setExplorerStatus((prev) => ({ ...prev, [key]: 'error' }));
          }
        })
        .catch(() => {
          if (runIdRef.current === runId) {
            setExplorerStatus((prev) => ({ ...prev, [key]: 'error' }));
          }
        });
    }
  }

  // Build per-played-move classifications from the eval array + Explorer cache.
  const classifications = useMemo<(MoveClass | null)[]>(() => {
    if (!game) return [];
    return game.moves.map((mv, idx) => {
      const before = evals[idx];
      const after = evals[idx + 1];
      if (!before || !after) return null;
      const playedUci = moveToUci(mv);
      const explorerBefore = explorerByFen[normalizeFenForExplorer(game.fens[idx])];
      return classifyFromCachedRows(before, after, playedUci, idx, explorerBefore);
    });
  }, [game, evals, explorerByFen]);

  // Derive progress from evals so it can't drift out of sync with the array
  // itself. The previous separate `done` state had a race where setEvals and
  // setDone could land in different React batches, leaving complete=false
  // even when every eval was actually present.
  const done = useMemo(() => evals.reduce((n, e) => n + (e ? 1 : 0), 0), [evals]);
  const complete = total > 0 && evals.length === total && done === total;

  // Pick the deepest detected opening name along the game's actual line.
  // Lichess hangs the opening tag on the *position* — as the line gets
  // more specific, the name gets more specific too (Caro-Kann → Caro-Kann
  // Defense: Exchange Variation), so we scan forward and keep the latest
  // non-empty name we see.
  const { openingName, ecoCode } = useMemo(() => {
    if (!game) return { openingName: undefined, ecoCode: undefined };
    let name: string | undefined;
    let eco: string | undefined;
    const upTo = Math.min(game.fens.length, OPENING_FETCH_PLIES + 1);
    for (let i = 0; i < upTo; i++) {
      const row = explorerByFen[normalizeFenForExplorer(game.fens[i])];
      if (row?.openingName) name = row.openingName;
      if (row?.ecoCode) eco = row.ecoCode;
    }
    return { openingName: name, ecoCode: eco };
  }, [game, explorerByFen]);

  return {
    result: { evals, classifications, explorerByFen, explorerStatus, openingName, ecoCode },
    running,
    progress: { done, total },
    start,
    cancel,
    complete,
    error,
  };
}
