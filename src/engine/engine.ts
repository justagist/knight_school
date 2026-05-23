import { parseBestMove, parseInfoLine } from './uci';
import type { EvalSnapshot, PvLine } from './types';

export interface AnalyzeOptions {
  fen: string;
  depth: number;
  /** Multi-PV count (number of lines). Defaults to 3. */
  multiPv?: number;
  /** Called each time the snapshot updates (per `info` line). */
  onUpdate?: (snapshot: EvalSnapshot) => void;
  /** Called when the engine finishes (after `bestmove`). */
  onFinish?: (snapshot: EvalSnapshot) => void;
}

export interface EngineHandle {
  /** Stop any in-flight analysis and free the worker. */
  destroy(): void;
  /** Begin analyzing a position; cancels any prior in-flight analysis. */
  analyze(opts: AnalyzeOptions): Promise<EvalSnapshot>;
  /** Stop the current search (sends UCI `stop`). */
  stop(): void;
  /** Resolves once the worker has emitted `ready`. */
  ready(): Promise<void>;
}

interface WorkerMsg {
  type: 'ready' | 'uci' | 'error' | 'log';
  line?: string;
  message?: string;
  stage?: string;
  [k: string]: unknown;
}

const WORKER_URL = '/engine/ks-engine.js';

// TODO(full-mode): When the user picks 'full' in Settings, createEngine should
// instantiate '/engine/ks-engine-full.js' instead. The full worker will load
// lila-stockfish-web and consume NNUE blobs from src/engine/nnueStore.ts (the
// IDB-backed download cache). The protocol surface (init/uci/stop/quit) stays
// identical so this state machine doesn't change. See EngineVariant docstring
// in src/settings/SettingsProvider.tsx for the broader plan.

/**
 * Construct a singleton-style engine handle. Owns one Web Worker and
 * serializes analyze() calls — calling analyze again cancels the prior one.
 */
export function createEngine(): EngineHandle {
  let worker: Worker | null = new Worker(WORKER_URL, { type: 'classic' });
  let readyResolve: (() => void) | null = null;
  let readyReject: ((err: Error) => void) | null = null;
  let readyResolved = false;
  const readyPromise: Promise<void> = new Promise((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  // The state machine is the only thing keeping spammed analyze() calls
  // coherent. UCI engines guarantee one bestmove per `go`, but only if we
  // play by the rules: never have two `go`s in flight. So we keep at most
  // one search alive and hold the next request in `pendingAnalysis` until
  // the prior bestmove arrives. After each cancellation we also send
  // `isready` and wait for `readyok` as a synchronization barrier — this
  // is what Lichess does, and it removes any ambiguity about engine
  // readiness for older Stockfish builds (SF_classical in particular).
  //
  // State transitions:
  //   idle → searching     (startNext sends position+go)
  //   searching → stopping (UCI stop sent for a cancelled search)
  //   stopping → syncing   (bestmove arrives for stopped search; send isready)
  //   syncing → idle       (readyok arrives; startNext if anything queued)
  //   searching → idle     (bestmove arrives for a natural completion)
  let engineState: 'idle' | 'searching' | 'stopping' | 'syncing' = 'idle';
  let currentAnalysis: AnalysisCtx | null = null;
  let pendingAnalysis: AnalysisCtx | null = null;
  let lastFatalError: string | null = null;

  worker.onmessage = (e: MessageEvent<WorkerMsg>) => {
    const m = e.data;
    if (!m) return;
    if (m.type === 'log') {
      // eslint-disable-next-line no-console
      console.debug('[engine]', m.stage, m);
      return;
    }
    if (m.type === 'ready') {
      readyResolved = true;
      readyResolve?.();
      return;
    }
    if (m.type === 'error') {
      // eslint-disable-next-line no-console
      console.warn('[engine] worker error:', m.message);
      lastFatalError = m.message ?? 'engine error';
      if (!readyResolved) {
        readyResolved = true;
        readyReject?.(new Error(lastFatalError));
      }
      const err = new Error(lastFatalError);
      currentAnalysis?.fail(err);
      pendingAnalysis?.fail(err);
      return;
    }
    if (m.type === 'uci' && m.line) {
      handleUciLine(m.line);
    }
  };

  worker.onerror = (e: ErrorEvent) => {
    // eslint-disable-next-line no-console
    console.warn('[engine] worker.onerror:', e.message, '@', e.filename, e.lineno);
    const msg = e.message || 'worker error';
    lastFatalError = msg;
    if (!readyResolved) {
      readyResolved = true;
      readyReject?.(new Error(msg));
    }
    const err = new Error(msg);
    currentAnalysis?.fail(err);
    pendingAnalysis?.fail(err);
  };

  // Boot — the worker doesn't auto-init; we send 'init' so we get a 'ready' reply.
  worker.postMessage({ type: 'init' });

  // Watchdog: if ready hasn't fired in 20s, assume init is stuck and surface that.
  const watchdogId = setTimeout(() => {
    if (!readyResolved) {
      readyResolved = true;
      const msg = lastFatalError ?? 'engine did not initialize within 20s (no error reported)';
      readyReject?.(new Error(msg));
    }
  }, 20_000);

  function send(cmd: string) {
    worker?.postMessage({ type: 'uci', cmd });
  }

  function handleUciLine(line: string) {
    // readyok is our synchronization barrier; it only matters during 'syncing'.
    if (line === 'readyok') {
      if (engineState === 'syncing') {
        engineState = 'idle';
        startNext();
      }
      return;
    }

    const best = parseBestMove(line);
    if (best) {
      if (engineState === 'searching') {
        // Natural completion of the live search.
        currentAnalysis?.markFinished();
        currentAnalysis = null;
        engineState = 'idle';
        startNext();
      } else if (engineState === 'stopping') {
        // The cancelled search's bestmove. currentAnalysis was already
        // resolved via cancel(); drop the bestmove and sync before next go.
        currentAnalysis = null;
        engineState = 'syncing';
        send('isready');
      }
      // If 'idle' or 'syncing', a bestmove here is unexpected; ignore.
      return;
    }

    // info lines only count when we're actively searching; ignore any
    // stragglers from a cancelled search.
    if (engineState !== 'searching') return;
    const info = parseInfoLine(line);
    if (info) currentAnalysis?.applyInfo(info);
  }

  /** If there's a queued request and the engine is idle, dispatch it. */
  function startNext() {
    if (engineState !== 'idle') return;
    if (!worker) return;
    if (!pendingAnalysis) return;
    if (pendingAnalysis.isResolved()) {
      // Got cancelled while waiting; drop it.
      pendingAnalysis = null;
      return;
    }
    const ctx = pendingAnalysis;
    pendingAnalysis = null;
    currentAnalysis = ctx;
    engineState = 'searching';
    send(`position fen ${ctx.opts.fen}`);
    send(`go depth ${Math.max(1, Math.floor(ctx.opts.depth))}`);
  }

  function analyze(opts: AnalyzeOptions): Promise<EvalSnapshot> {
    if (!worker) throw new Error('Engine is destroyed.');

    // A newer analyze() supersedes any pending one entirely.
    if (pendingAnalysis && !pendingAnalysis.isResolved()) {
      pendingAnalysis.cancel();
    }

    const ctx = new AnalysisCtx(opts);
    pendingAnalysis = ctx;

    // Wait for engine boot before any state transition. After boot, schedule
    // the request via the state machine: if idle, start now; if searching,
    // send stop and wait for bestmove; if already stopping, just sit in
    // pendingAnalysis and let the next bestmove-handler trigger startNext.
    readyPromise
      .then(() => {
        if (engineState === 'idle') {
          startNext();
        } else if (engineState === 'searching' && currentAnalysis) {
          currentAnalysis.cancel();
          send('stop');
          engineState = 'stopping';
        }
        // 'stopping': nothing to do, bestmove will drive startNext().
      })
      .catch(() => {
        // readyPromise rejected (boot failed) — fail the pending request.
        pendingAnalysis?.fail(new Error(lastFatalError ?? 'engine failed to initialize'));
        pendingAnalysis = null;
      });

    return ctx.promise;
  }

  function stop() {
    if (pendingAnalysis && !pendingAnalysis.isResolved()) {
      pendingAnalysis.cancel();
      pendingAnalysis = null;
    }
    if (engineState === 'searching' && currentAnalysis && !currentAnalysis.isResolved()) {
      currentAnalysis.cancel();
      send('stop');
      engineState = 'stopping';
    }
  }

  function destroy() {
    if (!worker) return;
    clearTimeout(watchdogId);
    // If destroy fires before init, resolve the readyPromise so the .catch
    // attached by useEngine doesn't surface a misleading "did not initialize"
    // error from a now-orphaned engine instance.
    if (!readyResolved) {
      readyResolved = true;
      readyResolve?.();
    }
    try {
      worker.postMessage({ type: 'quit' });
    } catch {}
    try {
      worker.terminate();
    } catch {}
    worker = null;
    currentAnalysis?.cancel();
    currentAnalysis = null;
  }

  return {
    destroy,
    analyze,
    stop,
    ready: () => readyPromise,
  };
}

/**
 * Tracks an in-progress analyze() invocation: collects PV lines per pvIndex,
 * fires onUpdate, and resolves the promise on bestmove or cancellation.
 */
class AnalysisCtx {
  readonly fen: string;
  readonly turn: 'w' | 'b';
  readonly multiPv: number;
  readonly opts: AnalyzeOptions;
  private linesByPv = new Map<number, PvLine>();
  private depth = 0;
  private cancelled = false;
  private resolved = false;
  private resolve!: (s: EvalSnapshot) => void;
  private reject!: (err: Error) => void;
  readonly promise: Promise<EvalSnapshot>;

  constructor(opts: AnalyzeOptions) {
    this.fen = opts.fen;
    this.turn = (opts.fen.split(' ')[1] as 'w' | 'b') ?? 'w';
    this.multiPv = opts.multiPv ?? 3;
    this.opts = opts;
    this.promise = new Promise<EvalSnapshot>((res, rej) => {
      this.resolve = res;
      this.reject = rej;
    });
  }

  isResolved() {
    return this.resolved;
  }

  applyInfo(info: PvLine) {
    if (this.cancelled || this.resolved) return;
    // Only keep the latest line per pvIndex (latest depth wins).
    const existing = this.linesByPv.get(info.pvIndex);
    if (!existing || info.depth >= existing.depth) {
      this.linesByPv.set(info.pvIndex, info);
    }
    if (info.depth > this.depth) this.depth = info.depth;
    this.opts.onUpdate?.(this.snapshot(false));
  }

  markFinished() {
    if (this.cancelled || this.resolved) return;
    this.resolved = true;
    const snap = this.snapshot(true);
    this.opts.onFinish?.(snap);
    this.resolve(snap);
  }

  cancel() {
    if (this.resolved) return;
    this.cancelled = true;
    this.resolved = true;
    // Resolve (rather than reject) with current best snapshot so callers
    // don't need try/catch for cancellation; a stale FEN's snapshot is harmless.
    this.resolve(this.snapshot(false));
  }

  fail(err: Error) {
    if (this.resolved) return;
    this.resolved = true;
    this.reject(err);
  }

  private snapshot(finished: boolean): EvalSnapshot {
    const lines = Array.from(this.linesByPv.values()).sort((a, b) => a.pvIndex - b.pvIndex);
    return {
      fen: this.fen,
      turn: this.turn,
      perspective: this.turn,
      lines,
      depth: this.depth,
      finished,
    };
  }
}
