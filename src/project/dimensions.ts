import type { Aspect } from '../model/types.js';

export type FrameSize = { width: number; height: number };

const SIZES: Record<Aspect, FrameSize> = {
  '16:9': { width: 1280, height: 720 },
  '9:16': { width: 720, height: 1280 },
  '1:1': { width: 1080, height: 1080 },
};

export function frameSize(aspect: Aspect): FrameSize {
  return SIZES[aspect];
}
