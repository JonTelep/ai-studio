import { existsSync } from 'node:fs';
import path from 'node:path';
import { StudioError } from '../util/ffmpeg.js';

export function resolveAsset(projectFile: string, relativeOrAbsolute: string): string {
  if (path.isAbsolute(relativeOrAbsolute)) return relativeOrAbsolute;
  const fromProject = path.resolve(path.dirname(projectFile), relativeOrAbsolute);
  if (existsSync(fromProject)) return fromProject;
  const fromCwd = path.resolve(relativeOrAbsolute);
  if (existsSync(fromCwd)) return fromCwd;
  return fromProject;
}

export function requireAsset(projectFile: string, relativeOrAbsolute: string, label: string): string {
  const resolved = resolveAsset(projectFile, relativeOrAbsolute);
  if (!existsSync(resolved)) {
    throw new StudioError(`${label} not found: ${resolved}`);
  }
  return resolved;
}
