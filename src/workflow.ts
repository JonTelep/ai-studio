import { copyFileSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { projectDuration, loadProject, type LoadedProject } from './project/load.js';
import { framePath } from './project/schema.js';
import { assertProjectName, layoutFor, resolveWorkDir } from './project/layout.js';
import { resolveMediaProvider, resolveVoiceProvider } from './providers/registry.js';
import { StudioError } from './util/ffmpeg.js';
import { writeContactSheet } from './pipeline/contact-sheet.js';
import { emptyCache, estimateFromCache, formatEstimate } from './pipeline/estimate.js';
import { generateProject } from './pipeline/generate.js';
import { loadManifest, selectedTake } from './pipeline/manifest.js';
import { collectReferenceFiles } from './pipeline/references.js';
import { requireAsset, resolveAssetsDir } from './pipeline/paths.js';
import { assertReadable, probeFrameSize } from './pipeline/probe.js';
import { renderProject } from './pipeline/render.js';
import { planShotMedia } from './pipeline/shot-media.js';
import { assertStillsReady } from './pipeline/stills.js';

const IMAGES_README = `# images

Drop your own photos and clips in this folder.

- Stills (\`.jpg\`, \`.png\`, \`.webp\`) can be a shot's \`image\`, \`start_image\`, or \`end_image\`.
- A clip (\`.mp4\`, \`.mov\`, \`.webm\`) can be a shot's \`video\`. It is trimmed to the shot duration.
- Reference stills for a style or a character go here too, then are named under \`references\` or \`reference_images\`.

Paths in \`project.yaml\` are looked up here when \`assets: images\` is set.

\`make images\` does not regenerate these files. \`make dry\` checks that every referenced file exists and prints its dimensions.
`;

function ideaTemplate(name: string): string {
  return `# ${name}

Describe the video in a few sentences. What happens, in order?

## Look

Aspect (9:16, 1:1, or 16:9), mood, and any words that should appear on screen.

## Photos

If you dropped files in \`images/\`, say which is which. To travel from one photo to another, name the first and the last.
`;
}

function starterYaml(name: string): string {
  return `# projects/${name}/project.yaml
# Edit this by hand, or describe the video in idea.md and run \`make script ${name}\`.
# provider: placeholder is free. fal spends FAL_KEY. Run \`make dry ${name}\` before images or prod.

title: ${name}
aspect: "16:9" # 9:16 | 1:1 | 16:9
fps: 30
provider: placeholder # placeholder | fal | auto
assets: images
# models:
#   image: fal-ai/flux/dev
#   video: bytedance/seedance-2.0/image-to-video
#   endImageField: end_image_url # Kling variants that want a tail image use tail_image_url
# references:
#   style: style.png
#   character: character.png
shots:
  - id: opening
    prompt: A starter still. Replace this prompt.
    duration: 4
    camera: ken-burns-in # static | ken-burns-in | ken-burns-out | pan-left | pan-right | slow-push
    # text: Words on screen
    # image: your-photo.jpg # use a file in images/ instead of generating
    # kind: video # animate the still, or generate image-to-video
    # video: your-clip.mp4 # use a clip as-is, trimmed to duration
    # reference_images:
    #   - character.png
    # start_image: first.jpg # or { prompt: A generated first frame }
    # end_image: last.jpg # the model fills the motion between the frames
    # start_from: previous # this shot begins on the previous shot's last frame
captions:
  style: clean # impact | clean | minimal
`;
}

export function scaffoldProject(name: string, root = 'projects'): string {
  assertProjectName(name);
  const dir = path.resolve(root, name);
  const projectFile = path.join(dir, 'project.yaml');
  if (existsSync(projectFile)) {
    throw new StudioError(`Project already exists: ${projectFile}`);
  }
  mkdirSync(path.join(dir, 'images'), { recursive: true });
  writeFileSync(projectFile, starterYaml(name));
  writeFileSync(path.join(dir, 'idea.md'), ideaTemplate(name));
  writeFileSync(path.join(dir, 'images', 'README.md'), IMAGES_README);
  console.log(`Created ${dir}`);
  console.log('Next: edit idea.md, drop photos in images/, then make script or make dry.');
  return projectFile;
}

export function validateProject(projectPath: string): LoadedProject {
  const project = loadProject(projectPath);
  const assetsDir = resolveAssetsDir(project.file, project.assets);
  for (const shot of project.shots) {
    if (shot.image) requireAsset(project.file, shot.image, `Image for shot "${shot.id}"`, assetsDir);
    if (shot.video) requireAsset(project.file, shot.video, `Video for shot "${shot.id}"`, assetsDir);
    const start = framePath(shot.start_image);
    const end = framePath(shot.end_image);
    if (start) requireAsset(project.file, start, `Start image for shot "${shot.id}"`, assetsDir);
    if (end) requireAsset(project.file, end, `End image for shot "${shot.id}"`, assetsDir);
    collectReferenceFiles(project, shot, assetsDir);
  }
  if (project.music) requireAsset(project.file, project.music.file, 'Music file', assetsDir);
  for (const effect of project.sfx) requireAsset(project.file, effect.file, 'SFX file', assetsDir);
  console.log(
    `Valid: ${project.title} — ${project.shots.length} shot${project.shots.length === 1 ? '' : 's'} — ${projectDuration(project).toFixed(1)}s`,
  );
  return project;
}

export async function describeReferencedMedia(project: LoadedProject): Promise<void> {
  const assetsDir = resolveAssetsDir(project.file, project.assets);
  const rows: { label: string; file: string; visual: boolean }[] = [];
  const push = (label: string, relative: string | undefined, visual: boolean) => {
    if (!relative) return;
    rows.push({
      label,
      file: requireAsset(project.file, relative, label, assetsDir),
      visual,
    });
  };
  for (const shot of project.shots) {
    push(`Shot "${shot.id}" image`, shot.image, true);
    push(`Shot "${shot.id}" video`, shot.video, true);
    push(`Shot "${shot.id}" start image`, framePath(shot.start_image), true);
    push(`Shot "${shot.id}" end image`, framePath(shot.end_image), true);
    for (const file of collectReferenceFiles(project, shot, assetsDir)) {
      rows.push({ label: `Reference ${path.basename(file)}`, file, visual: true });
    }
  }
  if (project.music) push('Music', project.music.file, false);
  for (const effect of project.sfx) push('SFX', effect.file, false);
  if (rows.length === 0) {
    console.log('No supplied media.');
    return;
  }
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.file)) continue;
    seen.add(row.file);
    if (!row.visual) {
      assertReadable(row.file, row.label);
      console.log(`${row.label}: ${path.basename(row.file)} (readable)`);
      continue;
    }
    const size = await probeFrameSize(row.file, row.label);
    console.log(`${row.label}: ${path.basename(row.file)} ${size.width}x${size.height}`);
  }
}

function printPaidBreakdown(project: LoadedProject): void {
  const media = resolveMediaProvider(project);
  const voice = resolveVoiceProvider(project);
  const fresh = emptyCache(project);
  const actual = estimateFromCache(project, fresh, {
    mediaPaid: media.paid,
    voicePaid: Boolean(voice?.paid),
    mediaProvider: media.id,
    voiceProvider: voice?.id ?? null,
  });
  console.log('\nPaid-call count for this project (nothing further was called):');
  console.log(formatEstimate(actual, project.title));
  console.log('make images and make prod skip takes that are already finished.');
  if (media.id !== 'fal') {
    const fal = estimateFromCache(project, fresh, {
      mediaPaid: true,
      voicePaid: voice?.id === 'elevenlabs',
      mediaProvider: 'fal',
      voiceProvider: voice?.id ?? null,
    });
    console.log('\nIf provider were fal, stills and video would be billed like this (nothing was called):');
    console.log(formatEstimate(fal, project.title));
  }
}

export async function dryProject(projectPath: string): Promise<string> {
  const project = validateProject(projectPath);
  await describeReferencedMedia(project);
  const media = resolveMediaProvider(project);
  const layout = layoutFor(project.file);
  let output: string;
  if (media.paid) {
    const previewRoot = mkdtempSync(path.join(tmpdir(), 'studio-preview-'));
    await generateProject({
      projectPath,
      yes: true,
      dryRun: false,
      fresh: false,
      provider: 'placeholder',
      whisper: false,
      analyzer: 'energy',
      workRoot: previewRoot,
    });
    output = await renderProject({
      projectPath,
      renderer: 'ffmpeg',
      workRoot: previewRoot,
      publish: false,
    });
    mkdirSync(layout.dir, { recursive: true });
    copyFileSync(output, layout.previewFile);
    output = layout.previewFile;
    console.log(`Placeholder preview: ${output}`);
    console.log('The project work directory was not changed.');
  } else {
    await generateProject({
      projectPath,
      yes: true,
      dryRun: false,
      fresh: false,
      provider: 'placeholder',
      whisper: false,
      analyzer: 'energy',
    });
    output = await renderProject({ projectPath, renderer: 'ffmpeg' });
  }
  printPaidBreakdown(project);
  return output;
}

export async function imagesProject(projectPath: string): Promise<void> {
  const project = validateProject(projectPath);
  const result = await generateProject({
    projectPath,
    yes: false,
    dryRun: false,
    fresh: false,
    whisper: false,
    analyzer: 'energy',
    scope: 'images',
  });
  const layout = layoutFor(project.file);
  await writeContactSheet(project, result.workDir, layout.contactSheet);
}

export async function prodProject(
  projectPath: string,
  renderer: 'remotion' | 'ffmpeg',
): Promise<string> {
  const project = validateProject(projectPath);
  assertStillsReady(project, resolveWorkDir(project));
  await generateProject({
    projectPath,
    yes: false,
    dryRun: false,
    fresh: false,
    whisper: false,
    analyzer: 'energy',
    scope: 'videos',
  });
  return renderProject({ projectPath, renderer });
}

export function chooseRedoStage(
  project: LoadedProject,
  shotId: string,
  requested?: 'image' | 'video',
): 'image' | 'video' {
  const shot = project.shots.find((item) => item.id === shotId);
  if (!shot) throw new StudioError(`Shot "${shotId}" is not in the project.`);
  const plan = planShotMedia(shot);
  const stage = requested ?? inferStage(project, shotId);
  if (stage === 'image') {
    const can =
      plan.generateImage ||
      plan.start?.type === 'generate' ||
      plan.end?.type === 'generate' ||
      plan.source === 'image' ||
      plan.start?.type === 'file' ||
      plan.end?.type === 'file';
    if (!can) throw new StudioError(`Shot "${shotId}" has no still to redo.`);
  }
  if (stage === 'video' && !plan.generateVideo && plan.source !== 'video') {
    throw new StudioError(`Shot "${shotId}" has no video to redo.`);
  }
  return stage;
}

function inferStage(project: LoadedProject, shotId: string): 'image' | 'video' {
  const manifest = loadManifest(resolveWorkDir(project), project.slug);
  const entry = manifest.shots[shotId];
  const video = entry && selectedTake(entry, 'video', resolveWorkDir(project));
  return video ? 'video' : 'image';
}

export async function redoShot(
  projectPath: string,
  shotId: string,
  requested?: 'image' | 'video',
): Promise<void> {
  const project = validateProject(projectPath);
  const stage = chooseRedoStage(project, shotId, requested);
  console.log(`Redo ${shotId} ${stage}.`);
  await generateProject({
    projectPath,
    yes: false,
    dryRun: false,
    fresh: false,
    whisper: false,
    analyzer: 'energy',
    scope: stage === 'image' ? 'images' : 'videos',
    onlyShot: shotId,
    freshImages: stage === 'image',
    freshVideos: stage === 'video',
  });
  if (stage === 'image') {
    const layout = layoutFor(project.file);
    await writeContactSheet(project, resolveWorkDir(project), layout.contactSheet);
  }
}
