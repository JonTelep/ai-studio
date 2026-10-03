import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseArgs } from '../src/args.js';
import { loadManifest } from '../src/pipeline/manifest.js';
import { stillGaps } from '../src/pipeline/stills.js';
import { loadProject } from '../src/project/load.js';
import { resolveWorkDir } from '../src/project/layout.js';
import { StudioError } from '../src/util/ffmpeg.js';
import { generateProject } from '../src/pipeline/generate.js';
import { imagesProject, prodProject, scaffoldProject } from '../src/workflow.js';

describe('makefile and workflow', () => {
  it('parses the workflow commands', () => {
    const dry = parseArgs(['node', 'studio', 'dry', 'projects/ocean/project.yaml']);
    expect(dry.command).toBe('dry');
    expect(dry.project).toBe('projects/ocean/project.yaml');
    expect(dry.yes).toBe(false);

    const redo = parseArgs(['node', 'studio', 'redo', 'projects/ocean/project.yaml', 'swell', '--stage', 'video']);
    expect(redo.shotId).toBe('swell');
    expect(redo.stage).toBe('video');

    const created = parseArgs(['node', 'studio', 'new', 'starship']);
    expect(created.name).toBe('starship');
    expect(created.yes).toBe(false);
  });

  it('captures a positional project name and name=', () => {
    const root = process.cwd();
    const positional = execFileSync('make', ['-n', 'dry', 'ocean'], { cwd: root, encoding: 'utf8' });
    expect(positional).toContain('studio -- dry projects/ocean/project.yaml');
    expect(positional).not.toContain('--yes');

    const named = execFileSync('make', ['-n', 'dry', 'name=starship'], { cwd: root, encoding: 'utf8' });
    expect(named).toContain('studio -- dry projects/starship/project.yaml');

    const redo = execFileSync('make', ['-n', 'redo', 'ocean', 'shot=swell', 'stage=image'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(redo).toContain('studio -- redo projects/ocean/project.yaml swell --stage image');
    expect(redo).not.toContain('--yes');
  });

  it('refuses prod when a generated still is missing', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'studio-gate-'));
    const projectPath = path.join(root, 'gate.yaml');
    writeFileSync(
      projectPath,
      `
title: Gate
aspect: "16:9"
fps: 12
provider: placeholder
shots:
  - id: still
    prompt: A red field
    duration: 0.4
  - id: move
    kind: video
    prompt: Push across the red field
    duration: 0.4
`,
    );
    const project = loadProject(projectPath);
    const gaps = stillGaps(project, resolveWorkDir(project));
    expect(gaps.map((gap) => gap.shotId)).toEqual(['still', 'move']);
    await expect(prodProject(projectPath, 'ffmpeg')).rejects.toThrow(/make images/);
  });

  it('skips supplied photos when generating stills', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'studio-skip-'));
    const images = path.join(root, 'images');
    mkdirSync(images);
    writeFileSync(path.join(images, 'photo.jpg'), 'not-a-real-photo');
    const projectPath = path.join(root, 'skip.yaml');
    writeFileSync(
      projectPath,
      `
title: Skip
aspect: "16:9"
fps: 12
provider: fal
assets: images
shots:
  - id: photo
    image: photo.jpg
    duration: 0.4
  - id: drawn
    prompt: A green field
    duration: 0.4
`,
    );
    const result = await generateProject({
      projectPath,
      yes: true,
      dryRun: true,
      fresh: false,
      whisper: false,
      analyzer: 'energy',
      scope: 'images',
      workRoot: root,
    });
    expect(result.estimate.images).toBe(1);
    expect(result.estimate.videos).toBe(0);
    expect(result.estimate.paid).toBe(1);
    expect(result.estimate.supplied).toBe(1);
  });

  it('lets prod run after stills exist', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'studio-flow-'));
    const slug = `flow${Date.now().toString(36)}`;
    const projectPath = path.join(root, `${slug}.yaml`);
    writeFileSync(
      projectPath,
      `
title: Flow
aspect: "16:9"
fps: 10
provider: placeholder
shots:
  - id: still
    prompt: A red field
    duration: 0.3
    camera: static
  - id: words
    kind: video
    videoMode: text-to-video
    prompt: A blue field
    duration: 0.3
`,
    );
    await expect(prodProject(projectPath, 'ffmpeg')).rejects.toBeInstanceOf(StudioError);

    await imagesProject(projectPath);
    const project = loadProject(projectPath);
    const workDir = resolveWorkDir(project);
    const manifest = loadManifest(workDir, 'flow');
    expect(manifest.shots.still.takes.some((take) => take.kind === 'image')).toBe(true);
    expect(manifest.shots.still.takes.some((take) => take.kind === 'video')).toBe(false);
    expect(stillGaps(project, workDir)).toEqual([]);

    await prodProject(projectPath, 'ffmpeg');
    const after = loadManifest(workDir, 'flow');
    expect(after.shots.words.takes.some((take) => take.kind === 'video')).toBe(true);
  });

  it('scaffolds a project folder', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'studio-new-'));
    const file = scaffoldProject('starship', root);
    expect(file).toBe(path.join(root, 'starship', 'project.yaml'));
    const project = loadProject(file);
    expect(project.title).toBe('starship');
    expect(project.shots).toHaveLength(1);
    expect(() => scaffoldProject('starship', root)).toThrow(/already exists/);
    expect(() => scaffoldProject('../etc', root)).toThrow(StudioError);
  });
});
