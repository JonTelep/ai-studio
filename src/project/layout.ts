import path from 'node:path';
import { StudioError } from '../util/ffmpeg.js';

export type ProjectLayout = {
  dir: string;
  workDir: string;
  outputFile: string;
  contactSheet: string;
  previewFile: string;
  /** True when the file is projects/<name>/project.yaml. */
  isProjectFolder: boolean;
};

export function layoutFor(projectFile: string): ProjectLayout {
  const file = path.resolve(projectFile);
  const dir = path.dirname(file);
  const base = path.basename(file);
  const isProjectFolder = base === 'project.yaml' || base === 'project.yml';
  const slug = isProjectFolder ? path.basename(dir) : base.replace(/\.(ya?ml|json)$/i, '');
  const workDir = isProjectFolder ? path.join(dir, 'work') : path.resolve('work', slug);
  return {
    dir,
    workDir,
    outputFile: isProjectFolder ? path.join(dir, 'output.mp4') : path.join(workDir, 'output.mp4'),
    contactSheet: path.join(dir, 'contact-sheet.jpg'),
    previewFile: path.join(dir, 'preview.mp4'),
    isProjectFolder,
  };
}

export function resolveWorkDir(project: { file: string; slug: string }, workRoot?: string): string {
  if (workRoot) return path.resolve(workRoot, project.slug);
  return layoutFor(project.file).workDir;
}

export function assertProjectName(name: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,40}$/.test(name)) {
    throw new StudioError(
      'Project name must start with a letter or number and use only letters, numbers, dashes, or underscores.',
    );
  }
  return name;
}
