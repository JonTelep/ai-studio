import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { WordTimingFile } from '../model/types.js';
import { analyzeMusicFile } from '../audio/analyze.js';
import { packageRoot } from '../util/root.js';
import { runCommand, StudioError } from '../util/ffmpeg.js';
import { sha256 } from '../util/hash.js';
import { frameSize } from '../project/dimensions.js';
import { loadProject, projectDuration, type LoadedProject } from '../project/load.js';
import { framePath, framePrompt, type Shot } from '../project/schema.js';
import { resolveMediaProvider, resolveVoiceProvider } from '../providers/registry.js';
import type { MediaProvider, VoiceProvider } from '../providers/types.js';
import { confirmPaid } from './confirm.js';
import { emptyCache, estimateFromCache, formatEstimate, type Estimate } from './estimate.js';
import {
  addTake,
  loadManifest,
  nextTakeId,
  reusableTake,
  saveManifest,
  selectedTake,
  shotEntry,
  type Manifest,
  type ShotEntry,
  type Take,
} from './manifest.js';
import { extractLastFrame, fitStill, trimClip } from './import-media.js';
import { planShotMedia, type ShotMediaPlan } from './shot-media.js';
import { fileStamp, requireAsset, resolveAssetsDir } from './paths.js';
import { collectReferenceFiles } from './references.js';

export type GenerateOptions = {
  projectPath: string;
  yes: boolean;
  dryRun: boolean;
  fresh: boolean;
  provider?: string;
  whisper: boolean;
  analyzer: 'energy' | 'python';
  workRoot?: string;
};

export type GenerateResult = {
  project: LoadedProject;
  estimate: Estimate;
  workDir: string;
  manifest: Manifest;
};

function imageHash(
  shot: Shot,
  provider: string,
  model: string,
  width: number,
  height: number,
  references: string[],
): string {
  return sha256({
    prompt: shot.prompt ?? '',
    provider,
    model,
    width,
    height,
    references,
  });
}

function videoHash(
  shot: Shot,
  provider: string,
  model: string,
  width: number,
  height: number,
  fps: number,
  references: string[],
  imageStamp: string | null,
  endStamp: string | null,
): string {
  return sha256({
    prompt: shot.prompt ?? '',
    provider,
    model,
    width,
    height,
    fps,
    duration: shot.duration,
    mode:
      shot.image || shot.start_image || shot.start_from || shot.end_image
        ? 'image-to-video'
        : (shot.videoMode ?? 'image-to-video'),
    camera: provider === 'placeholder' && !shot.end_image ? shot.camera : null,
    references,
    imageStamp,
    endStamp,
    startPrompt: framePrompt(shot.start_image) ?? null,
    endPrompt: framePrompt(shot.end_image) ?? null,
  });
}

function suppliedImageHash(
  file: string,
  width: number,
  height: number,
  role: 'still' | 'start' | 'end' = 'still',
): string {
  return sha256({ source: 'file', kind: 'image', role, stamp: fileStamp(file), width, height });
}

function frameImageHash(
  prompt: string,
  provider: string,
  model: string,
  width: number,
  height: number,
  references: string[],
  role: 'start' | 'end',
): string {
  return sha256({ prompt, provider, model, width, height, references, role });
}

type ShotFiles = {
  image?: string;
  video?: string;
  start?: string;
  end?: string;
};

function imageCacheHash(
  shot: Shot,
  plan: ShotMediaPlan,
  files: ShotFiles,
  provider: string,
  model: string,
  width: number,
  height: number,
  references: string[],
): string | null {
  if (plan.source === 'interpolate' || (plan.start?.type === 'generate' && plan.generateImage)) {
    if (plan.start?.type === 'generate') {
      return frameImageHash(framePrompt(shot.start_image) ?? '', provider, model, width, height, references, 'start');
    }
    if (plan.start?.type === 'file') {
      const file = files.start ?? files.image;
      return file ? suppliedImageHash(file, width, height, 'start') : null;
    }
    return null;
  }
  if (plan.generateImage) return imageHash(shot, provider, model, width, height, references);
  if (plan.source === 'image') {
    const file = files.image ?? files.start;
    return file ? suppliedImageHash(file, width, height, 'still') : null;
  }
  return null;
}

function endCacheHash(
  shot: Shot,
  plan: ShotMediaPlan,
  files: ShotFiles,
  provider: string,
  model: string,
  width: number,
  height: number,
  references: string[],
): string | null {
  if (plan.end?.type === 'generate') {
    return frameImageHash(framePrompt(shot.end_image) ?? '', provider, model, width, height, references, 'end');
  }
  if (plan.end?.type === 'file' && files.end) return suppliedImageHash(files.end, width, height, 'end');
  return null;
}

function videoStamps(
  plan: ShotMediaPlan,
  files: ShotFiles,
  previousStamp: string | null,
): { imageStamp: string | null; endStamp: string | null } {
  let imageStamp: string | null = null;
  if (plan.start?.type === 'previous') imageStamp = previousStamp;
  else if (plan.source === 'interpolate' && plan.start?.type === 'file') {
    const file = files.start ?? files.image;
    imageStamp = file ? fileStamp(file) : null;
  } else if (plan.source === 'image' || files.image) {
    const file = files.image ?? files.start;
    imageStamp = file ? fileStamp(file) : null;
  }
  const endStamp = plan.end?.type === 'file' && files.end ? fileStamp(files.end) : null;
  return { imageStamp, endStamp };
}

function lastFrameStamp(manifest: Manifest, shot: Shot | undefined, workDir: string): string | null {
  if (!shot) return null;
  const entry = manifest.shots[shot.id];
  if (!entry) return null;
  if (entry.lastFrame && existsSync(path.join(workDir, entry.lastFrame))) {
    return fileStamp(path.join(workDir, entry.lastFrame));
  }
  const plan = planShotMedia(shot);
  if (!plan.generateVideo && plan.source !== 'video') {
    const image = selectedTake(entry, 'image', workDir);
    if (image) return fileStamp(path.join(workDir, image.path));
  }
  return null;
}

function suppliedVideoHash(file: string, shot: Shot, width: number, height: number, fps: number): string {
  return sha256({
    source: 'file',
    kind: 'video',
    stamp: fileStamp(file),
    duration: shot.duration,
    width,
    height,
    fps,
  });
}

function voiceHash(
  project: LoadedProject,
  provider: string,
  model: string,
  voiceId: string,
): string {
  return sha256({
    script: project.voiceover?.script,
    provider,
    model,
    voiceId,
    duration: projectDuration(project),
    shots: project.shots.map((shot) => ({
      id: shot.id,
      duration: shot.duration,
      text: shot.text ?? null,
    })),
  });
}

export async function generateProject(options: GenerateOptions): Promise<GenerateResult> {
  const project = loadProject(options.projectPath);
  if (options.provider) {
    if (!['placeholder', 'fal', 'auto'].includes(options.provider)) {
      throw new StudioError(`Unknown provider "${options.provider}". Use placeholder, fal, or auto.`);
    }
    project.provider = options.provider as LoadedProject['provider'];
  }
  const workDir = path.resolve(options.workRoot ?? 'work', project.slug);
  const manifest = loadManifest(workDir, project.slug);
  const media = resolveMediaProvider(project);
  const voice = resolveVoiceProvider(project);
  const size = frameSize(project.aspect);
  const assetsDir = resolveAssetsDir(project.file, project.assets);
  const cache = emptyCache(project);
  const shotFiles = new Map<string, ShotFiles>();
  let previousUnstable = options.fresh;

  for (let index = 0; index < project.shots.length; index += 1) {
    const shot = project.shots[index];
    const files = collectShotFiles(project, shot, assetsDir);
    const references = collectReferenceFiles(project, shot, assetsDir).map(fileStamp);
    shotFiles.set(shot.id, files);
    const entry = shotEntry(manifest, shot.id);
    const mediaPlan = planShotMedia(shot);
    const imageHashValue = imageCacheHash(
      shot,
      mediaPlan,
      files,
      media.id,
      project.models.image,
      size.width,
      size.height,
      references,
    );
    if (!options.fresh && imageHashValue) {
      cache.images[shot.id] = Boolean(
        reusableTake(entry.takes, entry.selected.image, 'image', imageHashValue, workDir),
      );
    }
    const endHashValue = endCacheHash(
      shot,
      mediaPlan,
      files,
      media.id,
      project.models.image,
      size.width,
      size.height,
      references,
    );
    if (!options.fresh && endHashValue) {
      cache.ends[shot.id] = Boolean(reusableTake(entry.takes, entry.selected.end, 'end', endHashValue, workDir));
    }
    const previousStamp =
      !options.fresh && !previousUnstable ? lastFrameStamp(manifest, project.shots[index - 1], workDir) : null;
    let videoHit = false;
    if (!options.fresh && (mediaPlan.generateVideo || mediaPlan.source === 'video')) {
      if (mediaPlan.source === 'video' && files.video) {
        const hash = suppliedVideoHash(files.video, shot, size.width, size.height, project.fps);
        videoHit = Boolean(reusableTake(entry.takes, entry.selected.video, 'video', hash, workDir));
      } else if (mediaPlan.start?.type !== 'previous' || previousStamp) {
        const stamps = videoStamps(mediaPlan, files, previousStamp);
        const hash = videoHash(
          shot,
          media.id,
          project.models.video,
          size.width,
          size.height,
          project.fps,
          references,
          stamps.imageStamp,
          stamps.endStamp,
        );
        videoHit = Boolean(reusableTake(entry.takes, entry.selected.video, 'video', hash, workDir));
      }
      cache.videos[shot.id] = videoHit;
    }
    const playsVideo = mediaPlan.generateVideo || mediaPlan.source === 'video';
    if (playsVideo) {
      const lastReady = Boolean(entry.lastFrame && existsSync(path.join(workDir, entry.lastFrame)));
      previousUnstable = !videoHit || !lastReady;
    } else if (imageHashValue) {
      previousUnstable = !cache.images[shot.id];
    } else {
      previousUnstable = true;
    }
  }
  if (!options.fresh && project.voiceover && voice) {
    const model = project.voiceover.model ?? project.models.voice;
    cache.voice = Boolean(
      reusableTake(
        manifest.voice.takes,
        manifest.voice.selected ?? undefined,
        'voice',
        voiceHash(project, voice.id, model, project.voiceover.voiceId),
        workDir,
      ),
    );
  }

  const estimate = estimateFromCache(project, cache, {
    mediaPaid: media.paid,
    voicePaid: Boolean(voice?.paid),
    mediaProvider: media.id,
    voiceProvider: voice?.id ?? null,
  });
  console.log(formatEstimate(estimate, `${project.title} — ${project.aspect} — ${project.fps} fps — ${project.shots.length} shots — ${projectDuration(project).toFixed(1)}s`));
  if (options.dryRun) {
    console.log('Dry run. No files were written and no providers were called.');
    return { project, estimate, workDir, manifest };
  }
  await confirmPaid(estimate.paid, options.yes);

  mkdirSync(workDir, { recursive: true });
  for (let index = 0; index < project.shots.length; index += 1) {
    const shot = project.shots[index];
    const files = shotFiles.get(shot.id) ?? collectShotFiles(project, shot, assetsDir);
    await generateShot({
      project,
      shot,
      index,
      media,
      manifest,
      workDir,
      fresh: options.fresh,
      size,
      assetsDir,
      files,
    });
    saveManifest(workDir, manifest);
  }
  if (project.voiceover && voice) {
    await generateVoice({ project, voice, manifest, workDir, fresh: options.fresh, whisper: options.whisper });
    saveManifest(workDir, manifest);
  }
  if (project.music) {
    const musicFile = requireAsset(project.file, project.music.file, 'Music file', assetsDir);
    const outFile = path.join(workDir, 'analysis', 'music.json');
    console.log(`Analyzing music (${options.analyzer})…`);
    await analyzeMusicFile(musicFile, outFile, options.analyzer);
    manifest.analysis.music = path.relative(workDir, outFile);
    saveManifest(workDir, manifest);
  }
  for (const effect of project.sfx) {
    requireAsset(project.file, effect.file, 'SFX file', assetsDir);
  }
  console.log(`Manifest: ${path.join(workDir, 'manifest.json')}`);
  return { project, estimate, workDir, manifest };
}

function collectShotFiles(project: LoadedProject, shot: Shot, assetsDir: string | undefined): ShotFiles {
  const startRel = framePath(shot.start_image);
  const endRel = framePath(shot.end_image);
  return {
    image: shot.image ? requireAsset(project.file, shot.image, `Image for shot "${shot.id}"`, assetsDir) : undefined,
    video: shot.video ? requireAsset(project.file, shot.video, `Video for shot "${shot.id}"`, assetsDir) : undefined,
    start: startRel ? requireAsset(project.file, startRel, `Start image for shot "${shot.id}"`, assetsDir) : undefined,
    end: endRel ? requireAsset(project.file, endRel, `End image for shot "${shot.id}"`, assetsDir) : undefined,
  };
}

async function generateShot(input: {
  project: LoadedProject;
  shot: Shot;
  index: number;
  media: MediaProvider;
  manifest: Manifest;
  workDir: string;
  fresh: boolean;
  size: { width: number; height: number };
  assetsDir?: string;
  files: ShotFiles;
}): Promise<void> {
  const { project, shot, index, media, manifest, workDir, fresh, size, assetsDir, files } = input;
  const entry = shotEntry(manifest, shot.id);
  const mediaPlan = planShotMedia(shot);
  const referenceFiles = collectReferenceFiles(project, shot, assetsDir);
  const referenceStamps = referenceFiles.map(fileStamp);
  let imageTake: Take | undefined;
  let startAbsolute: string | undefined;

  if (mediaPlan.source === 'video' && files.video) {
    const hash = suppliedVideoHash(files.video, shot, size.width, size.height, project.fps);
    const cached = fresh ? undefined : reusableTake(entry.takes, entry.selected.video, 'video', hash, workDir);
    if (cached) {
      console.log(`video ${shot.id} cached (${cached.id})`);
      entry.selected.video = cached.id;
      await rememberLastFrame(entry, workDir, shot.id, cached.path, true);
      return;
    }
    const id = nextTakeId(entry.takes, 'video');
    const relative = path.join('shots', shot.id, `${id}.mp4`);
    console.log(`video ${shot.id} using ${shot.video} (trimmed to ${shot.duration}s)`);
    await trimClip(files.video, path.join(workDir, relative), shot.duration, project.fps, size.width, size.height);
    addTake(entry, suppliedTake(id, 'video', hash, relative));
    await rememberLastFrame(entry, workDir, shot.id, relative, false);
    return;
  }

  if (mediaPlan.source === 'interpolate' && mediaPlan.start?.type === 'previous') {
    const previous = project.shots[index - 1];
    const previousEntry = previous ? manifest.shots[previous.id] : undefined;
    const relative = previousEntry?.lastFrame;
    if (!previous || !relative || !existsSync(path.join(workDir, relative))) {
      throw new StudioError(
        `Shot "${shot.id}" uses start_from: previous, but ${previous ? `shot "${previous.id}"` : 'the previous shot'} has no last frame yet.`,
      );
    }
    startAbsolute = path.join(workDir, relative);
    console.log(`video ${shot.id} start from ${previous.id} last frame`);
  } else if (mediaPlan.source === 'interpolate' && mediaPlan.start?.type === 'file') {
    const file = files.start ?? files.image;
    if (!file) throw new StudioError(`Shot "${shot.id}" is missing its start image.`);
    imageTake = await importStill({
      entry,
      workDir,
      fresh,
      shotId: shot.id,
      source: file,
      label: framePath(shot.start_image) ?? shot.image ?? file,
      hash: suppliedImageHash(file, size.width, size.height, 'start'),
      width: size.width,
      height: size.height,
    });
    startAbsolute = path.join(workDir, imageTake.path);
  } else if (mediaPlan.source === 'interpolate' && mediaPlan.start?.type === 'generate') {
    imageTake = await generateStill({
      entry,
      workDir,
      fresh,
      shot,
      media,
      project,
      referenceFiles,
      hash: frameImageHash(
        framePrompt(shot.start_image) ?? '',
        media.id,
        project.models.image,
        size.width,
        size.height,
        referenceStamps,
        'start',
      ),
      prompt: framePrompt(shot.start_image) ?? '',
      kind: 'image',
      width: size.width,
      height: size.height,
    });
    startAbsolute = path.join(workDir, imageTake.path);
  } else if (mediaPlan.source === 'image') {
    const file = files.image ?? files.start;
    if (!file) throw new StudioError(`Shot "${shot.id}" is missing its still.`);
    imageTake = await importStill({
      entry,
      workDir,
      fresh,
      shotId: shot.id,
      source: file,
      label: shot.image ?? framePath(shot.start_image) ?? file,
      hash: suppliedImageHash(file, size.width, size.height, 'still'),
      width: size.width,
      height: size.height,
    });
  } else if (mediaPlan.generateImage) {
    const nested = framePrompt(shot.start_image);
    const hash = nested
      ? frameImageHash(nested, media.id, project.models.image, size.width, size.height, referenceStamps, 'start')
      : imageHash(shot, media.id, project.models.image, size.width, size.height, referenceStamps);
    imageTake = await generateStill({
      entry,
      workDir,
      fresh,
      shot,
      media,
      project,
      referenceFiles,
      hash,
      prompt: nested ?? shot.prompt ?? '',
      kind: 'image',
      width: size.width,
      height: size.height,
    });
    startAbsolute = path.join(workDir, imageTake.path);
  }

  let endAbsolute: string | undefined;
  if (mediaPlan.end?.type === 'file' && files.end) {
    const endTake = await importStill({
      entry,
      workDir,
      fresh,
      shotId: shot.id,
      source: files.end,
      label: framePath(shot.end_image) ?? files.end,
      hash: suppliedImageHash(files.end, size.width, size.height, 'end'),
      width: size.width,
      height: size.height,
      kind: 'end',
    });
    endAbsolute = path.join(workDir, endTake.path);
  } else if (mediaPlan.end?.type === 'generate') {
    const endTake = await generateStill({
      entry,
      workDir,
      fresh,
      shot,
      media,
      project,
      referenceFiles,
      hash: frameImageHash(
        framePrompt(shot.end_image) ?? '',
        media.id,
        project.models.image,
        size.width,
        size.height,
        referenceStamps,
        'end',
      ),
      prompt: framePrompt(shot.end_image) ?? '',
      kind: 'end',
      width: size.width,
      height: size.height,
    });
    endAbsolute = path.join(workDir, endTake.path);
  }

  if (!mediaPlan.generateVideo) {
    if (imageTake) entry.lastFrame = imageTake.path;
    return;
  }

  const previousStamp = mediaPlan.start?.type === 'previous' && startAbsolute ? fileStamp(startAbsolute) : null;
  const stamps = videoStamps(mediaPlan, files, previousStamp);
  const hash = videoHash(
    shot,
    media.id,
    project.models.video,
    size.width,
    size.height,
    project.fps,
    referenceStamps,
    stamps.imageStamp,
    stamps.endStamp,
  );
  const cached = fresh ? undefined : reusableTake(entry.takes, entry.selected.video, 'video', hash, workDir);
  if (cached) {
    console.log(`video ${shot.id} cached (${cached.id})`);
    entry.selected.video = cached.id;
    await rememberLastFrame(entry, workDir, shot.id, cached.path, true);
    return;
  }
  const id = nextTakeId(entry.takes, 'video');
  const relative = path.join('shots', shot.id, `${id}.mp4`);
  const outPath = path.join(workDir, relative);
  console.log(`video ${shot.id} generating (${media.id}, ${project.models.video})…`);
  if (referenceFiles.length) console.log(`  references: ${referenceFiles.map((file) => path.basename(file)).join(', ')}`);
  if (endAbsolute) console.log(`  end frame: ${framePath(shot.end_image) ?? 'generated still'}`);
  await media.generateVideo({
    prompt: shot.prompt ?? '',
    width: size.width,
    height: size.height,
    durationSec: shot.duration,
    fps: project.fps,
    model: project.models.video,
    mode: startAbsolute || imageTake ? 'image-to-video' : (shot.videoMode ?? 'image-to-video'),
    imagePath: startAbsolute ?? (imageTake ? path.join(workDir, imageTake.path) : undefined),
    endImagePath: endAbsolute,
    camera: shot.camera,
    aspect: project.aspect,
    imageField: project.models.videoImageField,
    endImageField: project.models.endImageField,
    referenceImages: referenceFiles,
    referenceImageField: project.models.referenceImageField,
    outPath,
  });
  addTake(entry, {
    id,
    kind: 'video',
    inputHash: hash,
    provider: media.id,
    model: project.models.video,
    path: relative,
    createdAt: new Date().toISOString(),
    status: 'done',
  });
  await rememberLastFrame(entry, workDir, shot.id, relative, false);
}

async function importStill(input: {
  entry: ShotEntry;
  workDir: string;
  fresh: boolean;
  shotId: string;
  source: string;
  label: string;
  hash: string;
  width: number;
  height: number;
  kind?: 'image' | 'end';
}): Promise<Take> {
  const kind = input.kind ?? 'image';
  const cached = input.fresh
    ? undefined
    : reusableTake(input.entry.takes, input.entry.selected[kind], kind, input.hash, input.workDir);
  if (cached) {
    console.log(`${kind} ${input.shotId} cached (${cached.id})`);
    input.entry.selected[kind] = cached.id;
    return cached;
  }
  const id = nextTakeId(input.entry.takes, kind);
  const relative = path.join('shots', input.shotId, `${id}.png`);
  console.log(`${kind} ${input.shotId} using ${input.label}`);
  await fitStill(input.source, path.join(input.workDir, relative), input.width, input.height);
  const take = suppliedTake(id, kind, input.hash, relative);
  addTake(input.entry, take);
  return take;
}

async function generateStill(input: {
  entry: ShotEntry;
  workDir: string;
  fresh: boolean;
  shot: Shot;
  media: MediaProvider;
  project: LoadedProject;
  referenceFiles: string[];
  hash: string;
  prompt: string;
  kind: 'image' | 'end';
  width: number;
  height: number;
}): Promise<Take> {
  const cached = input.fresh
    ? undefined
    : reusableTake(input.entry.takes, input.entry.selected[input.kind], input.kind, input.hash, input.workDir);
  if (cached) {
    console.log(`${input.kind} ${input.shot.id} cached (${cached.id})`);
    input.entry.selected[input.kind] = cached.id;
    return cached;
  }
  const id = nextTakeId(input.entry.takes, input.kind);
  const relative = path.join('shots', input.shot.id, `${id}.png`);
  console.log(`${input.kind} ${input.shot.id} generating (${input.media.id}, ${input.project.models.image})…`);
  if (input.referenceFiles.length) {
    console.log(`  references: ${input.referenceFiles.map((file) => path.basename(file)).join(', ')}`);
  }
  await input.media.generateImage({
    prompt: input.prompt,
    width: input.width,
    height: input.height,
    aspect: input.project.aspect,
    model: input.project.models.image,
    referenceImages: input.referenceFiles,
    referenceImageField: input.project.models.referenceImageField,
    outPath: path.join(input.workDir, relative),
  });
  const take: Take = {
    id,
    kind: input.kind,
    inputHash: input.hash,
    provider: input.media.id,
    model: input.project.models.image,
    path: relative,
    createdAt: new Date().toISOString(),
    status: 'done',
  };
  addTake(input.entry, take);
  return take;
}

async function rememberLastFrame(
  entry: ShotEntry,
  workDir: string,
  shotId: string,
  videoRelative: string,
  reuseExisting: boolean,
): Promise<void> {
  const relative = path.join('shots', shotId, 'last.png');
  const out = path.join(workDir, relative);
  if (!(reuseExisting && existsSync(out))) {
    await extractLastFrame(path.join(workDir, videoRelative), out);
  }
  entry.lastFrame = relative;
}

function suppliedTake(id: string, kind: 'image' | 'video' | 'end', hash: string, relative: string): Take {
  return {
    id,
    kind,
    inputHash: hash,
    provider: 'file',
    model: 'supplied',
    path: relative,
    createdAt: new Date().toISOString(),
    status: 'done',
  };
}

async function generateVoice(input: {
  project: LoadedProject;
  voice: VoiceProvider;
  manifest: Manifest;
  workDir: string;
  fresh: boolean;
  whisper: boolean;
}): Promise<void> {
  const { project, voice, manifest, workDir, fresh, whisper } = input;
  const voiceover = project.voiceover;
  if (!voiceover) return;
  const model = voiceover.model ?? project.models.voice;
  const hash = voiceHash(project, voice.id, model, voiceover.voiceId);
  const cached = fresh
    ? undefined
    : reusableTake(manifest.voice.takes, manifest.voice.selected ?? undefined, 'voice', hash, workDir);
  const duration = projectDuration(project);
  const shots = timelineSlots(project);
  let audioRelative: string;
  let words = null as WordTimingFile['words'] | null;
  let source: WordTimingFile['source'] = voice.id === 'elevenlabs' ? 'elevenlabs' : 'placeholder';

  if (cached && !whisper) {
    console.log(`voice cached (${cached.id})`);
    manifest.voice.selected = cached.id;
    return;
  }

  if (cached && whisper) {
    audioRelative = cached.path;
    manifest.voice.selected = cached.id;
  } else {
    const id = nextTakeId(manifest.voice.takes, 'voice');
    const extension = voice.id === 'elevenlabs' ? 'mp3' : 'wav';
    audioRelative = path.join('voice', `${id}.${extension}`);
    console.log(`voice generating (${voice.id})…`);
    const result = await voice.synthesize({
      script: voiceover.script,
      voiceId: voiceover.voiceId,
      model,
      durationSec: duration,
      shots,
      outPath: path.join(workDir, audioRelative),
    });
    words = result.words;
    source = voice.id === 'elevenlabs' ? 'elevenlabs' : 'placeholder';
    const take: Take = {
      id,
      kind: 'voice',
      inputHash: hash,
      provider: voice.id,
      model,
      path: audioRelative,
      createdAt: new Date().toISOString(),
      status: 'done',
    };
    manifest.voice.takes.push(take);
    manifest.voice.selected = id;
  }

  if (whisper) {
    const script = path.join(packageRoot(), 'python', 'whisper_words.py');
    const wordsPath = path.join(workDir, 'voice', 'words.json');
    mkdirSync(path.dirname(wordsPath), { recursive: true });
    try {
      await runCommand('python3', [script, path.join(workDir, audioRelative), wordsPath]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new StudioError(
        `${message}\nLocal Whisper is optional. Install it with: pip install openai-whisper\nThen re-run with --whisper.`,
      );
    }
    manifest.voice.wordsPath = path.relative(workDir, wordsPath);
    return;
  }

  if (words) {
    const wordsRelative = path.join('voice', 'words.json');
    const timing: WordTimingFile = { source, words };
    mkdirSync(path.join(workDir, 'voice'), { recursive: true });
    writeFileSync(path.join(workDir, wordsRelative), `${JSON.stringify(timing, null, 2)}\n`);
    manifest.voice.wordsPath = wordsRelative;
  }
}

function timelineSlots(project: LoadedProject): { start: number; end: number; text?: string }[] {
  let cursor = 0;
  return project.shots.map((shot) => {
    const start = cursor;
    cursor += shot.duration;
    return { start, end: cursor, text: shot.text };
  });
}
