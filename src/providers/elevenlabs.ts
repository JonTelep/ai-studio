import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { assertPaidAllowed } from '../env.js';
import { wordsFromCharacterAlignment } from '../audio/words.js';
import type { WordStamp } from '../model/types.js';
import type { GenerateVoiceInput, VoiceProvider } from './types.js';

type Alignment = {
  characters?: string[];
  character_start_times_seconds?: number[];
  character_end_times_seconds?: number[];
};

export const elevenLabsVoice: VoiceProvider = {
  id: 'elevenlabs',
  paid: true,
  async synthesize(input: GenerateVoiceInput): Promise<{ words: WordStamp[]; durationSec: number }> {
    assertPaidAllowed('elevenlabs');
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) {
      throw new Error(
        'ELEVENLABS_API_KEY is not set. Add it to .env (see .env.example) or use voiceover.provider: placeholder.',
      );
    }
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(input.voiceId)}/with-timestamps`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': key,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          text: input.script,
          model_id: input.model,
        }),
      },
    );
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`ElevenLabs request failed (${response.status}): ${detail.slice(0, 400)}`);
    }
    const payload = (await response.json()) as {
      audio_base64?: string;
      alignment?: Alignment;
      normalized_alignment?: Alignment;
    };
    if (!payload.audio_base64) throw new Error('ElevenLabs response did not include audio.');
    mkdirSync(path.dirname(input.outPath), { recursive: true });
    writeFileSync(input.outPath, Buffer.from(payload.audio_base64, 'base64'));
    const alignment = payload.alignment ?? payload.normalized_alignment;
    const words = alignment?.characters
      ? wordsFromCharacterAlignment(
          alignment.characters,
          alignment.character_start_times_seconds ?? [],
          alignment.character_end_times_seconds ?? [],
        )
      : [];
    const durationSec = words.length ? words[words.length - 1].end : input.durationSec;
    return { words, durationSec };
  },
};
