import { HELP, parseArgs } from './args.js';
import { loadEnvFile } from './env.js';
import { ProjectError } from './project/schema.js';
import { loadProject } from './project/load.js';
import { resolveWorkDir } from './project/layout.js';
import { generateProject } from './pipeline/generate.js';
import { loadManifest, saveManifest, selectTake } from './pipeline/manifest.js';
import { renderProject } from './pipeline/render.js';
import { StudioError } from './util/ffmpeg.js';
import {
  dryProject,
  imagesProject,
  prodProject,
  redoShot,
  scaffoldProject,
  validateProject,
} from './workflow.js';

async function main(): Promise<void> {
  loadEnvFile();
  const args = parseArgs(process.argv);
  if (args.command === 'help') {
    console.log(HELP);
    return;
  }
  if (args.command === 'new') {
    scaffoldProject(args.name as string);
    return;
  }
  const projectPath = args.project as string;
  if (args.command === 'validate') {
    validateProject(projectPath);
    return;
  }
  if (args.command === 'dry') {
    await dryProject(projectPath);
    return;
  }
  if (args.command === 'images') {
    await imagesProject(projectPath);
    return;
  }
  if (args.command === 'prod') {
    await prodProject(projectPath, args.renderer);
    return;
  }
  if (args.command === 'redo') {
    await redoShot(projectPath, args.shotId as string, args.stage);
    return;
  }
  if (args.command === 'takes') {
    printTakes(projectPath);
    return;
  }
  if (args.command === 'select') {
    select(projectPath, args.shotId as string, args.takeId as string);
    return;
  }
  if (args.command === 'generate' || args.command === 'all') {
    await generateProject({
      projectPath,
      yes: args.yes,
      dryRun: args.dryRun,
      fresh: args.fresh,
      provider: args.provider,
      whisper: args.whisper,
      analyzer: args.analyzer,
    });
    if (args.command === 'generate' || args.dryRun) return;
  }
  if (args.command === 'render' || args.command === 'all') {
    await renderProject({ projectPath, renderer: args.renderer });
  }
}

function workDirFor(projectPath: string): { slug: string; workDir: string } {
  const project = loadProject(projectPath);
  return { slug: project.slug, workDir: resolveWorkDir(project) };
}

function printTakes(projectPath: string): void {
  const { slug, workDir } = workDirFor(projectPath);
  const manifest = loadManifest(workDir, slug);
  const lines: string[] = [];
  for (const [shotId, entry] of Object.entries(manifest.shots)) {
    if (entry.takes.length === 0) {
      lines.push(`${shotId}  (no takes)`);
      continue;
    }
    for (const take of entry.takes) {
      const selected = entry.selected[take.kind as 'image' | 'video' | 'end'] === take.id ? '*' : ' ';
      lines.push(`${selected} ${shotId}  ${take.id}  ${take.provider}  ${take.path}`);
    }
  }
  for (const take of manifest.voice.takes) {
    const selected = manifest.voice.selected === take.id ? '*' : ' ';
    lines.push(`${selected} voice  ${take.id}  ${take.provider}  ${take.path}`);
  }
  if (lines.length === 0) {
    console.log(`No takes yet. Generate first. Looked in ${workDir}`);
    return;
  }
  console.log(lines.join('\n'));
}

function select(projectPath: string, shotId: string, takeId: string): void {
  const { slug, workDir } = workDirFor(projectPath);
  const manifest = loadManifest(workDir, slug);
  const next = selectTake(manifest, shotId, takeId);
  saveManifest(workDir, next);
  console.log(`Selected ${takeId} for ${shotId}.`);
}

main().catch((error: unknown) => {
  if (error instanceof ProjectError) {
    console.error('Invalid project file:');
    console.error(error.message);
  } else if (error instanceof StudioError || error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(String(error));
  }
  if (process.env.STUDIO_DEBUG && error instanceof Error) console.error(error.stack);
  process.exit(1);
});
