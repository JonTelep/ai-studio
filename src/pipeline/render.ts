import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { loadProject } from '../project/load.js';
import { layoutFor, resolveWorkDir } from '../project/layout.js';
import { StudioError } from '../util/ffmpeg.js';
import { buildRenderPlan } from './plan.js';
import { renderWithFfmpeg } from './render-ffmpeg.js';
import { renderWithRemotion } from './render-remotion.js';

export type RenderOptions = {
  projectPath: string;
  renderer: 'remotion' | 'ffmpeg';
  workRoot?: string;
  /** Copy the mp4 to projects/<name>/output.mp4. Default true. */
  publish?: boolean;
};

export async function renderProject(options: RenderOptions): Promise<string> {
  const project = loadProject(options.projectPath);
  const workDir = resolveWorkDir(project, options.workRoot);
  const { plan, publicDir } = buildRenderPlan(project, workDir);
  console.log(
    `Rendering ${plan.shots.length} shots, ${plan.durationSec.toFixed(2)}s, ${plan.width}x${plan.height} @ ${plan.fps}fps with ${options.renderer}.`,
  );
  const rendered =
    options.renderer === 'ffmpeg'
      ? await renderWithFfmpeg(plan, workDir)
      : await renderWithRemotion(plan, workDir, publicDir);
  if (!rendered) throw new StudioError('Render did not produce a file.');
  const output = publishOutput(rendered, project.file, options.publish !== false && !options.workRoot);
  console.log(`Wrote ${output}`);
  return output;
}

function publishOutput(rendered: string, projectFile: string, publish: boolean): string {
  if (!publish) return rendered;
  const dest = layoutFor(projectFile).outputFile;
  if (path.resolve(dest) === path.resolve(rendered)) return rendered;
  mkdirSync(path.dirname(dest), { recursive: true });
  copyFileSync(rendered, dest);
  return dest;
}
