import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseArgs } from '../src/args.js';
import { probeDuration } from '../src/util/ffmpeg.js';
import { generateProject } from '../src/pipeline/generate.js';
import { loadManifest } from '../src/pipeline/manifest.js';
import { renderProject } from '../src/pipeline/render.js';

describe('placeholder pipeline', () => {
  it('parses the documented commands', () => {
    const args = parseArgs([
      'node',
      'studio',
      'all',
      'projects/ocean.yaml',
      '--yes',
      '--renderer',
      'ffmpeg',
      '--dry-run',
    ]);
    expect(args.command).toBe('all');
    expect(args.yes).toBe(true);
    expect(args.dryRun).toBe(true);
    expect(args.renderer).toBe('ffmpeg');
    expect(args.project).toBe('projects/ocean.yaml');
  });

  it('generates, skips cached takes, and renders an mp4', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'studio-pipeline-'));
    const projectPath = path.join(root, 'tiny.yaml');
    writeFileSync(
      projectPath,
      `
title: Tiny
aspect: "1:1"
fps: 15
provider: placeholder
shots:
  - id: one
    prompt: A flat red field
    duration: 0.4
    camera: static
    text: Hello there
  - id: two
    kind: video
    videoMode: text-to-video
    prompt: A flat blue field
    duration: 0.4
    camera: ken-burns-in
captions:
  style: impact
`,
    );
    const first = await generateProject({
      projectPath,
      yes: true,
      dryRun: false,
      fresh: false,
      whisper: false,
      analyzer: 'energy',
      workRoot: root,
    });
    expect(first.estimate.paid).toBe(0);
    expect(first.estimate.images).toBe(1);
    expect(first.estimate.videos).toBe(1);
    const manifest = loadManifest(first.workDir, 'tiny');
    expect(manifest.shots.one.takes).toHaveLength(1);
    expect(manifest.shots.two.takes).toHaveLength(1);

    const second = await generateProject({
      projectPath,
      yes: true,
      dryRun: false,
      fresh: false,
      whisper: false,
      analyzer: 'energy',
      workRoot: root,
    });
    expect(second.estimate.cached).toBe(2);
    expect(second.estimate.images).toBe(0);
    expect(loadManifest(second.workDir, 'tiny').shots.one.takes).toHaveLength(1);

    const output = await renderProject({ projectPath, renderer: 'ffmpeg', workRoot: root });
    const duration = await probeDuration(output);
    expect(duration).toBeGreaterThan(0.6);
    expect(duration).toBeLessThan(1.2);
  });
});
