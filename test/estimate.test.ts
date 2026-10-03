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
  });
});
