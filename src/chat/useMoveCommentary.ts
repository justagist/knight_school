import { useCallback, useEffect, useState } from 'react';
import { callChat, NoUsableKeyError } from '../llm/callChat';
import { LLMError } from '../llm/types';
import { ELLE_BASE_PROMPT } from '../llm/personaPrompt';
import { commentaryKey, getCommentary, putCommentary } from '../db/chat';
import { getLlmGlobal } from '../db/apiKeys';
import type { LlmProviderId, MoveCommentaryRow } from '../db/db';
import type { PositionEvalRow } from '../db/db';
import type { ChatCitation } from '../llm/types';

export interface MoveCommentaryArgs {
  /** FEN of the position BEFORE the move was played. */
  fenBefore: string;
  /** UCI of the move that was played (e.g. "e2e4"). */
  uciMove: string;
  /** Optional SAN for display in the prompt. */
  sanMove?: string;
  /** Cached engine evals for the before/after positions (for grounding). */
  evalBefore?: PositionEvalRow;
  evalAfter?: PositionEvalRow;
  /** Classification of the played move ("blunder", "best", ...) if available. */
  classification?: string;
  /** Game label (e.g. "Morphy vs Duke - 1858"). */
  gameLabel?: string;
  /** Move number for orientation in the prompt. */
  moveNumber?: number;
  /** 'w' or 'b' - who played this move. */
  color?: 'w' | 'b';
}

export interface UseMoveCommentaryReturn {
  /** Existing cached commentary, if any. */
  cached: MoveCommentaryRow | null;
  /** True while a request is in flight. */
  loading: boolean;
  /** Error message from the most recent request, or null. */
  error: string | null;
  /**
   * Run the commentary call. If a cache row already exists for this
   * (fen, move, provider, model) tuple, returns the cached row without
   * a network call.
   */
  request: (force?: boolean) => Promise<MoveCommentaryRow | null>;
}

/**
 * Hook that fetches and caches Elle's commentary on a single move. Scoped
 * to (fen, uciMove, provider, model) so switching models gives fresh
 * commentary; the engine eval stays cached separately and isn't redone.
 */
export function useMoveCommentary(args: MoveCommentaryArgs): UseMoveCommentaryReturn {
  const [cached, setCached] = useState<MoveCommentaryRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeProvider, setActiveProvider] = useState<LlmProviderId | null>(null);

  // Resolve which (provider, model) is currently active so we can look up
  // the cache row keyed by that pair.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const g = await getLlmGlobal();
      if (cancelled) return;
      setActiveProvider(g?.activeProvider ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Probe the cache for the current (fen, move, provider, model).
  useEffect(() => {
    let cancelled = false;
    setCached(null);
    setError(null);
    (async () => {
      if (!activeProvider) return;
      const { db } = await import('../db/db');
      const dd = db();
      const cfg = await dd.providerConfig.get(activeProvider);
      if (!cfg?.activeKeyId) return;
      const key = await dd.apiKeys.get(cfg.activeKeyId);
      if (!key) return;
      const k = commentaryKey(args.fenBefore, args.uciMove, key.provider, key.model);
      const row = await getCommentary(k);
      if (!cancelled) setCached(row ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [args.fenBefore, args.uciMove, activeProvider]);

  const request = useCallback(
    async (force = false): Promise<MoveCommentaryRow | null> => {
      setError(null);
      if (!force && cached) return cached;
      setLoading(true);
      try {
        const g = await getLlmGlobal();
        const provider = g?.activeProvider;
        if (!provider) {
          setError('No active provider. Pick one in Settings → Elle (LLM).');
          return null;
        }
        const userPrompt = buildUserPrompt(args);
        const result = await callChat({
          provider,
          system: ELLE_BASE_PROMPT,
          messages: [{ role: 'user', content: userPrompt }],
          enableWebSearch: false, // commentary is grounded in the engine eval, not the web
        });
        const row: MoveCommentaryRow = {
          key: commentaryKey(
            args.fenBefore,
            args.uciMove,
            result.keyUsed.provider,
            result.keyUsed.model,
          ),
          fen: args.fenBefore,
          uciMove: args.uciMove,
          provider: result.keyUsed.provider,
          model: result.keyUsed.model,
          text: result.text,
          usedWebSearch: result.usedWebSearch,
          citations:
            result.citations.length > 0 ? (result.citations as ChatCitation[]) : undefined,
          createdAt: Date.now(),
        };
        await putCommentary(row);
        setCached(row);
        return row;
      } catch (err) {
        const msg = formatError(err);
        setError(msg);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [args, cached],
  );

  return { cached, loading, error, request };
}

function formatError(err: unknown): string {
  if (err instanceof NoUsableKeyError) return err.message;
  if (err instanceof LLMError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

function buildUserPrompt(args: MoveCommentaryArgs): string {
  const lines: string[] = [];
  lines.push(
    `Explain the move that was played in this position. Keep it short - 2 to 4 sentences. Lead with the key idea.`,
  );
  if (args.gameLabel) lines.push(`Game: ${args.gameLabel}`);
  if (args.moveNumber && args.color) {
    const player = args.color === 'w' ? 'White' : 'Black';
    lines.push(`Move: ${args.moveNumber}${args.color === 'w' ? '.' : '...'} (${player} to move).`);
  }
  if (args.sanMove) lines.push(`Move played (SAN): ${args.sanMove}`);
  lines.push(`Move played (UCI): ${args.uciMove}`);
  lines.push(`Position before the move (FEN): ${args.fenBefore}`);
  if (args.classification && args.classification !== 'good') {
    lines.push(`Engine classification: ${args.classification}.`);
  }
  if (args.evalBefore) lines.push(`Engine eval before the move: ${formatEval(args.evalBefore)}`);
  if (args.evalAfter) lines.push(`Engine eval after the move: ${formatEval(args.evalAfter)}`);
  if (args.evalBefore?.lines?.length) {
    const tops = args.evalBefore.lines
      .slice(0, 3)
      .map(
        (l) =>
          `  ${l.pvIndex}. ${formatLineEval(l.scoreCp, l.mate)} ${l.uciMoves.slice(0, 6).join(' ')}`,
      )
      .join('\n');
    lines.push(`Engine top alternatives before the move:\n${tops}`);
  }
  return lines.join('\n');
}

function formatEval(row: PositionEvalRow): string {
  if (row.mate != null) return `mate in ${row.mate} (from side-to-move's POV)`;
  if (row.scoreCp != null) {
    const pawns = (row.scoreCp / 100).toFixed(2);
    return `${row.scoreCp >= 0 ? '+' : ''}${pawns} (from side-to-move's POV)`;
  }
  return '-';
}

function formatLineEval(scoreCp?: number, mate?: number): string {
  if (mate != null) return `M${mate}`;
  if (scoreCp != null) {
    const pawns = (scoreCp / 100).toFixed(2);
    return `${scoreCp >= 0 ? '+' : ''}${pawns}`;
  }
  return '-';
}
