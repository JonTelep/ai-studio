import type { Camera } from '../model/types.js';
import type { CaptionCue } from '../audio/words.js';
import { clamp } from '../util/time.js';

export type Transform = { scale: number; x: number; y: number };

export function cameraTransform(camera: Camera, progress: number): Transform {
  const p = clamp(progress, 0, 1);
  switch (camera) {
    case 'ken-burns-in':
      return { scale: 1 + 0.12 * p, x: 0, y: 0 };
    case 'ken-burns-out':
      return { scale: 1.12 - 0.12 * p, x: 0, y: 0 };
    case 'pan-left':
      return { scale: 1.12, x: 5 - 10 * p, y: 0 };
    case 'pan-right':
      return { scale: 1.12, x: -5 + 10 * p, y: 0 };
    case 'slow-push':
      return { scale: 1 + 0.06 * p, x: 0, y: -1 * p };
    default:
      return { scale: 1, x: 0, y: 0 };
  }
}

export function shotAt<T extends { start: number; end: number }>(shots: T[], time: number): T {
  if (shots.length === 0) throw new Error('The timeline has no shots.');
  return shots.find((shot) => time >= shot.start && time < shot.end) ?? shots[shots.length - 1];
}

export function cueAt(cues: CaptionCue[], time: number): CaptionCue | null {
  return cues.find((cue) => time >= cue.start && time < cue.end) ?? null;
}
