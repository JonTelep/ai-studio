import type { Shot } from '../project/schema.js';
import type { LoadedProject } from '../project/load.js';
import { requireAsset } from './paths.js';

/** Style, character, then any extra project or shot references. Duplicates are dropped. */
export function collectReferenceFiles(project: LoadedProject, shot: Shot, assetsDir?: string): string[] {
  const names = [
    project.references?.style,
    project.references?.character,
    ...(project.references?.images ?? []),
    ...shot.reference_images,
  ].filter((item): item is string => Boolean(item));
  const seen = new Set<string>();
  const files: string[] = [];
  for (const name of names) {
    const file = requireAsset(project.file, name, 'Reference image', assetsDir);
    if (seen.has(file)) continue;
    seen.add(file);
    files.push(file);
  }
  return files;
}
