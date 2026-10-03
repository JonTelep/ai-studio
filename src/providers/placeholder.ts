import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Camera } from '../model/types.js';
import { alignScriptToShots } from '../audio/words.js';
import { runFfmpeg } from '../util/ffmpeg.js';
import { round3 } from '../util/time.js';
import { wrapText, xmlEscape } from '../util/text.js';
import type { GenerateImageInput, GenerateVideoInput, GenerateVoiceInput, MediaProvider, VoiceProvider } from './types.js';

function palette(seed: string): { from: string; to: string } {
  const hash = createHash('sha256').update(seed).digest();
  const channel = (index: number, min: number, span: number) => min + (hash[index] % span);
  const hex = (r: number, g: number, b: number) =>
    `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
  return {
    from: hex(channel(0, 12, 50), channel(1, 28, 90), channel(2, 48, 140)),
    to: hex(channel(3, 30, 120), channel(4, 50, 140), channel(5, 40, 120)),
  };
}

function svgFrame(input: { prompt: string; width: number; height: number; label: string }): string {
  const colors = palette(input.prompt);
  const lines = wrapText(input.prompt, input.width > input.height ? 36 : 22, 7);
  const fontSize = input.width >= 1000 ? 40 : 32;
  const lineHeight = Math.round(fontSize * 1.25);
  const blockHeight = lines.length * lineHeight;
  const startY = Math.round(input.height / 2 - blockHeight / 2 + fontSize);
  const tspans = lines
    .map((line, index) => {
      const y = startY + index * lineHeight;
      return `<tspan x="${input.width / 2}" y="${y}">${xmlEscape(line)}</tspan>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${input.width}" height="${input.height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${colors.from}"/>
      <stop offset="100%" stop-color="${colors.to}"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <text x="${input.width / 2}" y="72" text-anchor="middle" fill="rgba(255,255,255,0.72)" font-size="22" font-family="DejaVu Sans">${xmlEscape(input.label)}</text>
  <text text-anchor="middle" fill="#ffffff" font-size="${fontSize}" font-family="DejaVu Sans">${tspans}</text>
</svg>`;
}

async function rasterize(svg: string, outPath: string): Promise<void> {
  const svgPath = `${outPath}.svg`;
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(svgPath, svg);
  await runFfmpeg(['-i', svgPath, '-frames:v', '1', outPath]);
}

function zoompan(camera: Camera, frames: number, width: number, height: number): string {
  const span = Math.max(1, frames - 1);
  const size = `d=${frames}:s=${width}x${height}:fps=30`;
  switch (camera) {
    case 'ken-burns-in':
      return `zoompan=z='1+0.12*on/${span}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':${size}`;
    case 'ken-burns-out':
      return `zoompan=z='1.12-0.12*on/${span}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':${size}`;
    case 'slow-push':
      return `zoompan=z='1+0.08*on/${span}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':${size}`;
    case 'pan-left':
      return `zoompan=z='1.14':x='(iw-iw/zoom)*(1-on/${span})':y='(ih-ih/zoom)/2':${size}`;
    case 'pan-right':
      return `zoompan=z='1.14':x='(iw-iw/zoom)*(on/${span})':y='(ih-ih/zoom)/2':${size}`;
    default:
      return `zoompan=z='1':x='0':y='0':${size}`;
  }
}

export const placeholderMedia: MediaProvider = {
  id: 'placeholder',
  paid: false,
  async generateImage(input: GenerateImageInput) {
    const svg = svgFrame({
      prompt: input.prompt,
      width: input.width,
      height: input.height,
      label: input.referenceImages?.length
        ? `PLACEHOLDER STILL · ${input.referenceImages.length} REFS`
        : 'PLACEHOLDER STILL',
    });
    await rasterize(svg, input.outPath);
  },
  async generateVideo(input: GenerateVideoInput) {
    const sourceWidth = input.width * 2;
    const sourceHeight = input.height * 2;
    const stillPath = input.imagePath ?? `${input.outPath}.still.png`;
    if (!input.imagePath) {
      await rasterize(
        svgFrame({
          prompt: input.prompt,
          width: sourceWidth,
          height: sourceHeight,
          label: 'PLACEHOLDER VIDEO',
        }),
        stillPath,
      );
    }
    const frames = Math.max(1, Math.round(input.durationSec * input.fps));
    const motion = zoompan(input.camera, frames, input.width, input.height).replace(
      ':fps=30',
      `:fps=${input.fps}`,
    );
    const filter = `scale=${input.width * 2}:${input.height * 2},${motion}`;
    mkdirSync(path.dirname(input.outPath), { recursive: true });
    await runFfmpeg([
      '-loop',
      '1',
      '-i',
      input.imagePath ? input.imagePath : stillPath,
      '-vf',
      filter,
      '-frames:v',
      String(frames),
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-an',
      input.outPath,
    ]);
  },
};

export const placeholderVoice: VoiceProvider = {
  id: 'placeholder',
  paid: false,
  async synthesize(input: GenerateVoiceInput) {
    const duration = Math.max(0.4, input.durationSec);
    mkdirSync(path.dirname(input.outPath), { recursive: true });
    await runFfmpeg([
      '-f',
      'lavfi',
      '-i',
      `sine=frequency=196:duration=${duration.toFixed(3)}:sample_rate=44100`,
      '-af',
      'volume=0.04',
      '-c:a',
      'pcm_s16le',
      input.outPath,
    ]);
    const words = alignScriptToShots(input.script, input.shots);
    return { words, durationSec: round3(duration) };
  },
};
