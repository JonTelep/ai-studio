import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseArgs } from '../src/args.js';
import { addTake, emptyManifest, saveManifest, shotEntry, type Take } from '../src/pipeline/manifest.js';
import { formatShotTable, resolveShotId, shotDescription } from '../src/pipeline/shot-list.js';
import { loadProject } from '../src/project/load.js';
import { StudioError } from '../src/util/ffmpeg.js';

function take(id: string, kind: Take['kind'], relative: string): Take {
  return {
    id,
    kind,
    inputHash: 'hash',
    provider: 'placeholder',
    model: 'model',
    path: relative,
    createdAt: '2026-01-01T00:00:00.000Z',
    status: 'done',
  };
}

describe('shot numbers', () => {
  it('accepts a 1-based number or an id, and an id wins when it looks like a number', () => {
    const shots = [{ id: 'horizon' }, { id: '1' }, { id: 'underwater' }];
    expect(resolveShotId(shots, '1')).toBe('1');
    expect(resolveShotId(shots, '3')).toBe('underwater');
    expect(resolveShotId(shots, 'horizon')).toBe('horizon');
    expect(resolveShotId(shots, 'voice')).toBe('voice');
    expect(() => resolveShotId(shots, '9')).toThrow(StudioError);
    expect(() => resolveShotId(shots, '9')).toThrow(/1 horizon, 2 1, 3 underwater/);
  });

  it('parses shots and passes a numeric shot through to the CLI', () => {
    const listed = parseArgs(['node', 'studio', 'shots', 'projects/ocean/project.yaml']);
    expect(listed.command).toBe('shots');
    expect(listed.project).toBe('projects/ocean/project.yaml');

    const redo = parseArgs(['node', 'studio', 'redo', 'projects/ocean/project.yaml', '2']);
    expect(redo.shotId).toBe('2');

    const root = process.cwd();
    const shots = execFileSync('make', ['-n', 'shots', 'ocean'], { cwd: root, encoding: 'utf8' });
    expect(shots).toContain('studio -- shots projects/ocean/project.yaml');
    const alias = execFileSync('make', ['-n', 'list', 'name=ocean'], { cwd: root, encoding: 'utf8' });
    expect(alias).toContain('studio -- shots projects/ocean/project.yaml');
    const numbered = execFileSync('make', ['-n', 'redo', 'ocean', 'shot=2'], { cwd: root, encoding: 'utf8' });
    expect(numbered).toContain('studio -- redo projects/ocean/project.yaml 2');
  });

  it('describes a shot from the prompt or the supplied file name', () => {
    const prompt = 'a'.repeat(90);
    expect(shotDescription({ prompt })).toBe(`${'a'.repeat(79)}…`);
    expect(shotDescription({ image: 'images/photo.jpg' })).toBe('photo.jpg');
    expect(shotDescription({ video: 'clip.mp4' })).toBe('clip.mp4');
  });

  it('prints a numbered table with status', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'studio-shots-'));
    const images = path.join(root, 'images');
    mkdirSync(images);
    writeFileSync(path.join(images, 'photo.jpg'), 'photo');
    const projectPath = path.join(root, 'reel.yaml');
    writeFileSync(
      projectPath,
      `
title: Reel
aspect: "16:9"
fps: 12
provider: placeholder
assets: images
shots:
  - id: photo
    image: photo.jpg
    duration: 1.5
    text: Hello there
  - id: drawn
    prompt: ${'Wide '.repeat(20)}field of red dunes at dusk
    duration: 4
  - id: move
    kind: video
    prompt: Push across the dunes
    duration: 2
    text: Go
`,
    );
    const project = loadProject(projectPath);
    const workDir = path.join(root, 'work');
    mkdirSync(path.join(workDir, 'shots', 'move'), { recursive: true });
    writeFileSync(path.join(workDir, 'shots', 'move', 'video-1.mp4'), 'video');
    writeFileSync(path.join(workDir, 'shots', 'move', 'video-2.mp4'), 'video');
    const manifest = emptyManifest(project.slug);
    const entry = shotEntry(manifest, 'move');
    addTake(entry, take('video-1', 'video', 'shots/move/video-1.mp4'));
    addTake(entry, take('video-2', 'video', 'shots/move/video-2.mp4'));
    saveManifest(workDir, manifest);

    const table = formatShotTable(project, workDir);
    const lines = table.split('\n');
    expect(lines[0]).toContain('description');
    expect(lines[1]).toMatch(/^1\s+photo\s+image\s+1\.5s\s+photo\.jpg\s+Hello there\s+image ready$/);
    expect(lines[2]).toContain('drawn');
    expect(lines[2]).toContain('no image');
    expect(lines[2]).toContain('…');
    expect(lines[2]).not.toContain('dunes at dusk');
    expect(lines[3]).toMatch(/3\s+move\s+video\s+2s\s+Push across the dunes\s+Go\s+selected video-2$/);
  });
});
