import { useEffect, useRef } from 'react';
import { Chessground } from '@lichess-org/chessground';
import type { Api as ChessgroundApi } from '@lichess-org/chessground/api';
import type { Config } from '@lichess-org/chessground/config';
import type { Key } from '@lichess-org/chessground/types';
import type { DrawShape } from '@lichess-org/chessground/draw';
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
}

export function Board({ fen, orientation = 'white', lastMove, viewOnly = true, shapes }: BoardProps) {
  const { settings } = useSettings();
  const wrapRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<ChessgroundApi | null>(null);

  // Mount + unmount
  useEffect(() => {
    if (!wrapRef.current) return;
    const config: Config = {
      fen,
      orientation,
      viewOnly,
      coordinates: settings.showCoordinates,
      highlight: {
        lastMove: settings.highlightLastMove,
        check: true,
      },
      movable: {
        free: false,
        color: undefined,
        showDests: settings.showLegalMoves,
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

  // Update position / orientation / lastMove without remounting
  const lastMoveFrom = lastMove?.[0];
  const lastMoveTo = lastMove?.[1];
  useEffect(() => {
    apiRef.current?.set({
      fen,
      orientation,
      lastMove: lastMoveFrom && lastMoveTo ? toKeyPair([lastMoveFrom, lastMoveTo]) : undefined,
    });
  }, [fen, orientation, lastMoveFrom, lastMoveTo]);

  // Push decorative shapes (e.g. classification badges) when they change.
  // setShapes() replaces the auto-shapes overlay without affecting user draws.
  useEffect(() => {
    apiRef.current?.setAutoShapes(shapes ?? []);
  }, [shapes]);

  // Update settings-driven config without remounting
  useEffect(() => {
    apiRef.current?.set({
      viewOnly,
      coordinates: settings.showCoordinates,
      highlight: { lastMove: settings.highlightLastMove, check: true },
      movable: { showDests: settings.showLegalMoves },
    });
  }, [viewOnly, settings.showCoordinates, settings.highlightLastMove, settings.showLegalMoves]);

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
