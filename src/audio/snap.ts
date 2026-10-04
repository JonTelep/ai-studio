import { round3 } from '../util/time.js';

export type TimelineShot = {
  id: string;
  start: number;
  end: number;
  duration: number;
};

export type Timeline = {
  shots: TimelineShot[];
};

export function snapTime(time: number, beats: number[], windowSec: number): number {
  let best = time;
  let bestDist = Infinity;
  for (const beat of beats) {
    const dist = Math.abs(beat - time);
    if (dist <= windowSec + 1e-9 && dist < bestDist - 1e-9) {
      bestDist = dist;
      best = beat;
    }
  }
  return best;
}

function toTimeline(ids: string[], cuts: number[]): Timeline {
  return {
    shots: ids.map((id, index) => {
      const start = round3(cuts[index]);
      const end = round3(cuts[index + 1]);
      return { id, start, end, duration: round3(end - start) };
    }),
  };
}

/**
 * Snap interior cut points to beats inside the window, then repair the
 * timeline so every shot stays at least `minDuration` and the total length
 * stays equal to the sum of the authored durations.
 */
export function buildTimeline(
  shots: { id: string; duration: number }[],
  beats: number[],
  options: { snap: boolean; windowSec: number; minDuration?: number },
): Timeline {
  const minDuration = options.minDuration ?? 0.2;
  if (shots.length === 0) return { shots: [] };
  const raw: number[] = [0];
  for (const shot of shots) raw.push(raw[raw.length - 1] + shot.duration);
  const end = raw[raw.length - 1];
  const ids = shots.map((shot) => shot.id);
  const canSnap =
    options.snap && beats.length > 0 && end + 1e-6 >= shots.length * minDuration;
  if (!canSnap) return toTimeline(ids, raw);

  const cuts = raw.slice();
  for (let i = 1; i < cuts.length - 1; i++) {
    cuts[i] = snapTime(cuts[i], beats, options.windowSec);
  }
  for (let i = 1; i < cuts.length - 1; i++) {
    const floor = cuts[i - 1] + minDuration;
    if (cuts[i] < floor) cuts[i] = floor;
  }
  cuts[cuts.length - 1] = end;
  for (let i = cuts.length - 2; i >= 1; i--) {
    const ceiling = cuts[i + 1] - minDuration;
    if (cuts[i] > ceiling) cuts[i] = ceiling;
  }
  if (cuts.some((cut, index) => index > 0 && cut < cuts[index - 1] + minDuration - 1e-6)) {
    return toTimeline(ids, raw);
  }
  return toTimeline(ids, cuts);
}
