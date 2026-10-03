import { spawn } from 'node:child_process';
import { StudioError } from '../util/ffmpeg.js';

export async function decodeMonoFloat32(
  file: string,
  sampleRate = 22050,
): Promise<{ samples: Float32Array; sampleRate: number }> {
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      'ffmpeg',
      ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(sampleRate), '-f', 'f32le', 'pipe:1'],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => reject(new StudioError(`Could not run ffmpeg: ${error.message}`)));
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new StudioError(`ffmpeg decode failed: ${stderr.trim()}`));
    });
  });
  const buffer = Buffer.concat(chunks);
  const length = Math.floor(buffer.byteLength / 4);
  const view = new Float32Array(length);
  for (let i = 0; i < length; i++) view[i] = buffer.readFloatLE(i * 4);
  return { samples: view, sampleRate };
}
