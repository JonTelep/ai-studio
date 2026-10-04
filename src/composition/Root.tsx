import { Composition } from 'remotion';
import type { RenderPlan } from '../model/plan.js';
import { StudioVideo } from './StudioVideo.js';

const defaultPlan: RenderPlan = {
  title: 'Preview',
  slug: 'preview',
  width: 1280,
  height: 720,
  fps: 30,
  durationSec: 1,
  captionStyle: 'clean',
  shots: [
    {
      id: 'preview',
      kind: 'image',
      sourcePath: '',
      publicFile: '',
      start: 0,
      end: 1,
      camera: 'static',
      applyCamera: false,
      color: '#123456',
    },
  ],
  cues: [],
  audio: [],
};

export function RemotionRoot() {
  return (
    <Composition
      id="Studio"
      component={StudioVideo}
      durationInFrames={30}
      fps={30}
      width={1280}
      height={720}
      defaultProps={{ plan: defaultPlan }}
      calculateMetadata={({ props }) => {
        const plan = props.plan;
        return {
          durationInFrames: Math.max(1, Math.round(plan.durationSec * plan.fps)),
          fps: plan.fps,
          width: plan.width,
          height: plan.height,
        };
      }}
    />
  );
};
