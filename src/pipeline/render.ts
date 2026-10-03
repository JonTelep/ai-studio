import path from 'node:path';
import { loadProject } from '../project/load.js';
import { StudioError } from '../util/ffmpeg.js';
import { buildRenderPlan } from './plan.js';
import { renderWithFfmpeg } from './render-ffmpeg.js';
import { renderWithRemotion } from './render-remotion.js';

export type RenderOptions = {
  projectPath: string;
  renderer: 'remotion' | 'ffmpeg';
  workRoot?: string;
};

export async function renderProject(options: RenderOptions): Promise<string> {
  const project = loadProject(options.projectPath);
  const workDir = path.resolve(options.workRoot ?? 'work', project.slug);
  const { plan, publicDir } = buildRenderPlan(project, workDir);
  console.log(
    `Rendering ${plan.shots.length} shots, ${plan.durationSec.toFixed(2)}s, ${plan.width}x${plan.height} @ ${plan.fps}fps with ${options.renderer}.`,
  );
  const output =
    options.renderer === 'ffmpeg'
      ? await renderWithFfmpeg(plan, workDir)
      : await renderWithRemotion(plan, workDir, publicDir);
  if (!output) throw new StudioError('Render did not produce a file.');
  console.log(`Wrote ${output}`);
  return output;
}
