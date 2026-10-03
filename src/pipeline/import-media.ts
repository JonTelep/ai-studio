import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { runFfmpeg } from '../util/ffmpeg.js';

export async function fitStill(source: string, outPath: string, width: number, height: number): Promise<void> {
  mkdirSync(path.dirname(outPath), { recursive: true });
  await runFfmpeg([
    '-i',
    source,
    '-frames:v',
    '1',
    '-vf',
    `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`,
    outPath,
  ]);
}

/** One frame from the end of a clip, used as the next shot's start when start_from is previous. */
export async function extractLastFrame(source: string, outPath: string): Promise<void> {
  mkdirSync(path.dirname(outPath), { recursive: true });
  await runFfmpeg(['-sseof', '-0.1', '-i', source, '-frames:v', '1', outPath]);
}

/** Trim or hold a supplied clip to the shot length and fit it to the frame. No model is called. */
export async function trimClip(
  source: string,
  outPath: string,
  durationSec: number,
  fps: number,
  width: number,
  height: number,
): Promise<void> {
  const frames = Math.max(1, Math.round(durationSec * fps));
  mkdirSync(path.dirname(outPath), { recursive: true });
  await runFfmpeg([
    '-i',
    source,
    '-frames:v',
    String(frames),
    '-vf',
    `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=${fps},tpad=stop_mode=clone:stop_duration=${durationSec},format=yuv420p`,
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-an',
    outPath,
  ]);
}