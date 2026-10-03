import { afterEach, describe, expect, it } from 'vitest';
import { falMedia } from '../src/providers/fal.js';
import { assignEndImage, assignReferenceImages, extractMediaUrl, videoEndImageField, videoImageField } from '../src/providers/media-url.js';
import { resolveMediaProvider, resolveVoiceProvider } from '../src/providers/registry.js';
import { elevenLabsVoice } from '../src/providers/elevenlabs.js';
import { loadProject } from '../src/project/load.js';

const originalFal = process.env.FAL_KEY;
const originalVoice = process.env.ELEVENLABS_API_KEY;
const originalForbid = process.env.STUDIO_FORBID_PAID;

afterEach(() => {
  restore('FAL_KEY', originalFal);
  restore('ELEVENLABS_API_KEY', originalVoice);
  restore('STUDIO_FORBID_PAID', originalForbid);
});

function restore(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

describe('providers', () => {
  it('extracts a video url ahead of an image url', () => {
    const url = extractMediaUrl({
      images: [{ url: 'https://cdn.example/still.png' }],
      video: { url: 'https://cdn.example/clip.mp4' },
    });
    expect(url).toBe('https://cdn.example/clip.mp4');
    expect(videoImageField('fal-ai/kling-video/v3/pro/image-to-video')).toBe('start_image_url');
    expect(videoImageField('bytedance/seedance-2.0/image-to-video')).toBe('image_url');
    expect(videoImageField('bytedance/seedance-2.0/image-to-video', 'end_image_url')).toBe('end_image_url');
    const body: Record<string, unknown> = { image_url: 'https://cdn.example/start.png' };
    assignReferenceImages(body, ['https://cdn.example/style.png', 'https://cdn.example/hero.png']);
    expect(body.reference_image_urls).toEqual([
      'https://cdn.example/style.png',
      'https://cdn.example/hero.png',
    ]);
    expect(body.image_url).toBe('https://cdn.example/start.png');
    const single: Record<string, unknown> = {};
    assignReferenceImages(single, ['https://cdn.example/only.png'], 'image_url');
    expect(single.image_url).toBe('https://cdn.example/only.png');
    expect(videoEndImageField()).toBe('end_image_url');
    expect(videoEndImageField('tail_image_url')).toBe('tail_image_url');
    const framed: Record<string, unknown> = { start_image_url: 'https://cdn.example/start.png' };
    assignReferenceImages(framed, ['https://cdn.example/style.png']);
    assignEndImage(framed, 'https://cdn.example/end.png', 'end_image_url', 'start_image_url');
    expect(framed.start_image_url).toBe('https://cdn.example/start.png');
    expect(framed.end_image_url).toBe('https://cdn.example/end.png');
    expect(framed.reference_image_urls).toEqual(['https://cdn.example/style.png']);
    expect(() => assignEndImage(framed, 'https://cdn.example/end.png', 'image_url', 'image_url')).toThrow(/differ/);
  });

  it('stays on the placeholder when the project says so, even with a key', () => {
    process.env.FAL_KEY = 'test-key';
    process.env.ELEVENLABS_API_KEY = 'test-key';
    const meme = loadProject('projects/meme-example.yaml');
    expect(resolveMediaProvider(meme).id).toBe('placeholder');
    expect(resolveVoiceProvider(meme)?.id).toBe('placeholder');
    expect(resolveMediaProvider(meme, 'fal').paid).toBe(true);
  });

  it('uses fal and elevenlabs for auto only when keys exist', () => {
    delete process.env.FAL_KEY;
    delete process.env.ELEVENLABS_API_KEY;
    const ocean = loadProject('projects/ocean.yaml');
    ocean.provider = 'auto';
    expect(resolveMediaProvider(ocean).id).toBe('placeholder');
    process.env.FAL_KEY = 'test-key';
    expect(resolveMediaProvider(ocean).id).toBe('fal');
  });

  it('refuses paid calls when STUDIO_FORBID_PAID is set', async () => {
    process.env.STUDIO_FORBID_PAID = '1';
    process.env.FAL_KEY = 'test-key';
    process.env.ELEVENLABS_API_KEY = 'test-key';
    await expect(
      falMedia.generateImage({
        prompt: 'x',
        width: 10,
        height: 10,
        aspect: '1:1',
        model: 'fal-ai/flux/dev',
        outPath: '/tmp/should-not-exist.png',
      }),
    ).rejects.toThrow(/STUDIO_FORBID_PAID/);
    await expect(
      elevenLabsVoice.synthesize({
        script: 'hi',
        voiceId: 'voice',
        model: 'eleven_multilingual_v2',
        durationSec: 1,
        shots: [],
        outPath: '/tmp/should-not-exist.mp3',
      }),
    ).rejects.toThrow(/STUDIO_FORBID_PAID/);
  });
});
