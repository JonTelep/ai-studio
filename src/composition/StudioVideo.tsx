import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import '@fontsource/anton/400.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/700.css';
import { cueAt } from './visual.js';
import { cameraTransform } from './visual.js';
import type { PlanShot, RenderPlan } from '../model/plan.js';
import { CaptionLayer } from './captions.js';

function ShotLayer({ shot, durationInFrames }: { shot: PlanShot; durationInFrames: number }) {
  const frame = useCurrentFrame();
  const progress = durationInFrames <= 1 ? 0 : frame / (durationInFrames - 1);
  const transform = shot.applyCamera ? cameraTransform(shot.camera, progress) : cameraTransform('static', 0);
  return (
    <AbsoluteFill style={{ overflow: 'hidden', backgroundColor: shot.color }}>
      <AbsoluteFill
        style={{
          transform: `scale(${transform.scale}) translate(${transform.x}%, ${transform.y}%)`,
        }}
      >
        {shot.publicFile ? (
          shot.kind === 'video' ? (
            <OffthreadVideo
              src={staticFile(shot.publicFile)}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <Img src={staticFile(shot.publicFile)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          )
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** The edit. Frame content comes only from the plan and the current time. */
export function StudioVideo({ plan }: { plan: RenderPlan }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cue = cueAt(plan.cues, frame / fps);
  return (
    <AbsoluteFill style={{ backgroundColor: '#000', overflow: 'hidden' }}>
      {plan.shots.map((shot) => {
        const from = Math.round(shot.start * fps);
        const durationInFrames = Math.max(1, Math.round(shot.end * fps) - from);
        return (
          <Sequence key={shot.id} from={from} durationInFrames={durationInFrames} name={shot.id}>
            <ShotLayer shot={shot} durationInFrames={durationInFrames} />
          </Sequence>
        );
      })}
      {cue ? <CaptionLayer cue={cue} width={plan.width} height={plan.height} /> : null}
      {plan.audio.map((track) => (
        <Sequence key={`${track.role}-${track.publicFile}`} from={Math.round(track.start * fps)}>
          <Audio src={staticFile(track.publicFile)} volume={track.volume} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
