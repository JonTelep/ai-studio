import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { renderAss } from '../audio/ass.js';
import type { Camera } from '../model/types.js';
import type { RenderPlan } from '../model/plan.js';
import { escapeFilterPath, runFfmpeg } from '../util/ffmpeg.js';

function framesBetween(start: number, end: number, fps: number): number {
  return Math.max(1, Math.round(end * fps) - Math.round(start * fps));
}

function zoompan(camera: Camera, frames: number, width: number, height: number, fps: number): string {
  const span = Math.max(1, frames - 1);
  const common = `d=${frames}:s=${width}x${height}:fps=${fps}`;
  switch (camera) {
    case 'ken-burns-in':
      return `zoompan=z='1+0.12*on/${span}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':${common}`;
    case 'ken-burns-out':
      return `zoompan=z='1.12-0.12*on/${span}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':${common}`;
    case 'slow-push':
      return `zoompan=z='1+0.06*on/${span}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':${common}`;
    case 'pan-left':
      return `zoompan=z='1.12':x='(iw-iw/zoom)*(1-on/${span})':y='(ih-ih/zoom)/2':${common}`;
    case 'pan-right':
      return `zoompan=z='1.12':x='(iw-iw/zoom)*(on/${span})':y='(ih-ih/zoom)/2':${common}`;
    default:
      return `zoompan=z='1':x='0':y='0':${common}`;
  }
}

export async function renderWithFfmpeg(plan: RenderPlan, workDir: string): Promise<string> {
  const scratch = path.join(workDir, 'render-ffmpeg');
  rmSync(scratch, { recursive: true, force: true });
  mkdirSync(scratch, { recursive: true });
  const segments: string[] = [];

  for (const [index, shot] of plan.shots.entries()) {
    const frames = framesBetween(shot.start, shot.end, plan.fps);
    const segment = path.join(scratch, `seg-${index}.mp4`);
    if (shot.kind === 'image' || shot.applyCamera) {
      const filter = `scale=${plan.width * 2}:${plan.height * 2},${zoompan(shot.camera, frames, plan.width, plan.height, plan.fps)}`;
      await runFfmpeg([
        '-loop',
        '1',
        '-i',
        shot.sourcePath,
        '-vf',
        filter,
        '-frames:v',
        String(frames),
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-an',
        segment,
      ]);
    } else {
      await runFfmpeg([
        '-i',
        shot.sourcePath,
        '-frames:v',
        String(frames),
        '-vf',
        `scale=${plan.width}:${plan.height}:force_original_aspect_ratio=increase,crop=${plan.width}:${plan.height},fps=${plan.fps},tpad=stop_mode=clone:stop_duration=30,format=yuv420p`,
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-an',
        segment,
      ]);
    }
    segments.push(segment);
  }

  const listFile = path.join(scratch, 'concat.txt');
  writeFileSync(listFile, segments.map((file) => `file '${file.replace(/'/g, "'\\''")}'`).join('\n'));
  const concatenated = path.join(scratch, 'concat.mp4');
  await runFfmpeg([
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    listFile,
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-r',
    String(plan.fps),
    '-an',
    concatenated,
  ]);

  const output = path.join(workDir, 'output.mp4');
  const assFile = path.join(scratch, 'captions.ass');
  if (plan.cues.length) writeFileSync(assFile, renderAss(plan.cues, plan.width, plan.height));
  await mix(plan, concatenated, assFile, output);
  return output;
}

async function mix(plan: RenderPlan, video: string, assFile: string, output: string): Promise<void> {
  const duration = plan.durationSec.toFixed(3);
  const args = ['-i', video];
  plan.audio.forEach((track) => args.push('-i', track.sourcePath));
  const filters: string[] = [];
  if (plan.cues.length) {
    filters.push(`[0:v]ass='${escapeFilterPath(assFile)}'[v]`);
  }
  const audioLabels: string[] = [];
  plan.audio.forEach((track, index) => {
    const label = `a${index}`;
    const delay = Math.round(track.start * 1000);
    filters.push(
      `[${index + 1}:a]volume=${track.volume},adelay=${delay}|${delay},atrim=0:${duration},asetpts=PTS-STARTPTS[${label}]`,
    );
    audioLabels.push(`[${label}]`);
  });
  if (audioLabels.length === 1) {
    filters.push(`${audioLabels[0]}anull[a]`);
  } else if (audioLabels.length > 1) {
    filters.push(
      `${audioLabels.join('')}amix=inputs=${audioLabels.length}:duration=longest:dropout_transition=0,atrim=0:${duration}[a]`,
    );
  }
  if (filters.length) {
    args.push('-filter_complex', filters.join(';'));
  }
  if (plan.cues.length) args.push('-map', '[v]');
  else args.push('-map', '0:v');
  if (audioLabels.length) args.push('-map', '[a]', '-c:a', 'aac', '-b:a', '192k');
  args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-t', duration, output);
  await runFfmpeg(args);
}
