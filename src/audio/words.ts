import type { CaptionStyle, WordStamp } from '../model/types.js';
import { normalizeWords, wordKey } from '../util/text.js';
import { round3 } from '../util/time.js';

export type CaptionCue = {
  start: number;
  end: number;
  words: string[];
  highlightIndex: number;
  style: CaptionStyle;
};

export function wordsFromCharacterAlignment(
  characters: string[],
  starts: number[],
  ends: number[],
): WordStamp[] {
  const words: WordStamp[] = [];
  let current = '';
  let start = 0;
  let end = 0;
  const flush = () => {
    const trimmed = current.trim();
    if (trimmed) words.push({ word: trimmed, start: round3(start), end: round3(end) });
    current = '';
  };
  for (let i = 0; i < characters.length; i++) {
    const character = characters[i] ?? '';
    if (/\s/.test(character)) {
      flush();
      continue;
    }
    if (!current) start = starts[i] ?? end;
    current += character;
    end = ends[i] ?? start;
  }
  flush();
  return words;
}

export function evenWords(text: string, start: number, end: number): WordStamp[] {
  const words = normalizeWords(text);
  if (words.length === 0) return [];
  const span = Math.max(0.05, end - start);
  const slice = span / words.length;
  return words.map((word, index) => ({
    word,
    start: round3(start + index * slice),
    end: round3(start + (index + 1) * slice),
  }));
}

export function scriptsMatch(script: string, shotTexts: string[]): boolean {
  const left = normalizeWords(script).map(wordKey).filter(Boolean).join(' ');
  const right = shotTexts.flatMap((text) => normalizeWords(text)).map(wordKey).filter(Boolean).join(' ');
  return left.length > 0 && left === right;
}

/**
 * Placeholder speech has no real phonemes. If the script is the shot text
 * read in order, line the words up with each shot. Otherwise spread them
 * evenly across the whole timeline.
 */
export function alignScriptToShots(
  script: string,
  shots: { start: number; end: number; text?: string }[],
): WordStamp[] {
  if (shots.length === 0) return evenWords(script, 0, 1);
  const texts = shots.map((shot) => shot.text ?? '');
  if (scriptsMatch(script, texts)) {
    return shots.flatMap((shot) => evenWords(shot.text ?? '', shot.start, shot.end));
  }
  const start = shots[0].start;
  const end = shots[shots.length - 1].end;
  return evenWords(script, start, end);
}

function wordsForShot(
  shot: { start: number; end: number; text?: string },
  voiceWords: WordStamp[] | null,
  assigned: WordStamp[] | null,
): WordStamp[] {
  if (assigned) return assigned;
  if (voiceWords?.length) {
    return voiceWords.filter((word) => word.start >= shot.start - 1e-6 && word.start < shot.end - 1e-3);
  }
  if (shot.text) return evenWords(shot.text, shot.start, shot.end);
  return [];
}

/**
 * When the spoken words are the shot lines in order, keep each line together
 * even if a beat snap moves the cut across a word boundary.
 */
function assignWordsInOrder(
  shots: { start: number; end: number; text?: string }[],
  voiceWords: WordStamp[],
): WordStamp[][] | null {
  const texts = shots.map((shot) => shot.text ?? '');
  if (!scriptsMatch(voiceWords.map((word) => word.word).join(' '), texts)) return null;
  let cursor = 0;
  return shots.map((shot) => {
    const count = normalizeWords(shot.text ?? '').length;
    const group = voiceWords.slice(cursor, cursor + count);
    cursor += count;
    return group;
  });
}

export function buildCues(
  shots: { start: number; end: number; text?: string }[],
  voiceWords: WordStamp[] | null,
  style: CaptionStyle,
): CaptionCue[] {
  const assigned = voiceWords?.length ? assignWordsInOrder(shots, voiceWords) : null;
  const cues: CaptionCue[] = [];
  shots.forEach((shot, shotIndex) => {
    const group = wordsForShot(shot, voiceWords, assigned ? assigned[shotIndex] : null);
    group.forEach((word, index) => {
      const next = group[index + 1];
      const start = Math.max(word.start, shot.start);
      const end = Math.min(shot.end, next ? next.start : shot.end);
      if (end <= start + 1e-4) return;
      cues.push({
        start,
        end,
        words: group.map((entry) => entry.word),
        highlightIndex: index,
        style,
      });
    });
  });
  return cues;
}
