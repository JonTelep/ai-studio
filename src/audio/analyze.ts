import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { AudioAnalysis } from '../model/types.js';
import { packageRoot } from '../util/root.js';
import { runCommand, StudioError } from '../util/ffmpeg.js';
import { analyzePcm } from './beats.js';
import { decodeMonoFloat32 } from './decode.js';

export async function analyzeMusicFile(
  file: string,
  outFile: string,
  analyzer: 'energy' | 'python',
): Promise<AudioAnalysis> {
  mkdirSync(path.dirname(outFile), { recursive: true });
  if (analyzer === 'python') {
    const script = path.join(packageRoot(), 'python', 'analyze_audio.py');
    try {
      await runCommand('python3', [script, file, outFile]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new StudioError(
        `${message}\nPython beat tracking is optional. Install it with: pip install -r requirements-audio.txt\nOr omit --analyzer python to use the built-in tracker.`,
      );
    }
    const { readFileSync } = await import('node:fs');
    return JSON.parse(readFileSync(outFile, 'utf8')) as AudioAnalysis;
  }
  const decoded = await decodeMonoFloat32(file);
  const analysis = analyzePcm(decoded.samples, decoded.sampleRate);
  writeFileSync(outFile, `${JSON.stringify(analysis, null, 2)}\n`);
  return analysis;
}
