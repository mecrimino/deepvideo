/**
 * Orange playhead: a full-height line with the current FRAME number in a
 * rounded badge at its head (Rive-style). Drag either to scrub.
 */

import { useEditorStore } from '../../stores/useEditorStore';
import { colors } from '../../styles/theme';

export function Playhead() {
  const playheadSec = useEditorStore((s) => s.playheadSec);
  const pxPerSec = useEditorStore((s) => s.pxPerSec);
  const setPlayhead = useEditorStore((s) => s.setPlayhead);
  const pause = useEditorStore((s) => s.pause);
  const fps = useEditorStore((s) => s.timeline?.fps ?? 30);

  const x = playheadSec * pxPerSec;
  const frame = Math.round(playheadSec * fps);

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
          left: x - 1,
          top: 15,
          bottom: 0,
          width: 2,
          background: colors.playhead,
          zIndex: 4,
          cursor: 'ew-resize',
        }}
      />
      {/* frame-number head */}
      <div
        onPointerDown={drag}
        title={`frame ${frame}`}
        style={{
          position: 'absolute',
          // Clamp at the left edge so the badge never gets half-cut at frame 0.
          left: Math.max(x, 11),
          top: 2,
          transform: 'translateX(-50%)',
          minWidth: 20,
          height: 14,
          padding: '0 4px',
          borderRadius: 3,
          background: colors.playhead,
          color: '#fff',
          fontSize: 9.5,
          fontWeight: 700,
          lineHeight: '14px',
          textAlign: 'center',
          zIndex: 5,
          cursor: 'ew-resize',
          userSelect: 'none',
        }}
      >
        {frame}
      </div>
    </>
  );
}
