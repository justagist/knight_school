import { useCallback, useEffect, useState } from 'react';
import { Chess } from 'chess.js';

export interface ExplorationMove {
  san: string;
  uci: string;
  fenAfter: string;
}

export interface ExplorationState {
  /** The FEN we branched off from. */
  baseFen: string;
  /** Ply index where the user diverged from the game's main line. Lets
   * downstream code (chat context, UI labels) say "branched after move N". */
  branchPly: number;
  /** Moves played in this exploration line, in order. */
  moves: ExplorationMove[];
  /** Current FEN - baseFen if no moves yet, else last move's fenAfter. */
  currentFen: string;
}

export interface UseExplorationReturn {
  /** Active when the user has played at least one exploration move. */
  state: ExplorationState | null;
  /** True if the user is currently exploring (state !== null). */
  active: boolean;
  /** Apply a UCI move to the current exploration position. Returns false if illegal. */
  play: (uci: string) => boolean;
  /** Undo the most recent exploration move. */
  takeBack: () => void;
  /** Clear the exploration entirely and return to the base position. */
  exit: () => void;
  /** [from, to] of the most recent exploration move, for board highlighting. */
  lastMove: [string, string] | undefined;
}

interface UseExplorationArgs {
  /**
   * The "anchor" FEN the user is reviewing (game.fens[ply]). When this
   * changes via game navigation, the exploration is auto-exited so the
   * board snaps back to the game's line.
   */
  anchorFen: string | null;
  /** Current game ply at the anchor - captured when exploration begins. */
  anchorPly: number;
}

/**
 * Lightweight branch-off state for the Analyze view. The user is normally
 * looking at game.fens[ply]; when they drag a piece, we let them "try" a
 * move without disturbing the game-navigation cursor. Subsequent drags
 * continue the line; takeBack pops the last move; exit returns to the
 * anchor.
 *
 * Engine analysis (useEngine) consumes whatever FEN is currently shown,
 * so wiring is: callers ask the hook for `currentFen` and pass it down.
 */
export function useExploration({ anchorFen, anchorPly }: UseExplorationArgs): UseExplorationReturn {
  const [state, setState] = useState<ExplorationState | null>(null);

  // Whenever the user navigates to a different ply (or loads a new game),
  // the anchor FEN changes - drop the exploration so they're not stuck
  // looking at a stale branched position.
  useEffect(() => {
    setState(null);
  }, [anchorFen]);

  const play = useCallback(
    (uci: string): boolean => {
      const from = anchorFen ?? state?.baseFen;
      if (!from) return false;
      const startingFromAnchor = state === null;
      const currentFen = state?.currentFen ?? from;
      try {
        const chess = new Chess(currentFen);
        const result = chess.move({
          from: uci.slice(0, 2),
          to: uci.slice(2, 4),
          promotion: uci.length > 4 ? uci.slice(4, 5) : undefined,
        });
        if (!result) return false;
        const move: ExplorationMove = {
          san: result.san,
          uci,
          fenAfter: chess.fen(),
        };
        if (startingFromAnchor) {
          setState({
            baseFen: from,
            branchPly: anchorPly,
            moves: [move],
            currentFen: move.fenAfter,
          });
        } else {
          setState({
            baseFen: state!.baseFen,
            branchPly: state!.branchPly,
            moves: [...state!.moves, move],
            currentFen: move.fenAfter,
          });
        }
        return true;
      } catch {
        return false;
      }
    },
    [anchorFen, anchorPly, state],
  );

  const takeBack = useCallback(() => {
    if (!state) return;
    if (state.moves.length <= 1) {
      setState(null);
      return;
    }
    const next = state.moves.slice(0, -1);
    setState({
      ...state,
      moves: next,
      currentFen: next[next.length - 1].fenAfter,
    });
  }, [state]);

  const exit = useCallback(() => setState(null), []);

  const lastMove: [string, string] | undefined = state?.moves.length
    ? (() => {
        const m = state.moves[state.moves.length - 1].uci;
        return [m.slice(0, 2), m.slice(2, 4)];
      })()
    : undefined;

  return {
    state,
    active: state !== null,
    play,
    takeBack,
    exit,
    lastMove,
  };
}
