export const ASPECTS = ['9:16', '1:1', '16:9'] as const;
export type Aspect = (typeof ASPECTS)[number];

export const CAMERAS = [
  'static',
  'ken-burns-in',
  'ken-burns-out',
  'pan-left',
  'pan-right',
  'slow-push',
] as const;
export type Camera = (typeof CAMERAS)[number];

export const CAPTION_STYLES = ['impact', 'clean', 'minimal'] as const;
export type CaptionStyle = (typeof CAPTION_STYLES)[number];

export const MEDIA_KINDS = ['image', 'video'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export type WordStamp = {
  word: string;
  start: number;
  end: number;
};

export type WordTimingFile = {
  source: 'placeholder' | 'elevenlabs' | 'whisper' | 'script';
  words: WordStamp[];
};

export type AudioAnalysis = {
  source: 'energy' | 'librosa';
  sampleRate: number;
  durationSec: number;
  bpm: number | null;
  onsets: number[];
  beats: number[];
};
