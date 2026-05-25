import type { ScreenContext } from './personaPrompt';
import type { EngineVariant } from '../settings/SettingsProvider';
import { extractCandidates } from './extractCandidates';
import { probeCandidates, type ProbedCandidate } from './candidateProbe';

interface PreprocessOpts {
  depth: number;
  engineVariant: EngineVariant;
  /** Soft ceiling on total candidates probed per message - prevents a
   *  user message that mentions five moves from spinning the engine
   *  five times before the chat send fires. */
  maxCandidates?: number;
}

/**
 * Extract user-asked candidate moves from the chat message, probe each
 * with Stockfish at the user's analysis depth, and render the result
 * as a system-prompt addendum block.
 *
 * Returns `undefined` when there's nothing to add - no FEN in scope,
 * no candidates parsed, or every probe failed. The caller appends the
 * block to `buildSystemPrompt(screen)` only when defined.
 *
 * Caching makes the second mention of the same move instant: probe
 * results are persisted to `positionEvals` keyed by the position-after-
 * move FEN.
 */
export async function preprocessChat(
  screen: ScreenContext,
  message: string,
  opts: PreprocessOpts,
): Promise<string | undefined> {
  const currentFen = currentFenFromScreen(screen);
  if (!currentFen) return undefined;
  const candidates = extractCandidates(message, currentFen);
  if (candidates.length === 0) return undefined;

  const max = opts.maxCandidates ?? 3;
  const capped = candidates.slice(0, max);
  const probed = await probeCandidates(currentFen, capped, {
    depth: opts.depth,
    engineVariant: opts.engineVariant,
  });
  if (probed.length === 0) return undefined;
  return renderBlock(probed);
}

function currentFenFromScreen(screen: ScreenContext): string | undefined {
  if (screen.kind === 'game') return screen.currentFen;
  if (screen.kind === 'lesson') return screen.lesson?.currentFen;
  if (screen.kind === 'drill') return screen.drill?.currentFen;
  return undefined;
}

function renderBlock(probed: ProbedCandidate[]): string {
  const lines: string[] = [
    '--- User-asked candidate moves ---',
    'The user\'s message references one or more specific candidate moves. Stockfish has been pre-probed on each candidate\'s resulting position; the evaluation is from the side-to-move at the resulting position (i.e. the opponent\'s perspective AFTER the user plays the candidate). When discussing whether a candidate is "better", invert the sign mentally if needed so the comparison reads in the user\'s favour.',
  ];
  for (const c of probed) {
    const score =
      c.mate != null
        ? `M${c.mate}`
        : c.scoreCp != null
          ? `${(c.scoreCp / 100).toFixed(2)}`
          : '-';
    const pv = c.topPvUci.slice(0, 6).join(' ');
    const tag = c.fromCache ? ' (cached)' : '';
    lines.push(
      `  ${c.san} (${c.uci}): eval ${score} at depth ${c.depth}${tag}  best reply / continuation: ${pv || '-'}`,
    );
  }
  return lines.join('\n');
}
