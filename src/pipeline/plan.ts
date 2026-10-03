import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { AudioAnalysis, WordTimingFile } from '../model/types.js';
import { buildCues } from '../audio/words.js';
import { buildTimeline } from '../audio/snap.js';
import type { RenderPlan } from '../model/plan.js';
import { frameSize } from '../project/dimensions.js';
import type { LoadedProject } from '../project/load.js';
import { StudioError } from '../util/ffmpeg.js';
import { loadManifest, selectedTake, type Manifest } from './manifest.js';
import { requireAsset } from './paths.js';

function colorFor(prompt: string): string {
  const hash = createHash('sha256').update(prompt).digest();
  const channel = (index: number) => 20 + (hash[index] % 80);
  return `#${[0, 1, 2].map((index) => channel(index).toString(16).padStart(2, '0')).join('')}`;
}

function copyIntoPublic(source: string, publicDir: string, publicFile: string): void {
  const destination = path.join(publicDir, publicFile);
  mkdirSync(path.dirname(destination), { recursive: true });
  copyFileSync(source, destination);
}

export function buildRenderPlan(project: LoadedProject, workDir: string): { plan: RenderPlan; publicDir: string } {
  const manifest = loadManifest(workDir, project.slug);
  const publicDir = path.join(workDir, 'public');
  mkdirSync(publicDir, { recursive: true });
  const size = frameSize(project.aspect);
  const beats = loadBeats(workDir, manifest, project);
  const timeline = buildTimeline(
    project.shots.map((shot) => ({ id: shot.id, duration: shot.duration })),
    beats,
    {
      snap: project.edit.snapCutsToBeats,
      windowSec: project.edit.snapWindowSec,
    },
  );

  const shots = project.shots.map((shot) => {
    const slot = timeline.shots.find((item) => item.id === shot.id);
    if (!slot) throw new StudioError(`Shot "${shot.id}" is missing from the timeline.`);
    const entry = manifest.shots[shot.id];
    if (!entry) {
      throw new StudioError(`Shot "${shot.id}" has not been generated. Run generate first.`);
    }
    const video = shot.kind === 'video' ? selectedTake(entry, 'video', workDir) : undefined;
    const image = selectedTake(entry, 'image', workDir);
    const take = video ?? image;
    if (!take) {
      throw new StudioError(`Shot "${shot.id}" has no generated media. Run generate first.`);
    }
    const extension = path.extname(take.path) || (take.kind === 'video' ? '.mp4' : '.png');
    const publicFile = path.join('shots', `${shot.id}${extension}`).split(path.sep).join('/');
    const sourcePath = path.join(workDir, take.path);
    copyIntoPublic(sourcePath, publicDir, publicFile);
    return {
      id: shot.id,
      kind: take.kind === 'video' ? ('video' as const) : ('image' as const),
      sourcePath,
      publicFile,
      start: slot.start,
      end: slot.end,
      camera: shot.camera,
      applyCamera: take.kind !== 'video',
      text: shot.text,
      color: colorFor(shot.prompt),
    };
  });

  const audio: RenderPlan['audio'] = [];
  const voiceWords = loadVoiceWords(workDir, manifest);
  if (project.voiceover && manifest.voice.selected) {
    const take = manifest.voice.takes.find((item) => item.id === manifest.voice.selected);
    if (take && existsSync(path.join(workDir, take.path))) {
      const publicFile = `audio/voice${path.extname(take.path) || '.wav'}`;
      const sourcePath = path.join(workDir, take.path);
      copyIntoPublic(sourcePath, publicDir, publicFile);
      audio.push({ sourcePath, publicFile, start: 0, volume: 1, role: 'voice' });
    }
  }
  if (project.music) {
    const sourcePath = requireAsset(project.file, project.music.file, 'Music file');
    const publicFile = `audio/music${path.extname(sourcePath) || '.wav'}`;
    copyIntoPublic(sourcePath, publicDir, publicFile);
    audio.push({ sourcePath, publicFile, start: 0, volume: project.music.volume, role: 'music' });
  }
  project.sfx.forEach((effect, index) => {
    const sourcePath = requireAsset(project.file, effect.file, 'SFX file');
    const publicFile = `audio/sfx-${index}${path.extname(sourcePath) || '.wav'}`;
    copyIntoPublic(sourcePath, publicDir, publicFile);
    audio.push({ sourcePath, publicFile, start: effect.at, volume: effect.volume, role: 'sfx' });
  });

  const durationSec = shots.length ? shots[shots.length - 1].end : 0;
  const plan: RenderPlan = {
    title: project.title,
    slug: project.slug,
    width: size.width,
    height: size.height,
    fps: project.fps,
    durationSec,
    captionStyle: project.captions.style,
    shots,
    cues: buildCues(shots, voiceWords, project.captions.style),
    audio,
  };
  writeFileSync(path.join(workDir, 'plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
  return { plan, publicDir };
}

function loadBeats(workDir: string, manifest: Manifest, project: LoadedProject): number[] {
  if (!project.edit.snapCutsToBeats) return [];
  const relative = manifest.analysis.music;
  if (!relative) {
    console.log('Beat snapping is on, but there is no music analysis yet. Cuts stay on the authored durations.');
    return [];
  }
  const file = path.join(workDir, relative);
  if (!existsSync(file)) return [];
  const analysis = JSON.parse(readFileSync(file, 'utf8')) as AudioAnalysis;
  return analysis.beats ?? [];
}

function loadVoiceWords(workDir: string, manifest: Manifest) {
  if (!manifest.voice.wordsPath) return null;
  const file = path.join(workDir, manifest.voice.wordsPath);
  if (!existsSync(file)) return null;
  const timing = JSON.parse(readFileSync(file, 'utf8')) as WordTimingFile;
  return timing.words ?? null;
}
