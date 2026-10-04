import { AbsoluteFill } from 'remotion';
import type { CaptionCue } from '../audio/words.js';

export function CaptionLayer({
  cue,
  width,
  height,
}: {
  cue: CaptionCue;
  width: number;
  height: number;
}) {
  const impact = cue.style === 'impact';
  const minimal = cue.style === 'minimal';
  const fontSize = Math.round(height * (impact ? 0.072 : minimal ? 0.034 : 0.044));
  return (
    <AbsoluteFill
      style={{
        justifyContent: impact ? 'center' : 'flex-end',
        alignItems: 'center',
        padding: impact ? '8% 6%' : '0 7% 8%',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: '0.28em',
          maxWidth: width * 0.9,
          fontFamily: impact ? 'Anton, Impact, sans-serif' : 'Inter, DejaVu Sans, sans-serif',
          fontWeight: impact || !minimal ? 700 : 400,
          fontSize,
          lineHeight: 1.05,
          letterSpacing: impact ? '0.02em' : '0',
          textAlign: 'center',
          textTransform: impact ? 'uppercase' : 'none',
          color: 'white',
          background: impact || minimal ? 'transparent' : 'rgba(0,0,0,0.55)',
          borderRadius: 12,
          padding: impact || minimal ? 0 : '10px 16px',
          WebkitTextStroke: impact ? `${Math.max(2, Math.round(height * 0.006))}px #000` : undefined,
          textShadow: minimal ? '0 2px 8px rgba(0,0,0,0.8)' : undefined,
        }}
      >
        {cue.words.map((word, index) => {
          const current = index === cue.highlightIndex;
          const upcoming = index > cue.highlightIndex;
          return (
            <span
              key={`${word}-${index}`}
              style={{
                color: current ? '#ffe14a' : 'white',
                opacity: upcoming ? 0.45 : 1,
              }}
            >
              {word}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
