import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { StudioError } from '../util/ffmpeg.js';

export type TakeKind = 'image' | 'video' | 'voice';

export type Take = {
  id: string;
  kind: TakeKind;
  inputHash: string;
  provider: string;
  model: string;
  path: string;
  createdAt: string;
  status: 'done';
};

export type ShotEntry = {
  selected: Partial<Record<'image' | 'video', string>>;
  takes: Take[];
};

export type VoiceEntry = {
  selected: string | null;
  takes: Take[];
  wordsPath: string | null;
};

export type Manifest = {
  version: 1;
  slug: string;
  shots: Record<string, ShotEntry>;
  voice: VoiceEntry;
  analysis: {
    music?: string;
  };
};

export function emptyManifest(slug: string): Manifest {
  return {
    version: 1,
    slug,
    shots: {},
    voice: { selected: null, takes: [], wordsPath: null },
    analysis: {},
  };
}

export function manifestPath(workDir: string): string {
  return path.join(workDir, 'manifest.json');
}

export function loadManifest(workDir: string, slug: string): Manifest {
  const file = manifestPath(workDir);
  if (!existsSync(file)) return emptyManifest(slug);
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as Manifest;
  if (parsed.version !== 1) {
    throw new StudioError(`Unsupported manifest version in ${file}. Delete ${workDir} and generate again.`);
  }
  parsed.shots ??= {};
  parsed.voice ??= { selected: null, takes: [], wordsPath: null };
  parsed.analysis ??= {};
  return parsed;
}

export function saveManifest(workDir: string, manifest: Manifest): void {
  mkdirSync(workDir, { recursive: true });
  writeFileSync(manifestPath(workDir), `${JSON.stringify(manifest, null, 2)}\n`);
}

export function shotEntry(manifest: Manifest, shotId: string): ShotEntry {
  manifest.shots[shotId] ??= { selected: {}, takes: [] };
  return manifest.shots[shotId];
}

export function reusableTake(
  takes: Take[],
  selectedId: string | undefined,
  kind: TakeKind,
  inputHash: string,
  workDir: string,
): Take | undefined {
  const matches = takes.filter(
    (take) =>
      take.kind === kind &&
      take.inputHash === inputHash &&
      take.status === 'done' &&
      existsSync(path.join(workDir, take.path)),
  );
  return matches.find((take) => take.id === selectedId) ?? matches[matches.length - 1];
}

export function nextTakeId(takes: Take[], kind: TakeKind): string {
  const count = takes.filter((take) => take.kind === kind).length + 1;
  return `${kind}-${count}`;
}

export function addTake(entry: { takes: Take[]; selected?: Partial<Record<string, string>> }, take: Take): void {
  entry.takes.push(take);
  if (entry.selected && (take.kind === 'image' || take.kind === 'video')) {
    entry.selected[take.kind] = take.id;
  }
}

export function selectTake(manifest: Manifest, shotId: string, takeId: string): Manifest {
  if (shotId === 'voice') {
    const take = manifest.voice.takes.find((item) => item.id === takeId);
    if (!take) throw new StudioError(`Voice take "${takeId}" was not found.`);
    return { ...manifest, voice: { ...manifest.voice, selected: takeId } };
  }
  const shot = manifest.shots[shotId];
  if (!shot) throw new StudioError(`Shot "${shotId}" is not in the manifest.`);
  const take = shot.takes.find((item) => item.id === takeId);
  if (!take) throw new StudioError(`Take "${takeId}" was not found on shot "${shotId}".`);
  if (take.kind !== 'image' && take.kind !== 'video') {
    throw new StudioError(`Take "${takeId}" is not a visual take.`);
  }
  return {
    ...manifest,
    shots: {
      ...manifest.shots,
      [shotId]: {
        ...shot,
        selected: { ...shot.selected, [take.kind]: take.id },
      },
    },
  };
}

export function selectedTake(entry: ShotEntry, kind: 'image' | 'video', workDir: string): Take | undefined {
  const selected = entry.takes.find((take) => take.id === entry.selected[kind] && take.kind === kind);
  if (selected && existsSync(path.join(workDir, selected.path))) return selected;
  const fallback = [...entry.takes]
    .reverse()
    .find((take) => take.kind === kind && take.status === 'done' && existsSync(path.join(workDir, take.path)));
  return fallback;
}
