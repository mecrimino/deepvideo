import React from 'react';
import { Composition } from 'remotion';
import { Overlay } from './Overlay';
import type { OverlaySpec } from './spec';

const FALLBACK: OverlaySpec = {
  template: 'title_card', text: 'Deep Video', theme: 'dark',
  preset: 'scale_pop', durationSec: 3,
};

export const Root: React.FC = () => (
  <Composition
    id="Overlay"
    component={Overlay}
    defaultProps={FALLBACK}
    durationInFrames={90}
    fps={30}
    width={1920}
    height={1080}
    calculateMetadata={({ props }) => {
      const fps = props.fps ?? 30;
      return {
        fps,
        width: props.width ?? 1920,
        height: props.height ?? 1080,
        durationInFrames: Math.max(1, Math.round((props.durationSec ?? 3) * fps)),
      };
    }}
  />
);
