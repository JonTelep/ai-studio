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
    expect(project.models.endImageField).toBe('end_image_url');
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

  it('accepts supplied media and rejects a shot that would generate without a prompt', () => {
    const supplied = loadProject(
      writeProject(`
title: Supplied
aspect: "16:9"
assets: assets
references:
  style: style.png
  character: hero.png
shots:
  - id: still
    image: photo.jpg
    duration: 1
  - id: clip
    video: clip.mp4
    duration: 1
`),
    );
    expect(supplied.assets).toBe('assets');
    expect(supplied.references?.style).toBe('style.png');
    expect(supplied.shots[0].kind).toBe('image');
    expect(supplied.shots[0].prompt).toBeUndefined();
    expect(supplied.shots[1].kind).toBe('video');
    expect(supplied.shots[1].video).toBe('clip.mp4');

    expect(() =>
      loadProject(
        writeProject(`
title: Needs prompt
aspect: "1:1"
shots:
  - id: one
    duration: 1
`),
      ),
    ).toThrow(/Prompt is required/);

    expect(() =>
      loadProject(
        writeProject(`
title: Both
aspect: "1:1"
shots:
  - id: one
    image: a.jpg
    video: b.mp4
    duration: 1
`),
      ),
    ).toThrow(/not both/);
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
    const own = loadProject('projects/own-media.yaml');
    expect(own.assets).toBe('assets');
    expect(own.references?.character).toBe('character.png');
    expect(own.shots.map((shot) => shot.id)).toEqual(['photo', 'animated', 'clip']);
    expect(own.shots[2].kind).toBe('video');
    const bridge = loadProject('projects/bridge.yaml');
    expect(bridge.shots.map((shot) => shot.id)).toEqual(['photo-a', 'crossing', 'photo-b']);
    expect(bridge.shots[1].kind).toBe('video');
    expect(bridge.shots[1].start_from).toBe('previous');
    expect(bridge.shots[1].end_image).toBe('photo-b.jpg');
    expect(bridge.models.endImageField).toBe('end_image_url');
  });

  it('accepts first and last frames and rejects impossible combinations', () => {
    const generated = loadProject(
      writeProject(`
title: Frames
aspect: "1:1"
shots:
  - id: dawn
    start_image:
      prompt: A quiet harbor at dawn
    duration: 1
`),
    );
    expect(generated.shots[0].kind).toBe('image');
    expect(generated.shots[0].prompt).toBeUndefined();

    expect(() =>
      loadProject(
        writeProject(`
title: First
aspect: "1:1"
shots:
  - id: one
    start_from: previous
    end_image: b.jpg
    prompt: move
    duration: 1
`),
      ),
    ).toThrow(/earlier shot/);

    expect(() =>
      loadProject(
        writeProject(`
title: Both starts
aspect: "1:1"
shots:
  - id: one
    image: a.jpg
    start_image: b.jpg
    duration: 1
`),
      ),
    ).toThrow(/not both/);

    expect(() =>
      loadProject(
        writeProject(`
title: Clip
aspect: "1:1"
shots:
  - id: one
    video: clip.mp4
    end_image: b.jpg
    duration: 1
`),
      ),
    ).toThrow(/as-is/);

    expect(() =>
      loadProject(
        writeProject(`
title: No start
aspect: "1:1"
shots:
  - id: one
    end_image: b.jpg
    prompt: move
    duration: 1
`),
      ),
    ).toThrow(/needs a start frame/);

    expect(() =>
      loadProject(
        writeProject(`
title: Motion
aspect: "1:1"
shots:
  - id: one
    image: a.jpg
    duration: 1
  - id: two
    start_from: previous
    end_image: b.jpg
    duration: 1
`),
      ),
    ).toThrow(/motion/);
  });
});
