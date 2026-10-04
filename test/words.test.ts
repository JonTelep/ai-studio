import { describe, expect, it } from 'vitest';
import { renderAss } from '../src/audio/ass.js';
import { alignScriptToShots, buildCues, wordsFromCharacterAlignment } from '../src/audio/words.js';

describe('word timing', () => {
  it('groups character alignment into words', () => {
    const words = wordsFromCharacterAlignment(
      ['H', 'i', ' ', 'y', 'o', 'u'],
      [0, 0.1, 0.2, 0.3, 0.4, 0.5],
      [0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
    );
    expect(words).toEqual([
      { word: 'Hi', start: 0, end: 0.2 },
      { word: 'you', start: 0.3, end: 0.6 },
    ]);
  });

  it('lines a matching script up with shot text', () => {
    const words = alignScriptToShots('When the sprint is just one meeting', [
      { start: 0, end: 2, text: 'When the sprint' },
      { start: 2, end: 4, text: 'is just one meeting' },
    ]);
    expect(words.map((word) => word.word)).toEqual(['When', 'the', 'sprint', 'is', 'just', 'one', 'meeting']);
    expect(words[0].start).toBe(0);
    expect(words[2].end).toBeCloseTo(2, 5);
    expect(words[3].start).toBeCloseTo(2, 5);
    expect(words[6].end).toBeCloseTo(4, 5);
  });

  it('builds one cue per word and highlights that word', () => {
    const cues = buildCues(
      [{ start: 0, end: 2, text: 'Hello there' }],
      [
        { word: 'Hello', start: 0, end: 1 },
        { word: 'there', start: 1, end: 2 },
      ],
      'impact',
    );
    expect(cues).toHaveLength(2);
    expect(cues[0].highlightIndex).toBe(0);
    expect(cues[1].highlightIndex).toBe(1);
    expect(cues[0].words).toEqual(['Hello', 'there']);
    const ass = renderAss(cues, 720, 1280);
    expect(ass).toContain('Dialogue:');
    expect(ass).toContain('HELLO');
    expect(ass).toContain('&H0000FFFF&');
  });

  it('keeps each shot line together when a beat snap crosses a word', () => {
    const cues = buildCues(
      [
        { start: 0, end: 2.5, text: 'When the sprint' },
        { start: 2.5, end: 5, text: 'is just one meeting' },
      ],
      [
        { word: 'When', start: 0, end: 0.8 },
        { word: 'the', start: 0.8, end: 1.6 },
        { word: 'sprint', start: 1.6, end: 2.4 },
        { word: 'is', start: 2.4, end: 3.05 },
        { word: 'just', start: 3.05, end: 3.7 },
        { word: 'one', start: 3.7, end: 4.35 },
        { word: 'meeting', start: 4.35, end: 5 },
      ],
      'impact',
    );
    expect(cues[0].words).toEqual(['When', 'the', 'sprint']);
    expect(cues.find((cue) => cue.words[0] === 'is')?.words).toEqual(['is', 'just', 'one', 'meeting']);
    expect(cues[cues.length - 1].end).toBeLessThanOrEqual(5);
    expect(cues.filter((cue) => cue.words[0] === 'When').every((cue) => cue.end <= 2.5)).toBe(true);
  });

  it('uses shot text when there is no voiceover', () => {
    const cues = buildCues([{ start: 0, end: 1, text: 'Only text' }], null, 'minimal');
    expect(cues.map((cue) => cue.words.join(' '))).toEqual(['Only text', 'Only text']);
    expect(cues[0].style).toBe('minimal');
  });
});
