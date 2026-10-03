import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { assertPaidAllowed } from '../env.js';
import { extractMediaUrl, fluxImageSize, videoImageField } from './media-url.js';
import type { GenerateImageInput, GenerateVideoInput, MediaProvider } from './types.js';

type FalClient = {
  config: (options: { credentials: string }) => void;
  subscribe: (model: string, options: { input: Record<string, unknown>; logs: boolean }) => Promise<unknown>;
  storage: { upload: (file: Blob) => Promise<string> };
};

async function client(): Promise<FalClient> {
  assertPaidAllowed('fal');
  const key = process.env.FAL_KEY;
  if (!key) {
    throw new Error('FAL_KEY is not set. Add it to .env (see .env.example) or export it in the shell.');
  }
  const imported = (await import('@fal-ai/client')) as { fal: FalClient };
  imported.fal.config({ credentials: key });
  return imported.fal;
}

async function download(url: string, outPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not download ${url} (${response.status}).`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, bytes);
}

function payloadData(result: unknown): unknown {
  if (result && typeof result === 'object' && 'data' in result) {
    return (result as { data: unknown }).data;
  }
  return result;
}

export const falMedia: MediaProvider = {
  id: 'fal',
  paid: true,
  async generateImage(input: GenerateImageInput) {
    const fal = await client();
    const result = await fal.subscribe(input.model, {
      input: {
        prompt: input.prompt,
        image_size: fluxImageSize(input.aspect, input.width, input.height, input.model),
        num_images: 1,
      },
      logs: false,
    });
    await download(extractMediaUrl(payloadData(result)), input.outPath);
  },
  async generateVideo(input: GenerateVideoInput) {
    const fal = await client();
    const body: Record<string, unknown> = {
      prompt: input.prompt,
      duration: String(Math.min(15, Math.max(3, Math.round(input.durationSec)))),
      aspect_ratio: input.aspect,
    };
    if (input.mode === 'image-to-video') {
      if (!input.imagePath) throw new Error('Image-to-video needs a generated still first.');
      const bytes = await readFile(input.imagePath);
      const file = new File([bytes], path.basename(input.imagePath), { type: 'image/png' });
      const imageUrl = await fal.storage.upload(file);
      body[videoImageField(input.model, input.imageField)] = imageUrl;
    }
    const result = await fal.subscribe(input.model, { input: body, logs: false });
    await download(extractMediaUrl(payloadData(result)), input.outPath);
  },
};
