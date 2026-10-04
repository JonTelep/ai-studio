import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { ProjectError, ProjectSchema, formatZodError, type Project } from './schema.js';

export type LoadedProject = Project & {
  file: string;
  slug: string;
};

function readData(file: string): unknown {
  const text = readFileSync(file, 'utf8');
  try {
    if (file.endsWith('.json')) return JSON.parse(text) as unknown;
    return parseYaml(text) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ProjectError(`Could not parse ${file}: ${message}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeConfig(config: unknown, project: unknown): unknown {
  if (!isRecord(project)) return project;
  const base = isRecord(config) ? config : {};
  const merged: Record<string, unknown> = { ...base, ...project };
  for (const key of ['models', 'captions', 'edit'] as const) {
    const fromConfig = base[key];
    const fromProject = project[key];
    if (isRecord(fromConfig) || isRecord(fromProject)) {
      merged[key] = {
        ...(isRecord(fromConfig) ? fromConfig : {}),
        ...(isRecord(fromProject) ? fromProject : {}),
      };
    }
  }
  return merged;
}

export function findConfigFile(startDir: string): string | null {
  const candidates = [
    path.join(startDir, 'studio.config.yaml'),
    path.join(startDir, 'studio.config.yml'),
    path.join(process.cwd(), 'studio.config.yaml'),
    path.join(process.cwd(), 'studio.config.yml'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function loadProject(file: string): LoadedProject {
  const absolute = path.resolve(file);
  if (!existsSync(absolute)) {
    throw new ProjectError(`Project file not found: ${absolute}`);
  }
  const configFile = findConfigFile(path.dirname(absolute));
  const config = configFile ? readData(configFile) : {};
  const parsed = mergeConfig(config, readData(absolute));
  const result = ProjectSchema.safeParse(parsed);
  if (!result.success) {
    throw new ProjectError(formatZodError(result.error));
  }
  const base = path.basename(absolute).replace(/\.(ya?ml|json)$/i, '');
  const slug = base === 'project' ? path.basename(path.dirname(absolute)) : base;
  return { ...result.data, file: absolute, slug };
}

export function projectDuration(project: Pick<Project, 'shots'>): number {
  return project.shots.reduce((sum, shot) => sum + shot.duration, 0);
}
