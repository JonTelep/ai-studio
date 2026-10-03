import type { Shot } from '../project/schema.js';

export type ShotMediaPlan = {
  /** Where the finished picture comes from. */
  source: 'generate' | 'image' | 'video';
  generateImage: boolean;
  generateVideo: boolean;
};

/**
 * image: use that still instead of generating one. A video shot then animates it.
 * video: use that clip as-is, trimmed to the shot duration. No model call.
 */
export function planShotMedia(shot: Shot): ShotMediaPlan {
  if (shot.video) return { source: 'video', generateImage: false, generateVideo: false };
  if (shot.image && shot.kind === 'video') return { source: 'image', generateImage: false, generateVideo: true };
  if (shot.image) return { source: 'image', generateImage: false, generateVideo: false };
  const mode = shot.videoMode ?? 'image-to-video';
  if (shot.kind === 'video' && mode === 'text-to-video') {
    return { source: 'generate', generateImage: false, generateVideo: true };
  }
  if (shot.kind === 'video') return { source: 'generate', generateImage: true, generateVideo: true };
  return { source: 'generate', generateImage: true, generateVideo: false };
}
