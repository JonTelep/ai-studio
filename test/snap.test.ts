import { describe, expect, it } from 'vitest';
import { buildTimeline, snapTime } from '../src/audio/snap.js';

describe('snap', () => {
  it('returns the original time when no beat is inside the window', () => {
    expect(snapTime(2.4, [0, 1, 5], 0.2)).toBe(2.4);
    expect(snapTime(2.4, [], 0.2)).toBe(2.4);
  });

  it('picks the nearest beat inside the window', () => {
    expect(snapTime(2.4, [2.2, 2.55], 0.2)).toBe(2.55);
    expect(snapTime(2.5, [2.5], 0)).toBe(2.5);
  });

  it('snaps interior cuts and keeps the authored ending', () => {
    const timeline = buildTimeline(
      [
        { id: 'a', duration: 2.4 },
        { id: 'b', duration: 2.6 },
        { id: 'c', duration: 2.2 },
      ],
      [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7],
      { snap: true, windowSec: 0.25 },
    );
    expect(timeline.shots.map((shot) => shot.start)).toEqual([0, 2.5, 5]);
    expect(timeline.shots[2].end).toBe(7.2);
    expect(timeline.shots.reduce((sum, shot) => sum + shot.duration, 0)).toBeCloseTo(7.2, 5);
  });

  it('does not let a snap erase a shot', () => {
    const timeline = buildTimeline(
      [
        { id: 'a', duration: 0.3 },
        { id: 'b', duration: 0.3 },
      ],
      [0.5],
      { snap: true, windowSec: 0.25, minDuration: 0.2 },
    );
    expect(timeline.shots[0].duration).toBeGreaterThanOrEqual(0.2);
    expect(timeline.shots[1].duration).toBeGreaterThanOrEqual(0.2);
    expect(timeline.shots[1].end).toBeCloseTo(0.6, 5);
  });

  it('leaves the timeline alone when snapping is off', () => {
    const timeline = buildTimeline(
      [
        { id: 'a', duration: 1.2 },
        { id: 'b', duration: 0.8 },
      ],
      [1],
      { snap: false, windowSec: 0.5 },
    );
    expect(timeline.shots.map((shot) => [shot.start, shot.end])).toEqual([
      [0, 1.2],
      [1.2, 2],
    ]);
  });
});
