import type { Shot } from '../project/schema.js';

export type FramePlan = { type: 'file' | 'generate' | 'previous' };

export type ShotMediaPlan = {
  /** Where the finished picture comes from. */
  source: 'generate' | 'image' | 'video' | 'interpolate';
  generateImage: boolean;
  generateVideo: boolean;
  /** Present when the shot names a start frame or continues from the previous shot. */
  start?: FramePlan;
  /** Present when the shot names an end frame. The video is the motion between start and end. */
  end?: FramePlan;
};

function startPlan(shot: Shot): FramePlan | undefined {
  if (shot.start_from === 'previous') return { type: 'previous' };
  if (typeof shot.start_image === 'string') return { type: 'file' };
  if (shot.start_image) return { type: 'generate' };
  if (shot.image) return { type: 'file' };
  return undefined;
}

function endPlan(shot: Shot): FramePlan | undefined {
  if (!shot.end_image) return undefined;
  return { type: typeof shot.end_image === 'string' ? 'file' : 'generate' };
}

/**
 * image: use that still instead of generating one. A video shot then animates it.
 * video: use that clip as-is, trimmed to the shot duration. No model call.
 * start_image / end_image: generate the motion between two frames.
 * start_from previous: the start frame is the previous shot's last frame.
 */
export function planShotMedia(shot: Shot): ShotMediaPlan {
  if (shot.video) return { source: 'video', generateImage: false, generateVideo: false };

  const start = startPlan(shot);
  const end = endPlan(shot);
  const bridging = Boolean(end || shot.start_from === 'previous');
  if (bridging && start) {
    return { source: 'interpolate', generateImage: false, generateVideo: true, start, end };
  }
  if (start?.type === 'generate') {
    return {
      source: 'generate',
      generateImage: true,
      generateVideo: shot.kind === 'video',
      start,
    };
  }
  if (start?.type === 'file' && shot.kind === 'video') {
    return { source: 'image', generateImage: false, generateVideo: true };
  }
  if (start?.type === 'file') return { source: 'image', generateImage: false, generateVideo: false };

  const mode = shot.videoMode ?? 'image-to-video';
  if (shot.kind === 'video' && mode === 'text-to-video') {
    return { source: 'generate', generateImage: false, generateVideo: true };
  }
  if (shot.kind === 'video') return { source: 'generate', generateImage: true, generateVideo: true };
  return { source: 'generate', generateImage: true, generateVideo: false };
}
