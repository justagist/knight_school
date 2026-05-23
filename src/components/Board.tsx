import { useEffect, useRef } from 'react';
import { Chessground } from '@lichess-org/chessground';
import type { Api as ChessgroundApi } from '@lichess-org/chessground/api';
import type { Config } from '@lichess-org/chessground/config';
import type { Key, Dests } from '@lichess-org/chessground/types';
import type { DrawShape } from '@lichess-org/chessground/draw';
import { Chess, type Square } from 'chess.js';
import { useSettings } from '../settings/SettingsProvider';

export interface BoardProps {
  fen: string;
  /** Orientation: 'white' (default) or 'black' */
  orientation?: 'white' | 'black';
  /** [from, to] squares to highlight as the last move */
  lastMove?: [string, string];
  /** Disable interactive moves — replay mode */
  viewOnly?: boolean;
  /** Decorative shapes overlaid on the board (e.g. move classification badges). */
  shapes?: DrawShape[];
  /**
   * When set (and !viewOnly), restrict piece dragging to the named color or
   * 'both'. Defaults to 'both' so callers that just flip viewOnly get the
   * sensible default of "any side can be moved." Used by Guess-the-move
   * mode to bind interactivity to the side to play.
   */
  movableColor?: 'white' | 'black' | 'both';
  /**
   * Fires when the user drops a piece on a legal target square. UCI of the
   * move (e.g. "e2e4", "e7e8q"). Caller is responsible for any next-state
   * updates — the board does NOT mutate the displayed FEN on its own.
   */
  onUserMove?: (uci: string) => void;
}

export function Board({
  fen,
  orientation = 'white',
  lastMove,
  viewOnly = true,
  shapes,
  movableColor = 'both',
  onUserMove,
}: BoardProps) {
  const { settings } = useSettings();
  const wrapRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<ChessgroundApi | null>(null);
  // Keep the latest onUserMove in a ref so the chessground config doesn't
  // need to be rebuilt every render — the handler closure stays stable.
  const onUserMoveRef = useRef<typeof onUserMove>(onUserMove);
  useEffect(() => {
    onUserMoveRef.current = onUserMove;
  }, [onUserMove]);

  // Mount + unmount
  useEffect(() => {
    if (!wrapRef.current) return;
    const config: Config = {
      fen,
      orientation,
      // chessground doesn't derive turnColor from the FEN's side-to-move
      // field — it defaults to 'white'. If we don't set this explicitly,
      // dragging Black pieces silently fails because chessground's
      // isMovable check requires turnColor === piece.color.
      turnColor: turnFromFen(fen),
      viewOnly,
      coordinates: settings.showCoordinates,
      // Two coordinate modes:
      //  - false (default): outside labels (lichess / classic chess board UI)
      //  - true: a label inside every square (chess.com style)
      // The Settings page exposes this. CSS overrides (src/styles/board.css)
      // fix chessground's pixel-based outside positioning so the labels
      // scale with the board instead of drifting on mobile.
      coordinatesOnSquares: settings.showCoordinates && settings.coordinatesOnSquares,
      highlight: {
        lastMove: settings.highlightLastMove,
        check: true,
      },
      movable: {
        free: false,
        color: cgColor(movableColor),
        dests: viewOnly ? new Map() : legalDests(fen),
        showDests: settings.showLegalMoves,
        events: {
          after: (orig, dest) => {
            const uci = `${orig}${dest}`;
            // Promotion edge case: chessground doesn't pop a piece-picker
            // out of the box, so a pawn reaching the back rank is auto-
            // promoted to queen here. UI-only for guess-mode; engine-level
            // promotion validation still happens in chess.js downstream.
            const promoted = isPromotion(fen, orig as string, dest as string)
              ? `${uci}q`
              : uci;
            onUserMoveRef.current?.(promoted);
          },
        },
      },
      drawable: { enabled: true, visible: true },
      animation: { enabled: true, duration: 180 },
      lastMove: toKeyPair(lastMove),
    };
    apiRef.current = Chessground(wrapRef.current, config);
    return () => {
      apiRef.current?.destroy();
      apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update position / orientation / lastMove + recompute legal dests for the
  // (possibly new) position. Dests only matter when the board is interactive.
  const lastMoveFrom = lastMove?.[0];
  const lastMoveTo = lastMove?.[1];
  useEffect(() => {
    apiRef.current?.set({
      fen,
      orientation,
      turnColor: turnFromFen(fen),
      lastMove: lastMoveFrom && lastMoveTo ? toKeyPair([lastMoveFrom, lastMoveTo]) : undefined,
      movable: {
        dests: viewOnly ? new Map() : legalDests(fen),
      },
    });
  }, [fen, orientation, lastMoveFrom, lastMoveTo, viewOnly]);

  // Push decorative shapes (e.g. classification badges) when they change.
  // setShapes() replaces the auto-shapes overlay without affecting user draws.
  useEffect(() => {
    apiRef.current?.setAutoShapes(shapes ?? []);
  }, [shapes]);

  // Update settings-driven config + interactivity without remounting.
  useEffect(() => {
    apiRef.current?.set({
      viewOnly,
      coordinates: settings.showCoordinates,
      highlight: { lastMove: settings.highlightLastMove, check: true },
      movable: {
        showDests: settings.showLegalMoves,
        color: cgColor(movableColor),
        dests: viewOnly ? new Map() : legalDests(fen),
      },
    });
  }, [
    viewOnly,
    movableColor,
    fen,
    settings.showCoordinates,
    settings.highlightLastMove,
    settings.showLegalMoves,
  ]);

  const themeClass = `ks-board-theme-${settings.boardTheme}`;
  const coordsClass = settings.showCoordinates ? '' : 'ks-board-no-coords';

  return (
    <div className={`ks-board-wrap ${themeClass} ${coordsClass}`.trim()}>
      <div ref={wrapRef} className="cg-wrap" />
    </div>
  );
}

function toKeyPair(pair?: [string, string]): [Key, Key] | undefined {
  if (!pair) return undefined;
  return [pair[0] as Key, pair[1] as Key];
}

function cgColor(c: 'white' | 'black' | 'both' | undefined): 'white' | 'black' | 'both' | undefined {
  // chessground accepts 'white' | 'black' | 'both'. Just pass through.
  return c;
}

/**
 * Compute the legal-moves map chessground wants for {@link Config.movable.dests}:
 * Map<from-square, to-square[]> derived from chess.js for the side to move
 * at `fen`. Returns an empty map if the FEN is bad — we'd rather show no
 * legal moves than crash mid-render.
 */
/** Side to move encoded in the FEN's 2nd field. Defaults to white on bad input. */
function turnFromFen(fen: string): 'white' | 'black' {
  const field = fen.split(' ')[1];
  return field === 'b' ? 'black' : 'white';
}

function legalDests(fen: string): Dests {
  const dests: Dests = new Map();
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return dests;
  }
  const moves = chess.moves({ verbose: true });
  for (const m of moves) {
    const from = m.from as Key;
    const to = m.to as Key;
    const list = dests.get(from);
    if (list) list.push(to);
    else dests.set(from, [to]);
  }
  return dests;
}

/**
 * Detect whether a pawn move reaches the back rank (i.e. a promotion would
 * be required). Used to auto-promote to queen in guess-mode without a
 * piece-picker UI. Returns false for non-pawn moves.
 */
function isPromotion(fen: string, from: string, to: string): boolean {
  try {
    const chess = new Chess(fen);
    const piece = chess.get(from as Square);
    if (!piece || piece.type !== 'p') return false;
    const toRank = to[1];
    return (piece.color === 'w' && toRank === '8') || (piece.color === 'b' && toRank === '1');
  } catch {
    return false;
  }
}
