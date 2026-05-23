import { useEffect, useRef } from 'react';
import type { ParsedGame } from '../lib/pgn';
import { play, type SoundKind } from './sounds';

interface UseGameSoundsArgs {
  game: ParsedGame | null;
  ply: number;
  soundsEnabled: boolean;
}

/**
 * Plays a sound effect when the user's ply position advances by exactly one
 * move — i.e. when they step forward through the game. Jumping multiple plies
 * at once (clicking a move deep in the list, pressing End, etc.) is silent
 * to avoid a barrage. Stepping backwards is silent.
 *
 * Choice of sound is derived from the move that produced the new position:
 *   - SAN contains '#' → 'end' (checkmate)
 *   - SAN contains '+' → 'check'
 *   - SAN contains 'x' → 'capture'
 *   - otherwise         → 'move'
 *
 * Spec note: sounds are off by default, master toggle in Settings. We never
 * play during initial mount or right after loading a new game.
 */
export function useGameSounds({ game, ply, soundsEnabled }: UseGameSoundsArgs) {
  const prevPlyRef = useRef<number>(ply);
  const prevGameRef = useRef<ParsedGame | null>(game);

  useEffect(() => {
    if (!soundsEnabled) {
      // Just track ply for next time without playing.
      prevPlyRef.current = ply;
      prevGameRef.current = game;
      return;
    }
    if (!game) {
      prevPlyRef.current = ply;
      prevGameRef.current = null;
      return;
    }
    // Suppress on game change (load) to avoid a sound on first render.
    if (game !== prevGameRef.current) {
      prevPlyRef.current = ply;
      prevGameRef.current = game;
      return;
    }
    const prev = prevPlyRef.current;
    prevPlyRef.current = ply;

    // Only play on single-step forward.
    if (ply !== prev + 1) return;

    const playedMove = game.moves[ply - 1];
    if (!playedMove) return;

    const kind = classifyMoveSound(playedMove.san);
    play(kind);
  }, [game, ply, soundsEnabled]);
}

function classifyMoveSound(san: string): SoundKind {
  if (san.includes('#')) return 'end';
  if (san.includes('+')) return 'check';
  if (san.includes('x')) return 'capture';
  return 'move';
}
