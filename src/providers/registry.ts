import type { Project } from '../project/schema.js';
import { elevenLabsVoice } from './elevenlabs.js';
import { falMedia } from './fal.js';
import { placeholderMedia, placeholderVoice } from './placeholder.js';
import type { MediaProvider, VoiceProvider } from './types.js';

export function resolveMediaProvider(project: Project, override?: string): MediaProvider {
  const choice = override ?? project.provider;
  if (choice === 'placeholder') return placeholderMedia;
  if (choice === 'fal') return falMedia;
  return process.env.FAL_KEY ? falMedia : placeholderMedia;
}

export function resolveVoiceProvider(project: Project): VoiceProvider | null {
  if (!project.voiceover) return null;
  const choice = project.voiceover.provider;
  if (choice === 'placeholder') return placeholderVoice;
  if (choice === 'elevenlabs') return elevenLabsVoice;
  return process.env.ELEVENLABS_API_KEY ? elevenLabsVoice : placeholderVoice;
}
