import { existsSync } from 'node:fs';
import path from 'node:path';
import type { LoadedProject } from '../project/load.js';
import { framePath, type Shot } from '../project/schema.js';
import { StudioError } from '../util/ffmpeg.js';
import { loadManifest, selectedTake, type ShotEntry, type Take } from './manifest.js';
import { resolveAsset, resolveAssetsDir } from './paths.js';

const DESCRIPTION_LIMIT = 80;

/**
 * `shot=` may be a 1-based number from `make shots`, or the shot id.
 * An id wins when it is also a number, so a shot named "2" is not confused with shot 2.
 * `voice` is the voiceover row in `make pick`.
 */
export function resolveShotId(shots: readonly { id: string }[], ref: string): string {
  if (ref === 'voice') return ref;
  const exact = shots.find((shot) => shot.id === ref);
  if (exact) return exact.id;
  if (/^[1-9]\d*$/.test(ref)) {
    const shot = shots[Number(ref) - 1];
    if (shot) return shot.id;
  }
  const choices = shots.map((shot, index) => `${index + 1} ${shot.id}`).join(', ');
  throw new StudioError(`Shot "${ref}" is not in the project. Use a number or an id: ${choices}.`);
}

export function shotDescription(
  shot: Pick<Shot, 'prompt' | 'image' | 'video' | 'start_image' | 'end_image' | 'start_from'>,
): string {
  const prompt = shot.prompt?.replace(/\s+/g, ' ').trim();
  if (prompt) return clip(prompt, DESCRIPTION_LIMIT);
  const file = shot.image ?? shot.video ?? framePath(shot.start_image) ?? framePath(shot.end_image);
  if (file) return path.basename(file);
  if (shot.start_from === 'previous') return 'previous shot';
  return '';
}

export function formatShotTable(project: LoadedProject, workDir: string): string {
  const manifest = loadManifest(workDir, project.slug);
  const assetsDir = assetsDirOf(project);
  const rows = project.shots.map((shot, index) => ({
    n: String(index + 1),
    id: shot.id,
    kind: shot.kind,
    duration: formatDuration(shot.duration),
    description: shotDescription(shot),
    text: shot.text?.replace(/\s+/g, ' ').trim() ?? '',
    status: shotStatus(project, shot, workDir, manifest.shots[shot.id], assetsDir),
  }));
  const header = { n: '#', id: 'id', kind: 'kind', duration: 'duration', description: 'description', text: 'text', status: 'status' };
  const widths = {
    n: width([header, ...rows], 'n'),
    id: width([header, ...rows], 'id'),
    kind: width([header, ...rows], 'kind'),
    duration: width([header, ...rows], 'duration'),
    description: width([header, ...rows], 'description'),
    text: width([header, ...rows], 'text'),
    status: width([header, ...rows], 'status'),
  };
  const line = (row: typeof header) =>
    [
      pad(row.n, widths.n),
      pad(row.id, widths.id),
      pad(row.kind, widths.kind),
      pad(row.duration, widths.duration),
      pad(row.description, widths.description),
      pad(row.text, widths.text),
      row.status,
    ].join('  ');
  return [line(header), ...rows.map(line)].join('\n');
}

export function listShots(project: LoadedProject, workDir: string): void {
  console.log(formatShotTable(project, workDir));
}

function shotStatus(
  project: LoadedProject,
  shot: Shot,
  workDir: string,
  entry: ShotEntry | undefined,
  assetsDir: string | undefined,
): string {
  const videos = takesOnDisk(entry, workDir, 'video');
  const video = entry ? selectedTake(entry, 'video', workDir) : undefined;
  if (video && videos.length > 0) return readyStatus(video, videos, 'video ready');
  if (shot.video && fileOnDisk(project, shot.video, assetsDir)) return 'video ready';

  const images = takesOnDisk(entry, workDir, 'image');
  const ends = takesOnDisk(entry, workDir, 'end');
  const image = entry ? selectedTake(entry, 'image', workDir) : undefined;
  if (image && images.length > 0) return readyStatus(image, images, 'image ready');
  const end = entry ? selectedTake(entry, 'end', workDir) : undefined;
  if (end && ends.length > 0) return readyStatus(end, ends, 'image ready');

  const supplied =
    shot.image ?? framePath(shot.start_image) ?? framePath(shot.end_image);
  if (supplied && fileOnDisk(project, supplied, assetsDir)) return 'image ready';
  return 'no image';
}

function readyStatus(selected: Take, sameKind: Take[], single: 'image ready' | 'video ready'): string {
  return sameKind.length > 1 ? `selected ${selected.id}` : single;
}

function takesOnDisk(entry: ShotEntry | undefined, workDir: string, kind: Take['kind']): Take[] {
  if (!entry) return [];
  return entry.takes.filter(
    (take) => take.kind === kind && take.status === 'done' && existsSync(path.join(workDir, take.path)),
  );
}

function fileOnDisk(project: LoadedProject, relative: string, assetsDir: string | undefined): boolean {
  return existsSync(resolveAsset(project.file, relative, assetsDir));
}

function assetsDirOf(project: LoadedProject): string | undefined {
  if (!project.assets) return undefined;
  try {
    return resolveAssetsDir(project.file, project.assets);
  } catch {
    return undefined;
  }
}

function formatDuration(seconds: number): string {
  const rounded = Number.isInteger(seconds) ? String(seconds) : String(seconds);
  return `${rounded}s`;
}

function clip(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1)}…`;
}

function width(rows: { [key: string]: string }[], key: string): number {
  return rows.reduce((max, row) => Math.max(max, row[key]?.length ?? 0), 0);
}

function pad(value: string, size: number): string {
  return value.padEnd(size, ' ');
}
