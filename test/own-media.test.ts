import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { probeDuration, runFfmpeg, StudioError } from '../src/util/ffmpeg.js';
import { generateProject } from '../src/pipeline/generate.js';
import { loadManifest } from '../src/pipeline/manifest.js';
import { renderProject } from '../src/pipeline/render.js';
import { planShotMedia } from '../src/pipeline/shot-media.js';
import { loadProject } from '../src/project/load.js';

describe('supplied media', () => {
  it('plans stills, animated stills, and clips', () => {
    const project = loadProject('projects/own-media.yaml');
    expect(planShotMedia(project.shots[0])).toEqual({
      source: 'image',
      generateImage: false,
      generateVideo: false,
    });
    expect(planShotMedia(project.shots[1])).toEqual({
      source: 'image',
      generateImage: false,
      generateVideo: true,
    });
    expect(planShotMedia(project.shots[2])).toEqual({
      source: 'video',
      generateImage: false,
      generateVideo: false,
    });
  });

  it('imports a still and a trimmed clip without a paid call', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'studio-own-'));
    const assets = path.join(root, 'assets');
    mkdirSync(assets, { recursive: true });
    const photo = path.join(assets, 'photo.jpg');
    const clip = path.join(assets, 'clip.mp4');
    const style = path.join(assets, 'style.png');
    await runFfmpeg(['-f', 'lavfi', '-i', 'color=c=0xE85D4C:s=320x180:d=1', '-frames:v', '1', photo]);
    await runFfmpeg(['-f', 'lavfi', '-i', 'color=c=0x224466:s=64x64:d=1', '-frames:v', '1', style]);
    await runFfmpeg([
      '-f',
      'lavfi',
      '-i',
      'color=c=0x2E8B57:s=320x180:d=3',
      '-t',
      '3',
      '-r',
      '15',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      clip,
    ]);
    const projectPath = path.join(root, 'own.yaml');
    writeFileSync(
      projectPath,
      `
title: Own
aspect: "16:9"
fps: 15
provider: placeholder
assets: assets
references:
  style: style.png
shots:
  - id: photo
    image: photo.jpg
    duration: 0.4
    text: Still
  - id: move
    kind: video
    image: photo.jpg
    duration: 0.4
    prompt: Push in
    reference_images:
      - style.png
  - id: clip
    video: clip.mp4
    duration: 0.4
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
    const manifest = loadManifest(result.workDir, 'own');
    expect(manifest.shots.photo.takes[0].provider).toBe('file');
    expect(manifest.shots.clip.takes[0].provider).toBe('file');
    expect(manifest.shots.clip.takes[0].kind).toBe('video');
    expect(manifest.shots.move.takes.find((take) => take.kind === 'image')?.provider).toBe('file');
    expect(manifest.shots.move.takes.find((take) => take.kind === 'video')?.provider).toBe('placeholder');

    const again = await generateProject({
      projectPath,
      yes: true,
      dryRun: false,
      fresh: false,
      whisper: false,
      analyzer: 'energy',
      workRoot: root,
    });
    expect(again.estimate.supplied).toBe(0);
    expect(again.estimate.videos).toBe(0);
    expect(again.estimate.cached).toBe(4);

    const output = await renderProject({ projectPath, renderer: 'ffmpeg', workRoot: root });
    const duration = await probeDuration(output);
    expect(duration).toBeGreaterThan(1);
    expect(duration).toBeLessThan(1.5);

    const missing = path.join(root, 'missing.yaml');
    writeFileSync(
      missing,
      `
title: Missing
aspect: "1:1"
fps: 15
provider: placeholder
shots:
  - id: gone
    image: no-such-file.jpg
    duration: 0.2
`,
    );
    await expect(
      generateProject({
        projectPath: missing,
        yes: true,
        dryRun: true,
        fresh: false,
        whisper: false,
        analyzer: 'energy',
        workRoot: root,
      }),
    ).rejects.toBeInstanceOf(StudioError);
  });
});
