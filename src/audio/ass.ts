import type { CaptionCue } from './words.js';
import { assEscape } from '../util/text.js';

function assTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}:${secs.toFixed(2).padStart(5, '0')}`;
}

function cueText(cue: CaptionCue): string {
  return cue.words
    .map((word, index) => {
      const spoken = index < cue.highlightIndex;
      const current = index === cue.highlightIndex;
      const color = current ? '&H0000FFFF&' : spoken ? '&H00FFFFFF&' : '&H00AAAAAA&';
      const body = cue.style === 'impact' ? assEscape(word.toUpperCase()) : assEscape(word);
      return `{\\c${color}}${body}`;
    })
    .join(' ');
}

export function renderAss(cues: CaptionCue[], width: number, height: number): string {
  const impactSize = Math.round(height * 0.07);
  const cleanSize = Math.round(height * 0.042);
  const minimalSize = Math.round(height * 0.034);
  const lines = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Impact,DejaVu Sans,${impactSize},&H00FFFFFF,&H000000FF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,4,0,5,40,40,40,1`,
    `Style: Clean,DejaVu Sans,${cleanSize},&H00FFFFFF,&H000000FF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,3,8,0,2,50,50,70,1`,
    `Style: Minimal,DejaVu Sans,${minimalSize},&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,1,1,2,60,60,80,1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
  for (const cue of cues) {
    const style = cue.style === 'impact' ? 'Impact' : cue.style === 'minimal' ? 'Minimal' : 'Clean';
    lines.push(
      `Dialogue: 0,${assTime(cue.start)},${assTime(cue.end)},${style},,0,0,0,,${cueText(cue)}`,
    );
  }
  lines.push('');
  return lines.join('\n');
}
