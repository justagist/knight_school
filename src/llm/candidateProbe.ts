import { Chess } from 'chess.js';
import { createEngine, type EngineHandle } from '../engine/engine';
import type { EvalSnapshot } from '../engine/types';
import type { EngineVariant } from '../settings/SettingsProvider';
import { getPositionEval, putPositionEval } from '../db/positionEvals';
import { terminalSnapshot } from '../analysis/terminal';
import type { Candidate } from './extractCandidates';

export interface ProbedCandidate extends Candidate {
  /** Eval AFTER the user's hypothetical move - i.e. from the side-to-
   *  move at the resulting position (= the opponent's POV). */
  scoreCp?: number;
  mate?: number;
  /** Engine depth that produced this row. */
  depth: number;
  /** Best continuation in UCI from the position-after-move, capped
   *  at six plies. Often opens with the opponent's reply. */
  topPvUci: string[];
  /** Cached: result came straight from positionEvals (no probe). */
  fromCache: boolean;
  /** FEN AFTER the candidate move was applied. */
  fenAfter: string;
}

/**
 * Lazy singleton engine handle dedicated to chat candidate probing.
 *
 * We keep it separate from the AnalyzeView / StudyViewer engine workers
 * so a chat-time probe can't cancel the user's main analysis. The
 * handle boots on first probe and stays alive for the lifetime of the
 * tab.
 *
 * Engine boot is ~1-2s; probes after that are bound by the depth +
 * position. Cancel + reuse: each new analyze() implicitly cancels the
 * previous one inside `engine.ts`, so we can queue candidates sequentially.
 */
let probeEngine: EngineHandle | null = null;
let probeEngineReady: Promise<void> | null = null;

async function getProbeEngine(): Promise<EngineHandle> {
  if (probeEngine && probeEngineReady) {
    await probeEngineReady;
    return probeEngine;
  }
  probeEngine = createEngine();
  probeEngineReady = probeEngine.ready();
  await probeEngineReady;
  return probeEngine;
}

interface ProbeOpts {
  depth: number;
  engineVariant: EngineVariant;
  /** Abort the probe early. Returned candidates so far are still valid. */
  signal?: AbortSignal;
}

/**
 * Probe each candidate move's resulting position. Walks sequentially -
 * one engine worker, one analyze() at a time. Hits in `positionEvals`
 * are reused as-is so repeat asks are instant.
 *
 * Returns one ProbedCandidate per input candidate, in the same order.
 * Candidates whose post-move FEN is terminal (mate / stalemate) are
 * still returned, with the terminal eval baked in.
 *
 * Errors during probe (worker init failure, network) cause the offending
 * candidate to be omitted; the rest still proceed.
 */
export async function probeCandidates(
  currentFen: string,
  candidates: Candidate[],
  opts: ProbeOpts,
): Promise<ProbedCandidate[]> {
  if (candidates.length === 0) return [];
  const out: ProbedCandidate[] = [];

  for (const c of candidates) {
    if (opts.signal?.aborted) break;

    const fenAfter = applyMove(currentFen, c);
    if (!fenAfter) continue;

    // Terminal positions get synthesised evals - no need to probe.
    const terminal = terminalSnapshot(fenAfter);
    if (terminal) {
      const top = terminal.lines[0];
      out.push({
        ...c,
        scoreCp: top?.scoreCp,
        mate: top?.mate,
        depth: terminal.depth,
        topPvUci: top?.uciMoves ?? [],
        fromCache: false,
        fenAfter,
      });
      continue;
    }

    const cached = await getPositionEval(fenAfter, {
      engine: opts.engineVariant,
      minDepth: opts.depth,
    });
    if (cached) {
      out.push({
        ...c,
        scoreCp: cached.scoreCp,
        mate: cached.mate,
        depth: cached.depth,
        topPvUci: cached.lines[0]?.uciMoves ?? [],
        fromCache: true,
        fenAfter,
      });
      continue;
    }

    try {
      const engine = await getProbeEngine();
      const snapshot = await analyseOnce(engine, fenAfter, opts.depth);
      const top = snapshot.lines[0];
      await putPositionEval(snapshot, opts.engineVariant);
      out.push({
        ...c,
        scoreCp: top?.scoreCp,
        mate: top?.mate,
        depth: snapshot.depth,
        topPvUci: top?.uciMoves ?? [],
        fromCache: false,
        fenAfter,
      });
    } catch {
      // Worker died / network refused / depth never reached - skip this
      // candidate but keep walking the list.
      continue;
    }
  }

  return out;
}

function applyMove(currentFen: string, c: Candidate): string | undefined {
  try {
    const chess = new Chess(currentFen);
    const m = chess.move({ from: c.from, to: c.to, promotion: c.promotion });
    if (!m) return undefined;
    return chess.fen();
  } catch {
    return undefined;
  }
}

function analyseOnce(engine: EngineHandle, fen: string, depth: number): Promise<EvalSnapshot> {
  // engine.analyze() resolves with the final snapshot on bestmove and
  // also on cancellation (with the partial snapshot at that moment).
  return engine.analyze({ fen, depth, multiPv: 3 });
}
