import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ProjectError } from '../src/project/schema.js';
import { loadProject } from '../src/project/load.js';

function writeProject(body: string, name = 'clip.yaml'): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'studio-schema-'));
  const file = path.join(dir, name);
  writeFileSync(file, body);
  return file;
}

const valid = `
title: Test
aspect: "1:1"
fps: 24
shots:
  - id: one
    prompt: A red square
    duration: 1
`;

describe('project schema', () => {
  it('loads a minimal project and applies defaults', () => {
    const project = loadProject(writeProject(valid));
    expect(project.title).toBe('Test');
    expect(project.aspect).toBe('1:1');
    expect(project.fps).toBe(24);
    expect(project.provider).toBe('auto');
    expect(project.shots[0].kind).toBe('image');
    expect(project.shots[0].camera).toBe('ken-burns-in');
    expect(project.captions.style).toBe('clean');
    expect(project.models.image).toContain('flux');
  });

  it('accepts JSON', () => {
    const project = loadProject(
      writeProject(
        JSON.stringify({
          title: 'Json',
          aspect: '9:16',
          shots: [{ id: 'a', prompt: 'hello', duration: 2, text: '  hi  ' }],
        }),
        'clip.json',
      ),
    );
    expect(project.aspect).toBe('9:16');
    expect(project.shots[0].text).toBe('hi');
  });

  it('reports the field path for invalid values', () => {
    const file = writeProject(`
title: ""
aspect: square
shots:
  - id: "bad id"
    prompt: ""
    duration: 0
`);
    expect(() => loadProject(file)).toThrow(ProjectError);
    try {
      loadProject(file);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      expect(message).toContain('title:');
      expect(message).toContain('aspect:');
      expect(message).toContain('shots.0.prompt:');
      expect(message).toContain('shots.0.duration:');
    }
  });

  it('rejects duplicate shot ids and unknown keys', () => {
    expect(() =>
      loadProject(
        writeProject(`
title: Dupes
aspect: "16:9"
shots:
  - id: same
    prompt: one
    duration: 1
  - id: SAME
    prompt: two
    duration: 1
`),
      ),
    ).toThrow(/Duplicate shot id/);

    expect(() =>
      loadProject(
        writeProject(`
title: Extra
aspect: "16:9"
mood: loud
shots:
  - id: one
    prompt: one
    duration: 1
`),
      ),
    ).toThrow(/mood/);
  });

  it('loads the checked-in examples', () => {
    const ocean = loadProject('projects/ocean.yaml');
    const meme = loadProject('projects/meme-example.yaml');
    expect(ocean.shots).toHaveLength(3);
    expect(ocean.provider).toBe('placeholder');
    expect(ocean.shots.reduce((sum, shot) => sum + shot.duration, 0)).toBe(10);
    expect(meme.captions.style).toBe('impact');
    expect(meme.voiceover?.script).toMatch(/email/);
    expect(meme.edit.snapCutsToBeats).toBe(true);
    expect(meme.music?.file).toContain('meme-beat.wav');
  });
});
