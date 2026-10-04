import type { Camera, CaptionStyle } from './types.js';
import type { CaptionCue } from '../audio/words.js';
import { cameraTransform, cueAt, shotAt } from '../composition/visual.js';

export type PlanShot = {
  id: string;
  kind: 'image' | 'video';
  sourcePath: string;
  publicFile: string;
  start: number;
  end: number;
  camera: Camera;
  applyCamera: boolean;
  text?: string;
  color: string;
};

export type PlanAudio = {
  sourcePath: string;
  publicFile: string;
  start: number;
  volume: number;
  role: 'voice' | 'music' | 'sfx';
};

export type RenderPlan = {
  title: string;
  slug: string;
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  captionStyle: CaptionStyle;
  shots: PlanShot[];
  cues: CaptionCue[];
  audio: PlanAudio[];
};

export function visualAt(plan: RenderPlan, time: number) {
  const shot = shotAt(plan.shots, time);
  const span = Math.max(0.001, shot.end - shot.start);
  const progress = Math.min(1, Math.max(0, (time - shot.start) / span));
  return {
    shot,
    transform: shot.applyCamera ? cameraTransform(shot.camera, progress) : cameraTransform('static', 0),
    cue: cueAt(plan.cues, time),
  };
}
