import type { Camera } from '../model/types.js';
import type { WordStamp } from '../model/types.js';

export type GenerateImageInput = {
  prompt: string;
  width: number;
  height: number;
  aspect: '9:16' | '1:1' | '16:9';
  model: string;
  outPath: string;
};

export type GenerateVideoInput = {
  prompt: string;
  width: number;
  height: number;
  durationSec: number;
  fps: number;
  model: string;
  mode: 'image-to-video' | 'text-to-video';
  imagePath?: string;
  camera: Camera;
  aspect: '9:16' | '1:1' | '16:9';
  imageField?: string;
  outPath: string;
};

export type GenerateVoiceInput = {
  script: string;
  voiceId: string;
  model: string;
  durationSec: number;
  shots: { start: number; end: number; text?: string }[];
  outPath: string;
};

export interface MediaProvider {
  readonly id: 'placeholder' | 'fal';
  readonly paid: boolean;
  generateImage(input: GenerateImageInput): Promise<void>;
  generateVideo(input: GenerateVideoInput): Promise<void>;
}

export interface VoiceProvider {
  readonly id: 'placeholder' | 'elevenlabs';
  readonly paid: boolean;
  synthesize(input: GenerateVoiceInput): Promise<{ words: WordStamp[]; durationSec: number }>;
}
