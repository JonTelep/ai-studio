import { spawn } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { StudioError } from '../util/ffmpeg.js';

export function assertReadable(file: string, label: string): void {
  try {
    accessSync(file, constants.R_OK);
  } catch {
    throw new StudioError(`${label} is not readable: ${file}`);
  }
}

/** Width and height of a still or a video, via ffprobe. */
export function probeFrameSize(file: string, label: string): Promise<{ width: number; height: number }> {
  assertReadable(file, label);
  return new Promise((resolve, reject) => {
    const child = spawn(
      'ffprobe',
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=width,height',
        '-of',
        'csv=s=x:p=0',
        file,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => reject(new StudioError(`Could not run ffprobe: ${error.message}`)));
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new StudioError(`${label} is not a readable image: ${file}${stderr.trim() ? ` (${stderr.trim()})` : ''}`));
        return;
      }
      const [width, height] = stdout.trim().split('x').map((value) => Number(value));
      if (!width || !height) {
        reject(new StudioError(`${label} has no dimensions: ${file}`));
        return;
      }
      resolve({ width, height });
    });
  });
}
