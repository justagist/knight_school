import { useMemo } from 'react';
import { Chess } from 'chess.js';
import type { EvalSnapshot, PvLine } from '../engine/types';
import { formatScore } from '../engine/format';
import { humanizeEngineError } from '../engine/humanizeError';
import type { EngineVariant } from '../settings/SettingsProvider';

interface EngineLinesProps {
  snapshot: EvalSnapshot | null;
  ready: boolean;
  error: string | null;
  variant: EngineVariant;
  /** Used to convert UCI moves to SAN for display. */
  fen: string;
}

export function EngineLines({ snapshot, ready, error, variant, fen }: EngineLinesProps) {
  const lines = snapshot?.lines ?? [];
  const turn = snapshot?.turn ?? 'w';

  return (
    <div className="card overflow-hidden">
      {error && (
        <div className="border-b border-blunder/30 bg-blunder/10 px-3 py-2 text-xs text-blunder">
          <div className="font-semibold">Engine error</div>
          <div className="mt-0.5">{humanizeEngineError(error)}</div>
        </div>
      )}

      {!error && lines.length === 0 && (
        <div className="flex items-center gap-2 px-3 py-4 text-xs text-ink-500 dark:text-ink-400">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" aria-hidden />
          {ready ? 'Analyzing…' : 'Starting engine…'}
        </div>
      )}

      <ol className="divide-y divide-ink-200 dark:divide-ink-800">
        {lines.map((line, idx) => (
          <PvRow
            key={line.pvIndex}
            line={line}
            startingFen={fen}
            sideToMove={turn}
            kind={idx === 0 ? 'best' : 'alt'}
          />
        ))}
      </ol>

      {/* Engine identity is now a muted footer per spec so the panel header
          isn't dominated by "Stockfish · Lite · d18". */}
      <div className="flex items-center justify-between border-t border-ink-200 bg-ink-50/60 px-3 py-1.5 text-[10px] uppercase tracking-wide text-ink-500 dark:border-ink-800 dark:bg-ink-900/60 dark:text-ink-400">
        <span>{variant === 'lite' ? 'Stockfish · Lite' : 'Stockfish · Full'}</span>
        <EngineStatusBadge ready={ready} error={error} variant={variant} snapshot={snapshot} />
      </div>
    </div>
  );
}

interface PvRowProps {
  line: PvLine;
  startingFen: string;
  sideToMove: 'w' | 'b';
  kind: 'best' | 'alt';
}

const MAX_SAN_PREVIEW = 8;

function PvRow({ line, startingFen, sideToMove, kind }: PvRowProps) {
  const san = useMemo(
    () => uciMovesToSan(line.uciMoves, startingFen, MAX_SAN_PREVIEW),
    [line.uciMoves, startingFen],
  );
  const score = formatScore(line, sideToMove, 'w');
  // Color the eval the same way the eval bar does so the user maps eval
  // sign to colour consistently across the screen.
  const numeric = parsePawnish(score);
  const evalColor =
    kind === 'alt'
      ? 'text-muted'
      : numeric == null
        ? 'text-primary'
        : numeric > 0.2
          ? 'text-best'
          : numeric < -0.2
            ? 'text-blunder'
            : 'text-primary';
  return (
    <li
      className={`grid grid-cols-[3.5rem_3.5rem_1fr] items-baseline gap-2 px-3 py-2 text-sm ${
        kind === 'alt' ? 'opacity-70' : ''
      }`}
    >
      <span className={`text-[10px] font-semibold uppercase tracking-wide ${kind === 'best' ? 'text-accent' : 'text-ink-500 dark:text-ink-400'}`}>
        {kind === 'best' ? 'Best' : 'Alt'}
      </span>
      <span className={`font-mono text-sm font-semibold tabular-nums ${evalColor}`}>{score}</span>
      <span className="truncate font-mono text-[12px] text-ink-700 dark:text-ink-300" title={san.full}>
        {san.preview}
        {san.truncated ? ' …' : ''}
      </span>
    </li>
  );
}

function parsePawnish(label: string): number | null {
  const trimmed = label.trim().replace(/^\+/, '');
  if (!trimmed || trimmed === '—') return null;
  if (trimmed.startsWith('M')) return 10;
  if (trimmed.startsWith('-M') || trimmed.startsWith('−M')) return -10;
  const normalized = trimmed.replace(/^[−–]/, '-');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

interface EngineStatusBadgeProps {
  ready: boolean;
  error: string | null;
  variant: EngineVariant;
  snapshot: EvalSnapshot | null;
}

function EngineStatusBadge({ ready, error, variant, snapshot }: EngineStatusBadgeProps) {
  const label = error
    ? 'error'
    : !ready
      ? 'loading'
      : snapshot?.finished
        ? `d${snapshot.depth} done`
        : snapshot && snapshot.depth > 0
          ? `d${snapshot.depth}…`
          : 'idle';
  return (
    <span className="text-[10px] uppercase tracking-wide text-ink-500 dark:text-ink-400">
      {variant === 'lite' ? 'Stockfish · Lite' : 'Stockfish · Full'} · {label}
    </span>
  );
}

/**
 * Convert a UCI move list to SAN, limited to maxMoves to keep the preview tight.
 * Returns both a short preview string and the full PV for tooltips.
 */
function uciMovesToSan(uciMoves: string[], startingFen: string, maxMoves: number): { preview: string; full: string; truncated: boolean } {
  const chess = new Chess(startingFen);
  const sans: string[] = [];
  for (const u of uciMoves) {
    try {
      const m = chess.move(parseUci(u));
      if (!m) break;
      sans.push(m.san);
    } catch {
      // Illegal in this position — engine PV may include moves only valid after earlier ones we missed.
      break;
    }
  }
  if (sans.length === 0) return { preview: '—', full: '—', truncated: false };

  const startMoveNum = Number.parseInt(startingFen.split(' ')[5] ?? '1', 10);
  const startSide = startingFen.split(' ')[1] === 'b' ? 'b' : 'w';
  const previewSan = sans.slice(0, maxMoves);

  return {
    preview: numberedSan(previewSan, startMoveNum, startSide),
    full: numberedSan(sans, startMoveNum, startSide),
    truncated: sans.length > maxMoves,
  };
}

function parseUci(u: string): { from: string; to: string; promotion?: string } {
  return {
    from: u.slice(0, 2),
    to: u.slice(2, 4),
    promotion: u.length >= 5 ? u.slice(4, 5) : undefined,
  };
}

function numberedSan(sans: string[], startMoveNum: number, startSide: 'w' | 'b'): string {
  const out: string[] = [];
  let moveNum = startMoveNum;
  let side = startSide;
  for (const san of sans) {
    if (side === 'w') {
      out.push(`${moveNum}.`);
      out.push(san);
      side = 'b';
    } else {
      if (out.length === 0) out.push(`${moveNum}…`);
      out.push(san);
      side = 'w';
      moveNum += 1;
    }
  }
  return out.join(' ');
}
