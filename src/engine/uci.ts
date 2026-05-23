import type { PvLine } from './types';

/**
 * Parse a single UCI `info ... pv ...` line into a partial PvLine.
 * Returns null for `info` lines that don't carry a PV (e.g. lone `currmove` reports).
 *
 * Examples it handles:
 *   info depth 12 seldepth 18 multipv 1 score cp 34 nodes 12345 nps 200000 time 60 pv e2e4 e7e5 g1f3
 *   info depth 5 multipv 2 score mate 3 pv ...
 */
export function parseInfoLine(line: string): PvLine | null {
  if (!line.startsWith('info ')) return null;
  const tokens = line.slice(5).split(/\s+/);

  let depth: number | undefined;
  let multipv = 1;
  let scoreCp: number | undefined;
  let mate: number | undefined;
  let nps: number | undefined;
  let nodes: number | undefined;
  let timeMs: number | undefined;
  let pvStart = -1;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    switch (t) {
      case 'depth':
        depth = Number.parseInt(tokens[++i], 10);
        break;
      case 'multipv':
        multipv = Number.parseInt(tokens[++i], 10);
        break;
      case 'nps':
        nps = Number.parseInt(tokens[++i], 10);
        break;
      case 'nodes':
        nodes = Number.parseInt(tokens[++i], 10);
        break;
      case 'time':
        timeMs = Number.parseInt(tokens[++i], 10);
        break;
      case 'score': {
        const kind = tokens[++i];
        const value = Number.parseInt(tokens[++i], 10);
        if (kind === 'cp') scoreCp = value;
        else if (kind === 'mate') mate = value;
        // 'lowerbound' / 'upperbound' may follow; ignore (they don't carry the value)
        break;
      }
      case 'pv':
        pvStart = i + 1;
        i = tokens.length; // break outer loop
        break;
      default:
        // unknown / skipped tokens
        break;
    }
  }

  if (pvStart === -1 || depth == null) return null;
  if (scoreCp == null && mate == null) return null;

  const uciMoves = tokens.slice(pvStart).filter((s) => s.length > 0);
  if (uciMoves.length === 0) return null;

  return {
    pvIndex: multipv,
    depth,
    scoreCp,
    mate,
    uciMoves,
    nps,
    nodes,
    timeMs,
  };
}

/**
 * Parse a `bestmove ...` line into { best, ponder? }.
 * Returns null if not a bestmove line.
 */
export function parseBestMove(line: string): { best: string; ponder?: string } | null {
  if (!line.startsWith('bestmove ')) return null;
  const tokens = line.split(/\s+/);
  const best = tokens[1];
  if (!best) return null;
  const ponderIdx = tokens.indexOf('ponder');
  const ponder = ponderIdx > 0 ? tokens[ponderIdx + 1] : undefined;
  return { best, ponder };
}
