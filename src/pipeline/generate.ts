import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { WordTimingFile } from '../model/types.js';
import { analyzeMusicFile } from '../audio/analyze.js';
import { packageRoot } from '../util/root.js';
import { runCommand, StudioError } from '../util/ffmpeg.js';
import { sha256 } from '../util/hash.js';
import { frameSize } from '../project/dimensions.js';
import { loadProject, projectDuration, type LoadedProject } from '../project/load.js';
import type { Shot } from '../project/schema.js';
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
  shotEntry,
  type Manifest,
  type Take,
} from './manifest.js';
import { requireAsset } from './paths.js';

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

function imageHash(shot: Shot, provider: string, model: string, width: number, height: number): string {
  return sha256({
    prompt: shot.prompt,
    provider,
    model,
    width,
    height,
  });
}

function videoHash(
  shot: Shot,
  provider: string,
  model: string,
  width: number,
  height: number,
  fps: number,
): string {
  return sha256({
    prompt: shot.prompt,
    provider,
    model,
    width,
    height,
    fps,
    duration: shot.duration,
    mode: shot.videoMode ?? 'image-to-video',
    camera: provider === 'placeholder' ? shot.camera : null,
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
  const cache = emptyCache(project);

  for (const shot of project.shots) {
    const entry = shotEntry(manifest, shot.id);
    const mode = shot.videoMode ?? 'image-to-video';
    if (!options.fresh && (shot.kind === 'image' || (shot.kind === 'video' && mode !== 'text-to-video'))) {
      cache.images[shot.id] = Boolean(
        reusableTake(entry.takes, entry.selected.image, 'image', imageHash(shot, media.id, project.models.image, size.width, size.height), workDir),
      );
    }
    if (!options.fresh && shot.kind === 'video') {
      cache.videos[shot.id] = Boolean(
        reusableTake(
          entry.takes,
          entry.selected.video,
          'video',
          videoHash(shot, media.id, project.models.video, size.width, size.height, project.fps),
          workDir,
        ),
      );
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
  for (const shot of project.shots) {
    await generateShot({ project, shot, media, manifest, workDir, fresh: options.fresh, size });
    saveManifest(workDir, manifest);
  }
  if (project.voiceover && voice) {
    await generateVoice({ project, voice, manifest, workDir, fresh: options.fresh, whisper: options.whisper });
    saveManifest(workDir, manifest);
  }
  if (project.music) {
    const musicFile = requireAsset(project.file, project.music.file, 'Music file');
    const outFile = path.join(workDir, 'analysis', 'music.json');
    console.log(`Analyzing music (${options.analyzer})…`);
    await analyzeMusicFile(musicFile, outFile, options.analyzer);
    manifest.analysis.music = path.relative(workDir, outFile);
    saveManifest(workDir, manifest);
  }
  for (const effect of project.sfx) {
    requireAsset(project.file, effect.file, 'SFX file');
  }
  console.log(`Manifest: ${path.join(workDir, 'manifest.json')}`);
  return { project, estimate, workDir, manifest };
}

async function generateShot(input: {
  project: LoadedProject;
  shot: Shot;
  media: MediaProvider;
  manifest: Manifest;
  workDir: string;
  fresh: boolean;
  size: { width: number; height: number };
}): Promise<void> {
  const { project, shot, media, manifest, workDir, fresh, size } = input;
  const entry = shotEntry(manifest, shot.id);
  const mode = shot.videoMode ?? 'image-to-video';
  const needsImage = shot.kind === 'image' || (shot.kind === 'video' && mode !== 'text-to-video');
  let imageTake: Take | undefined;
  if (needsImage) {
    const hash = imageHash(shot, media.id, project.models.image, size.width, size.height);
    imageTake = fresh ? undefined : reusableTake(entry.takes, entry.selected.image, 'image', hash, workDir);
    if (imageTake) {
      console.log(`image ${shot.id} cached (${imageTake.id})`);
      entry.selected.image = imageTake.id;
    } else {
      const id = nextTakeId(entry.takes, 'image');
      const relative = path.join('shots', shot.id, `${id}.png`);
      const outPath = path.join(workDir, relative);
      console.log(`image ${shot.id} generating (${media.id}, ${project.models.image})…`);
      await media.generateImage({
        prompt: shot.prompt,
        width: size.width,
        height: size.height,
        aspect: project.aspect,
        model: project.models.image,
        outPath,
      });
      imageTake = {
        id,
        kind: 'image',
        inputHash: hash,
        provider: media.id,
        model: project.models.image,
        path: relative,
        createdAt: new Date().toISOString(),
        status: 'done',
      };
      addTake(entry, imageTake);
    }
  }

  if (shot.kind === 'video') {
    const hash = videoHash(shot, media.id, project.models.video, size.width, size.height, project.fps);
    const cached = fresh ? undefined : reusableTake(entry.takes, entry.selected.video, 'video', hash, workDir);
    if (cached) {
      console.log(`video ${shot.id} cached (${cached.id})`);
      entry.selected.video = cached.id;
      return;
    }
    const id = nextTakeId(entry.takes, 'video');
    const relative = path.join('shots', shot.id, `${id}.mp4`);
    const outPath = path.join(workDir, relative);
    console.log(`video ${shot.id} generating (${media.id}, ${project.models.video})…`);
    await media.generateVideo({
      prompt: shot.prompt,
      width: size.width,
      height: size.height,
      durationSec: shot.duration,
      fps: project.fps,
      model: project.models.video,
      mode,
      imagePath: imageTake ? path.join(workDir, imageTake.path) : undefined,
      camera: shot.camera,
      aspect: project.aspect,
      imageField: project.models.videoImageField,
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
  }
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
