/**
 * Red playhead line + flag, positioned by the real playhead time and
 * draggable to scrub.
 */

import { useEditorStore } from '../../stores/useEditorStore';
import { colors } from '../../styles/theme';

export function Playhead() {
  const playheadSec = useEditorStore((s) => s.playheadSec);
  const pxPerSec = useEditorStore((s) => s.pxPerSec);
  const setPlayhead = useEditorStore((s) => s.setPlayhead);
  const pause = useEditorStore((s) => s.pause);

  const x = playheadSec * pxPerSec;

  const drag = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    pause();
    const startX = e.clientX;
    const startSec = playheadSec;
    const move = (ev: PointerEvent) =>
      setPlayhead(startSec + (ev.clientX - startX) / pxPerSec);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <>
      <div
        onPointerDown={drag}
        style={{
          position: 'absolute',
          left: x - 0.75,
          top: 14,
          bottom: 0,
          width: 1.5,
          background: colors.playhead,
          zIndex: 4,
          cursor: 'ew-resize',
        }}
      />
      <div
        onPointerDown={drag}
        style={{
          position: 'absolute',
          left: x - 7,
          top: 8,
          width: 14,
          height: 9,
          background: colors.playhead,
          clipPath: 'polygon(0 0,100% 0,50% 100%)',
          zIndex: 4,
          cursor: 'ew-resize',
        }}
      />
    </>
  );
}
