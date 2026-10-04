import { describe, expect, it } from 'vitest';
import { analyzePcm, synthesizeClicks } from '../src/audio/beats.js';
import { decodeMonoFloat32 } from '../src/audio/decode.js';

describe('beat tracking', () => {
  it('finds the tempo and beat times of a click track', () => {
    const sampleRate = 22050;
    const samples = synthesizeClicks(120, 8, sampleRate);
    const analysis = analyzePcm(samples, sampleRate);
    expect(analysis.bpm).not.toBeNull();
    expect(analysis.bpm as number).toBeGreaterThan(110);
    expect(analysis.bpm as number).toBeLessThan(130);
    const expected = Array.from({ length: 16 }, (_, index) => index * 0.5);
    const hits = expected.filter((time) => analysis.beats.some((beat) => Math.abs(beat - time) <= 0.05));
    expect(hits.length).toBeGreaterThanOrEqual(12);
    expect(analysis.onsets.length).toBeGreaterThanOrEqual(12);
  });

  it('does not invent a tempo for silence', () => {
    const analysis = analyzePcm(new Float32Array(22050), 22050);
    expect(analysis.onsets).toEqual([]);
    expect(analysis.beats).toEqual([]);
    expect(analysis.bpm).toBeNull();
  });

  it('reads the checked-in meme beat near 120 bpm', async () => {
    const decoded = await decodeMonoFloat32('assets/meme-beat.wav');
    const analysis = analyzePcm(decoded.samples, decoded.sampleRate);
    expect(analysis.bpm).not.toBeNull();
    expect(analysis.bpm as number).toBeGreaterThan(100);
    expect(analysis.bpm as number).toBeLessThan(140);
    expect(analysis.beats.length).toBeGreaterThan(8);
  });
});
