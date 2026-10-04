import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { StudioError } from '../util/ffmpeg.js';
import { sha256 } from '../util/hash.js';

export function resolveAsset(projectFile: string, relativeOrAbsolute: string, assetsDir?: string): string {
  if (path.isAbsolute(relativeOrAbsolute)) return relativeOrAbsolute;
  const candidates: string[] = [];
  if (assetsDir) candidates.push(path.resolve(assetsDir, relativeOrAbsolute));
  candidates.push(path.resolve(path.dirname(projectFile), relativeOrAbsolute));
  candidates.push(path.resolve(relativeOrAbsolute));
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

export function requireAsset(
  projectFile: string,
  relativeOrAbsolute: string,
  label: string,
  assetsDir?: string,
): string {
  const resolved = resolveAsset(projectFile, relativeOrAbsolute, assetsDir);
  if (!existsSync(resolved)) {
    const lookedIn = assetsDir ? `${assetsDir} and ${path.dirname(projectFile)}` : path.dirname(projectFile);
    throw new StudioError(`${label} not found: ${relativeOrAbsolute} (looked in ${lookedIn})`);
  }
  return resolved;
}

export function resolveAssetsDir(projectFile: string, assets: string | undefined): string | undefined {
  if (!assets) return undefined;
  const resolved = resolveAsset(projectFile, assets);
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    throw new StudioError(`Assets folder not found: ${resolved}`);
  }
  return resolved;
}

/** Identity of a user file for the manifest. Changes when the file is replaced. */
export function fileStamp(file: string): string {
  const stat = statSync(file);
  return sha256({ file, size: stat.size, mtimeMs: Math.round(stat.mtimeMs) });
}
