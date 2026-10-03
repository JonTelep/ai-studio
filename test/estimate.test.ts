import { describe, expect, it } from 'vitest';
import { emptyCache, estimateFromCache } from '../src/pipeline/estimate.js';
import { loadProject } from '../src/project/load.js';

describe('estimate', () => {
  it('counts image-to-video as one still plus one video, and ignores cache hits', () => {
    const project = loadProject('projects/ocean.yaml');
    const fresh = estimateFromCache(project, emptyCache(project), {
      mediaPaid: true,
      voicePaid: false,
      mediaProvider: 'fal',
      voiceProvider: null,
    });
    expect(fresh.images).toBe(3);
    expect(fresh.videos).toBe(1);
    expect(fresh.paid).toBe(4);

    const cache = emptyCache(project);
    cache.images.swell = true;
    const partial = estimateFromCache(project, cache, {
      mediaPaid: true,
      voicePaid: false,
      mediaProvider: 'fal',
      voiceProvider: null,
    });
    expect(partial.images).toBe(2);
    expect(partial.videos).toBe(1);
    expect(partial.cached).toBe(1);
    expect(partial.paid).toBe(3);
  });

  it('charges nothing for the placeholder provider', () => {
    const project = loadProject('projects/meme-example.yaml');
    const estimate = estimateFromCache(project, emptyCache(project), {
      mediaPaid: false,
      voicePaid: false,
      mediaProvider: 'placeholder',
      voiceProvider: 'placeholder',
    });
    expect(estimate.images).toBe(3);
    expect(estimate.voices).toBe(1);
    expect(estimate.paid).toBe(0);
    expect(estimate.supplied).toBe(0);
  });

  it('does not bill a supplied still or clip, and bills only the video when a still is animated', () => {
    const project = loadProject('projects/own-media.yaml');
    const estimate = estimateFromCache(project, emptyCache(project), {
      mediaPaid: true,
      voicePaid: false,
      mediaProvider: 'fal',
      voiceProvider: null,
    });
    expect(estimate.images).toBe(0);
    expect(estimate.videos).toBe(1);
    expect(estimate.supplied).toBe(3);
    expect(estimate.paid).toBe(1);
  });

  it('bills the transition and generated frames, and skips the previous frame', () => {
    const project = loadProject('projects/bridge.yaml');
    const estimate = estimateFromCache(project, emptyCache(project), {
      mediaPaid: true,
      voicePaid: false,
      mediaProvider: 'fal',
      voiceProvider: null,
    });
    expect(estimate.images).toBe(0);
    expect(estimate.videos).toBe(1);
    expect(estimate.supplied).toBe(3);
    expect(estimate.paid).toBe(1);
  });
});
