import { useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { createEngine, type EngineHandle } from './engine';
import type { EvalSnapshot } from './types';

interface UseEngineArgs {
  /** FEN to analyze; pass null to leave the engine idle. */
  fen: string | null;
  /** Engine depth (10–30). */
  depth: number;
  /** Set to false to disable engine analysis entirely (e.g. when offline UI not needed). */
  enabled?: boolean;
  /** Multi-PV count; defaults to 3 per spec. */
  multiPv?: number;
}

export interface UseEngineReturn {
  /** Latest evaluation for the current FEN (incrementally populated). */
  snapshot: EvalSnapshot | null;
  /** True while the engine is searching this position. */
  analyzing: boolean;
  /** Set when the worker reports a fatal error. */
  error: string | null;
  /** True once the worker has signaled ready. */
  ready: boolean;
}

/**
 * React hook that owns a single engine worker for its caller's lifetime.
 * When `fen` or `depth` change, it cancels in-flight work and reanalyzes.
 */
export function useEngine({ fen, depth, enabled = true, multiPv = 3 }: UseEngineArgs): UseEngineReturn {
  const engineRef = useRef<EngineHandle | null>(null);
  const [snapshot, setSnapshot] = useState<EvalSnapshot | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Track the latest analyze request so out-of-order updates don't overwrite us.
  const requestIdRef = useRef(0);

  // Lazily create the engine when first enabled.
  useEffect(() => {
    if (!enabled) return;
    if (engineRef.current) return;
    let handle: EngineHandle;
    try {
      handle = createEngine();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }
    engineRef.current = handle;
    handle
      .ready()
      .then(() => setReady(true))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    return () => {
      handle.destroy();
      engineRef.current = null;
      setReady(false);
    };
  }, [enabled]);

  // Kick off / cancel analysis when fen or depth change.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (!enabled) return;
    if (!fen) {
      setSnapshot(null);
      setAnalyzing(false);
      return;
    }

    const myId = ++requestIdRef.current;
    const turn = extractTurn(fen);
    setSnapshot({ fen, turn, perspective: turn, lines: [], depth: 0, finished: false });
    setAnalyzing(true);
    setError(null);

    // Terminal positions (checkmate / stalemate) have no legal moves and
    // would cause the engine to either emit `bestmove (none)` or — with
    // some Stockfish.wasm builds — hang. Short-circuit instead.
    const terminal = describeTerminalPosition(fen);
    if (terminal) {
      setSnapshot({
        fen,
        turn,
        perspective: turn,
        lines: terminal.lines,
        depth: 0,
        finished: true,
      });
      setAnalyzing(false);
      return;
    }

    engine
      .analyze({
        fen,
        depth,
        multiPv,
        onUpdate: (s) => {
          if (requestIdRef.current !== myId) return;
          setSnapshot(s);
        },
        onFinish: (s) => {
          if (requestIdRef.current !== myId) return;
          setSnapshot(s);
          setAnalyzing(false);
        },
      })
      .catch((e) => {
        if (requestIdRef.current !== myId) return;
        setError(e instanceof Error ? e.message : String(e));
        setAnalyzing(false);
      });

    return () => {
      // On cleanup, cancel only if this request is still the latest.
      // Capture latest id from the ref (eslint warns if we use ref.current here, but
      // we *want* the live value so cancellation only fires when no newer request started).
      // eslint-disable-next-line react-hooks/exhaustive-deps
      if (requestIdRef.current === myId) {
        engine.stop();
      }
    };
  }, [fen, depth, enabled, multiPv]);

  return { snapshot, analyzing, error, ready };
}

function extractTurn(fen: string): 'w' | 'b' {
  const t = fen.split(' ')[1];
  return t === 'b' ? 'b' : 'w';
}

/**
 * If `fen` is a terminal position (checkmate or stalemate), return a synthetic
 * eval that the UI can render without bothering the engine. Otherwise null.
 */
function describeTerminalPosition(fen: string): { lines: EvalSnapshot['lines'] } | null {
  let game: Chess;
  try {
    game = new Chess(fen);
  } catch {
    return null;
  }
  // chess.js >=1.0: isCheckmate / isStalemate / isInsufficientMaterial / isDraw
  if (game.isCheckmate()) {
    return {
      lines: [
        {
          pvIndex: 1,
          depth: 0,
          mate: 0,
          uciMoves: [],
        },
      ],
    };
  }
  if (game.isStalemate() || game.isInsufficientMaterial() || game.isDraw()) {
    return {
      lines: [
        {
          pvIndex: 1,
          depth: 0,
          scoreCp: 0,
          uciMoves: [],
        },
      ],
    };
  }
  return null;
}
