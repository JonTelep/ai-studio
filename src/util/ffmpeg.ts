import { spawn } from 'node:child_process';

export class StudioError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StudioError';
  }
}

export function runCommand(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    child.on('error', (error) => {
      reject(new StudioError(`Could not run ${command}: ${error.message}`));
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new StudioError(`${command} exited ${code}: ${stderr.trim()}`));
    });
  });
}

export function runFfmpeg(args: string[]): Promise<void> {
  return runCommand('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args]);
}

export function probeDuration(file: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
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
        reject(new StudioError(`ffprobe exited ${code}: ${stderr.trim()}`));
        return;
      }
      const duration = Number(stdout.trim());
      if (!Number.isFinite(duration)) {
        reject(new StudioError(`ffprobe returned no duration for ${file}`));
        return;
      }
      resolve(duration);
    });
  });
}

export function escapeFilterPath(filePath: string): string {
  return filePath.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
}
