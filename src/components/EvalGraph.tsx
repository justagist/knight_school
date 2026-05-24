import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { PositionEvalRow } from '../db/db';

interface EvalGraphProps {
  /** Eval per FEN index (parallel to game.fens). length = ply count + 1. */
  evals: (PositionEvalRow | undefined)[];
  /** Currently focused ply (0..evals.length - 1). */
  ply: number;
  onSelectPly: (ply: number) => void;
}

/**
 * recharts puts the stroke / fill we pass directly onto SVG attributes,
 * which don't resolve CSS `var()`. Read the resolved values out of the
 * documentElement once on mount + on theme changes so the graph stays
 * in sync with the Slate & Amber tokens.
 */
function useThemeColors() {
  const [colors, setColors] = useState({ accent: '#d97706', muted: '#94a3b8' });
  useEffect(() => {
    const read = () => {
      const cs = getComputedStyle(document.documentElement);
      const accent = cs.getPropertyValue('--accent').trim() || '#d97706';
      const muted = cs.getPropertyValue('--text-muted').trim() || '#94a3b8';
      setColors({ accent, muted });
    };
    read();
    // ThemeProvider toggles the `dark` class on <html>, which swaps the
    // variable values - watch the class attribute to re-resolve.
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return colors;
}

/**
 * Vertical eval bar - visualises the full game's evaluation curve, white above
 * the midline, black below. Click any point to jump the board to that ply.
 *
 * X-axis is ply index (0 = starting position). Y-axis is white-perspective
 * centipawn-equivalent, clamped to ±10. Mate is plotted at the cap.
 */
export function EvalGraph({ evals, ply, onSelectPly }: EvalGraphProps) {
  const { accent, muted } = useThemeColors();
  const data = useMemo(() => {
    return evals.map((row, i) => ({
      ply: i,
      eval: toWhitePawns(row),
      depth: row?.depth ?? 0,
    }));
  }, [evals]);

  const hasAny = data.some((d) => d.eval !== null);
  if (!hasAny) {
    return (
      <div className="card grid place-items-center px-3 py-6 text-xs text-ink-500 dark:text-ink-400">
        Run analysis to see the eval graph.
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-ink-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-500 dark:border-ink-800 dark:text-ink-400">
        Eval graph
      </div>
      <div className="h-32 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 8, right: 8, left: 0, bottom: 4 }}
            onClick={(e) => {
              const p = e?.activeLabel;
              if (typeof p === 'number' && Number.isFinite(p)) onSelectPly(p);
              else if (typeof p === 'string') {
                const n = Number.parseInt(p, 10);
                if (Number.isFinite(n)) onSelectPly(n);
              }
            }}
          >
            <defs>
              <linearGradient id="evalUp" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={accent} stopOpacity={0.4} />
                <stop offset="100%" stopColor={accent} stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="ply"
              type="number"
              domain={[0, data.length - 1]}
              hide
            />
            <YAxis
              domain={[-10, 10]}
              hide
            />
            <ReferenceLine y={0} stroke={muted} strokeDasharray="2 2" />
            <ReferenceLine
              x={ply}
              stroke={accent}
              strokeWidth={1.5}
              isFront
            />
            <Tooltip
              cursor={{ stroke: accent, strokeOpacity: 0.4 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as { ply: number; eval: number | null; depth: number };
                return (
                  <div className="rounded-md border border-ink-200 bg-white px-2 py-1 text-[11px] shadow-sm dark:border-ink-700 dark:bg-ink-900">
                    <div>ply {p.ply}</div>
                    <div className="font-mono tabular-nums">
                      {p.eval == null ? '-' : `${p.eval > 0 ? '+' : ''}${p.eval.toFixed(2)}`}
                      {p.depth > 0 && <span className="ml-1 text-ink-500 dark:text-ink-400">d{p.depth}</span>}
                    </div>
                  </div>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="eval"
              stroke={accent}
              strokeWidth={1.5}
              fill="url(#evalUp)"
              connectNulls
              isAnimationActive={false}
              dot={false}
              activeDot={{ r: 3 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/**
 * Convert a cached row's eval to pawns from White's perspective, clamped to ±10
 * for charting. Mate scores are pushed to the cap. Returns null for un-analyzed.
 */
function toWhitePawns(row: PositionEvalRow | undefined): number | null {
  if (!row) return null;
  if (row.mate != null) {
    // UCI mate semantics:
    //   mate > 0  → side-to-move mates in N
    //   mate < 0  → side-to-move gets mated in N
    //   mate = 0  → side-to-move IS mated (already checkmate)
    const matedFromMover = row.mate <= 0;
    const winningSide = matedFromMover
      ? row.turn === 'w'
        ? 'b'
        : 'w'
      : row.turn;
    return winningSide === 'w' ? 10 : -10;
  }
  if (row.scoreCp == null) return null;
  const fromWhite = row.turn === 'w' ? row.scoreCp : -row.scoreCp;
  const pawns = fromWhite / 100;
  return Math.max(-10, Math.min(10, pawns));
}
