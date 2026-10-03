import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { probeDuration, runFfmpeg } from '../src/util/ffmpeg.js';
import { emptyCache, estimateFromCache } from '../src/pipeline/estimate.js';
import { generateProject } from '../src/pipeline/generate.js';
import { loadManifest } from '../src/pipeline/manifest.js';
import { renderProject } from '../src/pipeline/render.js';
import { planShotMedia } from '../src/pipeline/shot-media.js';
import { loadProject } from '../src/project/load.js';

describe('first and last frame', () => {
  it('plans a supplied still, a bridge from the previous frame, and the arrival still', () => {
    const project = loadProject('projects/bridge/project.yaml');
    expect(planShotMedia(project.shots[0])).toEqual({
      source: 'image',
      generateImage: false,
      generateVideo: false,
    });
    expect(planShotMedia(project.shots[1])).toEqual({
      source: 'interpolate',
      generateImage: false,
      generateVideo: true,
      start: { type: 'previous' },
      end: { type: 'file' },
    });
    expect(planShotMedia(project.shots[2])).toEqual({
      source: 'image',
      generateImage: false,
      generateVideo: false,
    });
  });

  it('counts two generated frames plus the video between them', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'studio-bridge-est-'));
    const file = path.join(dir, 'gen.yaml');
    writeFileSync(
      file,
      `
title: Generated frames
aspect: "16:9"
fps: 12
provider: fal
shots:
  - id: span
    start_image:
      prompt: A quiet harbor at dawn
    end_image:
      prompt: The same harbor at dusk
    prompt: Time passes in one slow move
    duration: 2
`,
    );
    const project = loadProject(file);
    expect(planShotMedia(project.shots[0])).toEqual({
      source: 'interpolate',
      generateImage: false,
      generateVideo: true,
      start: { type: 'generate' },
      end: { type: 'generate' },
    });
    const estimate = estimateFromCache(project, emptyCache(project), {
      mediaPaid: true,
      voicePaid: false,
      mediaProvider: 'fal',
      voiceProvider: null,
    });
    expect(estimate.images).toBe(2);
    expect(estimate.videos).toBe(1);
    expect(estimate.supplied).toBe(0);
    expect(estimate.paid).toBe(3);
  });

  it('chains a still into a crossfade and keeps the last frame for the next run', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'studio-bridge-'));
    const assets = path.join(root, 'assets');
    mkdirSync(assets, { recursive: true });
    const photoA = path.join(assets, 'a.jpg');
    const photoB = path.join(assets, 'b.jpg');
    await runFfmpeg(['-f', 'lavfi', '-i', 'color=c=0xE85D4C:s=320x180:d=1', '-frames:v', '1', photoA]);
    await runFfmpeg(['-f', 'lavfi', '-i', 'color=c=0x1B4F8A:s=320x180:d=1', '-frames:v', '1', photoB]);
    const projectPath = path.join(root, 'bridge.yaml');
    writeFileSync(
      projectPath,
      `
title: Bridge
aspect: "16:9"
fps: 12
provider: placeholder
assets: assets
shots:
  - id: a
    image: a.jpg
    duration: 0.4
    text: Photo A
  - id: cross
    start_from: previous
    end_image: b.jpg
    duration: 0.5
    prompt: Travel from the first photo to the second
  - id: b
    image: b.jpg
    duration: 0.4
    text: Photo B
`,
    );
    const result = await generateProject({
      projectPath,
      yes: true,
      dryRun: false,
      fresh: false,
      whisper: false,
      analyzer: 'energy',
      workRoot: root,
    });
    expect(result.estimate.paid).toBe(0);
    expect(result.estimate.images).toBe(0);
    expect(result.estimate.videos).toBe(1);
    expect(result.estimate.supplied).toBe(3);
    const manifest = loadManifest(result.workDir, 'bridge');
    expect(manifest.shots.a.lastFrame).toBeTruthy();
    expect(existsSync(path.join(result.workDir, manifest.shots.a.lastFrame as string))).toBe(true);
    expect(manifest.shots.cross.lastFrame).toBeTruthy();
    expect(existsSync(path.join(result.workDir, manifest.shots.cross.lastFrame as string))).toBe(true);
    expect(manifest.shots.cross.takes.find((take) => take.kind === 'video')?.provider).toBe('placeholder');
    expect(manifest.shots.cross.takes.find((take) => take.kind === 'end')?.provider).toBe('file');
    expect(manifest.shots.a.takes[0].provider).toBe('file');

    const again = await generateProject({
      projectPath,
      yes: true,
      dryRun: false,
      fresh: false,
      whisper: false,
      analyzer: 'energy',
      workRoot: root,
    });
    expect(again.estimate.videos).toBe(0);
    expect(again.estimate.supplied).toBe(0);
    expect(again.estimate.cached).toBe(4);

    const output = await renderProject({ projectPath, renderer: 'ffmpeg', workRoot: root });
    const duration = await probeDuration(output);
    expect(duration).toBeGreaterThan(1.1);
    expect(duration).toBeLessThan(1.6);
  });
});
