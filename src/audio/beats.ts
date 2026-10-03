import type { AudioAnalysis } from '../model/types.js';
import { round3 } from '../util/time.js';

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function analyzePcm(samples: Float32Array, sampleRate: number): AudioAnalysis {
  const hopSec = 0.01;
  const hop = Math.max(1, Math.round(sampleRate * hopSec));
  const envelope: number[] = [];
  for (let i = 0; i + hop <= samples.length; i += hop) {
    let energy = 0;
    for (let j = 0; j < hop; j++) {
      const sample = samples[i + j];
      energy += sample * sample;
    }
    envelope.push(Math.sqrt(energy / hop));
  }

  const flux = envelope.map((value, index) => Math.max(0, value - (envelope[index - 1] ?? value)));
  const onsets = pickOnsets(flux, hop, sampleRate);
  const { bpm, beats } = trackBeats(flux, hop / sampleRate);
  return {
    source: 'energy',
    sampleRate,
    durationSec: round3(samples.length / sampleRate),
    bpm,
    onsets,
    beats,
  };
}

function pickOnsets(flux: number[], hop: number, sampleRate: number): number[] {
  const times: number[] = [];
  const win = 15;
  for (let i = 1; i < flux.length - 1; i++) {
    if (flux[i] < flux[i - 1] || flux[i] < flux[i + 1]) continue;
    const start = Math.max(0, i - win);
    const end = Math.min(flux.length, i + win + 1);
    const window = flux.slice(start, end);
    const avg = mean(window);
    const variance = mean(window.map((value) => (value - avg) ** 2));
    const threshold = avg + Math.sqrt(variance) * 0.8;
    if (flux[i] <= threshold || flux[i] <= 0.02) continue;
    const time = round3((i * hop) / sampleRate);
    if (times.length === 0 || time - times[times.length - 1] > 0.08) times.push(time);
  }
  return times;
}

function trackBeats(flux: number[], hopSec: number): { bpm: number | null; beats: number[] } {
  if (flux.length < 20) return { bpm: null, beats: [] };
  const minLag = Math.max(1, Math.round(60 / 180 / hopSec));
  const maxLag = Math.min(flux.length - 1, Math.round(60 / 60 / hopSec));
  let bestLag = 0;
  let bestScore = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let score = 0;
    for (let i = lag; i < flux.length; i++) score += flux[i] * flux[i - lag];
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  if (bestLag === 0 || bestScore <= 0) return { bpm: null, beats: [] };

  let bestPhase = 0;
  let bestPhaseScore = -Infinity;
  for (let phase = 0; phase < bestLag; phase++) {
    let score = 0;
    for (let i = phase; i < flux.length; i += bestLag) score += flux[i];
    if (score > bestPhaseScore) {
      bestPhaseScore = score;
      bestPhase = phase;
    }
  }

  const beats: number[] = [];
  for (let i = bestPhase; i < flux.length; i += bestLag) beats.push(round3(i * hopSec));
  const bpm = round3(60 / (bestLag * hopSec));
  return { bpm, beats };
}

/** Impulse train used by tests and as a reference for the click-track asset. */
export function synthesizeClicks(bpm: number, durationSec: number, sampleRate: number): Float32Array {
  const total = Math.floor(durationSec * sampleRate);
  const samples = new Float32Array(total);
  const interval = 60 / bpm;
  const clickLength = Math.floor(sampleRate * 0.02);
  for (let time = 0; time < durationSec - 1e-6; time += interval) {
    const start = Math.floor(time * sampleRate);
    for (let i = 0; i < clickLength; i++) {
      const index = start + i;
      if (index >= total) break;
      const env = 1 - i / clickLength;
      samples[index] += Math.sin((2 * Math.PI * 1000 * i) / sampleRate) * env * 0.8;
    }
  }
  return samples;
}
