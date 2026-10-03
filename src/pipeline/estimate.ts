import type { Project } from '../project/schema.js';

export type CacheFlags = {
  images: Record<string, boolean>;
  videos: Record<string, boolean>;
  voice: boolean;
};

export type Estimate = {
  mediaProvider: string;
  voiceProvider: string | null;
  images: number;
  videos: number;
  voices: number;
  cached: number;
  paid: number;
};

export function emptyCache(project: Project): CacheFlags {
  return {
    images: Object.fromEntries(project.shots.map((shot) => [shot.id, false])),
    videos: Object.fromEntries(project.shots.map((shot) => [shot.id, false])),
    voice: false,
  };
}

export function estimateFromCache(
  project: Project,
  cache: CacheFlags,
  options: { mediaPaid: boolean; voicePaid: boolean; mediaProvider: string; voiceProvider: string | null },
): Estimate {
  let images = 0;
  let videos = 0;
  let cached = 0;
  for (const shot of project.shots) {
    const mode = shot.videoMode ?? 'image-to-video';
    if (shot.kind === 'video' && mode === 'text-to-video') {
      if (cache.videos[shot.id]) cached += 1;
      else videos += 1;
      continue;
    }
    if (shot.kind === 'video') {
      if (cache.images[shot.id]) cached += 1;
      else images += 1;
      if (cache.videos[shot.id]) cached += 1;
      else videos += 1;
      continue;
    }
    if (cache.images[shot.id]) cached += 1;
    else images += 1;
  }
  let voices = 0;
  if (project.voiceover) {
    if (cache.voice) cached += 1;
    else voices = 1;
  }
  const paid = (options.mediaPaid ? images + videos : 0) + (options.voicePaid ? voices : 0);
  return {
    mediaProvider: options.mediaProvider,
    voiceProvider: options.voiceProvider,
    images,
    videos,
    voices,
    cached,
    paid,
  };
}

export function formatEstimate(estimate: Estimate, title: string): string {
  const lines = [
    `${title}`,
    `Provider: ${estimate.mediaProvider}${estimate.mediaProvider === 'placeholder' ? ' (free stand-ins)' : ' (billed by fal.ai)'}`,
    estimate.voiceProvider
      ? `Voice: ${estimate.voiceProvider}${estimate.voiceProvider === 'placeholder' ? ' (free stand-in)' : ' (billed by ElevenLabs)'}`
      : 'Voice: none',
    `Images to generate: ${estimate.images}`,
    `Videos to generate: ${estimate.videos}`,
    `Voice to generate: ${estimate.voices}`,
    `Cached takes: ${estimate.cached}`,
    `Paid API calls: ${estimate.paid}`,
  ];
  if (estimate.paid > 0) {
    lines.push(
      'These calls bill your fal.ai or ElevenLabs account. Prices change — check the provider before continuing.',
    );
  }
  return lines.join('\n');
}
