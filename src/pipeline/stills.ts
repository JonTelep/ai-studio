import { existsSync } from 'node:fs';
import path from 'node:path';
import type { LoadedProject } from '../project/load.js';
import { framePath } from '../project/schema.js';
import { StudioError } from '../util/ffmpeg.js';
import { staleGeneratedStill } from './generate.js';
import { loadManifest, selectedTake } from './manifest.js';
import { resolveAsset, resolveAssetsDir } from './paths.js';
import { planShotMedia } from './shot-media.js';

export type StillGap = {
  shotId: string;
  message: string;
};

/**
 * Shots that need a still before video, voice, and the final render.
 * A generated still must already be in the work manifest. A supplied file must exist.
 * Text-to-video and supplied clips do not need one. `start_from: previous` uses the earlier shot.
 */
export function stillGaps(project: LoadedProject, workDir: string): StillGap[] {
  const manifest = loadManifest(workDir, project.slug);
  let assetsDir: string | undefined;
  try {
    assetsDir = resolveAssetsDir(project.file, project.assets);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return [{ shotId: '', message }];
  }
  const gaps: StillGap[] = [];
  for (const shot of project.shots) {
    const plan = planShotMedia(shot);
    if (plan.source === 'video') continue;
    const textToVideo =
      plan.source === 'generate' && !plan.generateImage && !plan.start && !plan.end && plan.generateVideo;
    if (textToVideo) continue;

    const entry = manifest.shots[shot.id];
    const needsGeneratedStart = plan.generateImage || plan.start?.type === 'generate';
    if (needsGeneratedStart) {
      const take = entry && selectedTake(entry, 'image', workDir);
      const stale = take ? staleGeneratedStill(project, shot, take, 'image') : null;
      if (!take || stale) {
        gaps.push({
          shotId: shot.id,
          message: stale ?? `Shot "${shot.id}" needs a still. Run \`make images\` first.`,
        });
      }
    }

    if (!needsGeneratedStart && (plan.source === 'image' || plan.start?.type === 'file')) {
      const relative = shot.image ?? framePath(shot.start_image);
      if (relative && !fileReady(project.file, relative, assetsDir)) {
        gaps.push({
          shotId: shot.id,
          message: `Shot "${shot.id}" is missing its still ${relative}.`,
        });
      }
    }

    if (plan.end?.type === 'generate') {
      const take = entry && selectedTake(entry, 'end', workDir);
      const stale = take ? staleGeneratedStill(project, shot, take, 'end') : null;
      if (!take || stale) {
        gaps.push({
          shotId: shot.id,
          message: stale ?? `Shot "${shot.id}" needs an end still. Run \`make images\` first.`,
        });
      }
    }
    if (plan.end?.type === 'file') {
      const relative = framePath(shot.end_image);
      if (relative && !fileReady(project.file, relative, assetsDir)) {
        gaps.push({
          shotId: shot.id,
          message: `Shot "${shot.id}" is missing its end still ${relative}.`,
        });
      }
    }
  }
  return gaps;
}

function fileReady(projectFile: string, relative: string, assetsDir?: string): boolean {
  const resolved = resolveAsset(projectFile, relative, assetsDir);
  return existsSync(resolved);
}

export function assertStillsReady(project: LoadedProject, workDir: string): void {
  const gaps = stillGaps(project, workDir);
  if (gaps.length === 0) return;
  throw new StudioError(gaps.map((gap) => gap.message).join('\n'));
}

export function shotStillPath(project: LoadedProject, workDir: string, shotId: string): string | undefined {
  const shot = project.shots.find((item) => item.id === shotId);
  if (!shot) return undefined;
  const manifest = loadManifest(workDir, project.slug);
  const entry = manifest.shots[shotId];
  if (entry) {
    const image = selectedTake(entry, 'image', workDir);
    if (image) return path.join(workDir, image.path);
    const end = selectedTake(entry, 'end', workDir);
    if (end) return path.join(workDir, end.path);
  }
  let assetsDir: string | undefined;
  try {
    assetsDir = resolveAssetsDir(project.file, project.assets);
  } catch {
    assetsDir = undefined;
  }
  for (const relative of [shot.image, framePath(shot.start_image), framePath(shot.end_image)]) {
    if (!relative) continue;
    const resolved = resolveAsset(project.file, relative, assetsDir);
    if (existsSync(resolved)) return resolved;
  }
  return undefined;
}
