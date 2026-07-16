import { colors } from '../../theme';

/** Red playhead line + flag, positioned over the timeline area. */
export function Playhead() {
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: 96,
          top: 0,
          bottom: 12,
          width: 1.5,
          background: colors.playhead,
          zIndex: 4,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 90,
          top: 1,
          width: 14,
          height: 9,
          background: colors.playhead,
          clipPath: 'polygon(0 0,100% 0,50% 100%)',
          zIndex: 4,
        }}
      />
    </>
  );
}
