/**
 * Time ruler computed from the timeline duration and zoom. Click or drag
 * anywhere on it to scrub the playhead.
 */

import { useEditorStore } from '../../store/useEditorStore';
import { colors, fontMono } from '../../theme';
import { formatRulerLabel } from '../../lib/format';

/** Major-tick step (seconds) that keeps labels ~110px apart at this zoom. */
export function rulerStep(pxPerSec: number): number {
  const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  for (const s of steps) if (s * pxPerSec >= 90) return s;
  return 1200;
}

export function Ruler({ contentSec }: { contentSec: number }) {
  const pxPerSec = useEditorStore((s) => s.pxPerSec);
  const setPlayhead = useEditorStore((s) => s.setPlayhead);
  const pause = useEditorStore((s) => s.pause);

  const step = rulerStep(pxPerSec);
  const majors: number[] = [];
  for (let t = 0; t <= contentSec; t += step) majors.push(t);
  const minorsPerMajor = 4;

  const scrub = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const toSec = (clientX: number) =>
      Math.max(0, (clientX - el.getBoundingClientRect().left) / pxPerSec);
    pause();
    setPlayhead(toSec(e.clientX));
    const move = (ev: PointerEvent) => setPlayhead(toSec(ev.clientX));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div
      onPointerDown={scrub}
      style={{
        position: 'relative',
        height: 23,
        fontFamily: fontMono,
        fontSize: 10,
        color: colors.textMono,
        cursor: 'ew-resize',
        userSelect: 'none',
      }}
    >
      {majors.map((t) => (
        <div key={t} style={{ position: 'absolute', left: t * pxPerSec, top: 3 }}>
          <span style={{ position: 'relative', left: t === 0 ? 0 : -8 }}>{formatRulerLabel(t)}</span>
        </div>
      ))}
      {majors.flatMap((t) =>
        Array.from({ length: minorsPerMajor }, (_, i) => {
          const x = (t + ((i + 1) * step) / (minorsPerMajor + 1)) * pxPerSec;
          return x <= contentSec * pxPerSec ? (
            <div
              key={`${t}-${i}`}
              style={{
                position: 'absolute',
                left: x,
                bottom: 0,
                width: 1,
                height: 3,
                background: '#33333a',
              }}
            />
          ) : null;
        }),
      )}
    </div>
  );
}
