import { describe, expect, it } from 'vitest';
import { cameraTransform, cueAt, shotAt } from '../src/composition/visual.js';
import { visualAt, type RenderPlan } from '../src/model/plan.js';

const plan: RenderPlan = {
  title: 'Test',
  slug: 'test',
  width: 1280,
  height: 720,
  fps: 30,
  durationSec: 4,
  captionStyle: 'impact',
  shots: [
    {
      id: 'a',
      kind: 'image',
      sourcePath: '/tmp/a.png',
      publicFile: 'shots/a.png',
      start: 0,
      end: 2,
      camera: 'ken-burns-in',
      applyCamera: true,
      color: '#000',
    },
    {
      id: 'b',
      kind: 'video',
      sourcePath: '/tmp/b.mp4',
      publicFile: 'shots/b.mp4',
      start: 2,
      end: 4,
      camera: 'pan-left',
      applyCamera: false,
      color: '#111',
    },
  ],
  cues: [
    { start: 0, end: 1, words: ['Hello'], highlightIndex: 0, style: 'impact' },
    { start: 1, end: 2, words: ['there'], highlightIndex: 0, style: 'impact' },
  ],
  audio: [],
};

describe('visual timeline', () => {
  it('moves a still and holds the last shot', () => {
    expect(shotAt(plan.shots, 0).id).toBe('a');
    expect(shotAt(plan.shots, 1.999).id).toBe('a');
    expect(shotAt(plan.shots, 2).id).toBe('b');
    expect(shotAt(plan.shots, 9).id).toBe('b');
    expect(cameraTransform('ken-burns-in', 0).scale).toBe(1);
    expect(cameraTransform('ken-burns-in', 1).scale).toBeCloseTo(1.12);
    expect(cameraTransform('pan-left', 1).x).toBeLessThan(cameraTransform('pan-left', 0).x);
    const start = visualAt(plan, 0);
    const end = visualAt(plan, 2);
    expect(start.shot.id).toBe('a');
    expect(start.transform.scale).toBe(1);
    expect(start.cue?.words).toEqual(['Hello']);
    expect(end.shot.id).toBe('b');
    expect(end.transform.scale).toBe(1);
    expect(cueAt(plan.cues, 1.2)?.words).toEqual(['there']);
    expect(cueAt(plan.cues, 3)).toBeNull();
  });
});
