/**
 * Lightweight chess sound effects synthesized via the Web Audio API.
 *
 * TODO(lichess-sounds): The spec calls for "Lichess's open-source sound files
 * (standard set)" - the canonical assets are at
 * https://github.com/lichess-org/lila/tree/master/public/sound (CC0/GPL3,
 * usable). To swap: drop the mp3/ogg files into public/sounds/, replace the
 * synth() calls below with `new Audio('/sounds/move.mp3').play()` (or use a
 * single AudioContext + cached AudioBuffers for lower latency), and the
 * hook in useGameSounds.ts keeps working unchanged.
 *
 * Synthesized for now so the feature works offline, ships zero binary assets,
 * and the user can hear the difference between move kinds. Quality is "good
 * enough placeholder," not "Lichess polish."
 */

export type SoundKind = 'move' | 'capture' | 'check' | 'end';

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor =
    typeof window !== 'undefined'
      ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
      : undefined;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

interface ToneSpec {
  /** Hz */
  frequency: number;
  /** Seconds of audible release */
  duration: number;
  /** Peak gain (0–1). Keep low for non-startling sounds. */
  gain: number;
  /** 'sine' for soft, 'triangle' for slightly brighter. */
  type?: OscillatorType;
}

function tone(spec: ToneSpec, startOffset = 0) {
  const ac = getCtx();
  if (!ac) return;
  if (ac.state === 'suspended') ac.resume().catch(() => {});

  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = spec.type ?? 'sine';
  osc.frequency.value = spec.frequency;

  const start = ac.currentTime + startOffset;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(spec.gain, start + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + spec.duration);

  osc.connect(gain).connect(ac.destination);
  osc.start(start);
  osc.stop(start + spec.duration + 0.02);
}

export function play(kind: SoundKind) {
  switch (kind) {
    case 'move':
      tone({ frequency: 660, duration: 0.08, gain: 0.07, type: 'sine' });
      break;
    case 'capture':
      // Two-tone descending click - a touch more emphatic than a quiet move.
      tone({ frequency: 740, duration: 0.05, gain: 0.09, type: 'triangle' });
      tone({ frequency: 440, duration: 0.10, gain: 0.08, type: 'triangle' }, 0.04);
      break;
    case 'check':
      // Higher, slightly longer - alert without being shrill.
      tone({ frequency: 880, duration: 0.12, gain: 0.09, type: 'triangle' });
      tone({ frequency: 1100, duration: 0.08, gain: 0.07, type: 'sine' }, 0.06);
      break;
    case 'end':
      // Brief descending pair to signal terminal state.
      tone({ frequency: 520, duration: 0.18, gain: 0.08, type: 'sine' });
      tone({ frequency: 392, duration: 0.22, gain: 0.07, type: 'sine' }, 0.14);
      break;
  }
}
