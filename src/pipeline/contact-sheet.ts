import { existsSync } from 'node:fs';
import path from 'node:path';
import type { LoadedProject } from '../project/load.js';
import { runFfmpeg, StudioError } from '../util/ffmpeg.js';
import { shotStillPath } from './stills.js';

const CELL_W = 480;
const CELL_H = 270;

function fontFile(): string | undefined {
  const candidates = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/Library/Fonts/Arial.ttf',
  ];
  return candidates.find((file) => existsSync(file));
}

/** One labeled cell per shot that has a still. Supplied photos are included and not regenerated. */
export async function writeContactSheet(project: LoadedProject, workDir: string, outPath: string): Promise<void> {
  const cells = project.shots.flatMap((shot) => {
    const file = shotStillPath(project, workDir, shot.id);
    return file ? [{ id: shot.id, file }] : [];
  });
  if (cells.length === 0) {
    console.log('No stills to put on a contact sheet.');
    return;
  }
  const font = fontFile();
  if (cells.length === 1) {
    const only = cells[0];
    const text = font
      ? `,drawtext=fontfile='${font}':text='${only.id}':fontcolor=white:fontsize=28:x=16:y=h-44:box=1:boxcolor=black@0.55:boxborderw=8`
      : '';
    await runFfmpeg([
      '-i',
      only.file,
      '-vf',
      `scale=${CELL_W}:${CELL_H}:force_original_aspect_ratio=increase,crop=${CELL_W}:${CELL_H}${text}`,
      '-frames:v',
      '1',
      outPath,
    ]);
    console.log(`Contact sheet: ${path.resolve(outPath)}`);
    return;
  }
  const cols = Math.ceil(Math.sqrt(cells.length));
  const filters: string[] = [];
  const labels: string[] = [];
  cells.forEach((cell, index) => {
    const label = `c${index}`;
    const text = font
      ? `,drawtext=fontfile='${font}':text='${cell.id}':fontcolor=white:fontsize=28:x=16:y=h-44:box=1:boxcolor=black@0.55:boxborderw=8`
      : '';
    filters.push(
      `[${index}:v]scale=${CELL_W}:${CELL_H}:force_original_aspect_ratio=increase,crop=${CELL_W}:${CELL_H}${text}[${label}]`,
    );
    labels.push(`[${label}]`);
  });
  const layout = cells
    .map((_, index) => {
      const x = (index % cols) * CELL_W;
      const y = Math.floor(index / cols) * CELL_H;
      return `${x}_${y}`;
    })
    .join('|');
  filters.push(`${labels.join('')}xstack=inputs=${cells.length}:layout=${layout}[sheet]`);
  const args: string[] = [];
  for (const cell of cells) {
    args.push('-i', cell.file);
  }
  args.push('-filter_complex', filters.join(';'), '-map', '[sheet]', '-frames:v', '1', outPath);
  try {
    await runFfmpeg(args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new StudioError(`Could not write the contact sheet.\n${message}`);
  }
  console.log(`Contact sheet: ${path.resolve(outPath)}`);
}
