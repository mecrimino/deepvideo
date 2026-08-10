/**
 * Time ruler computed from the timeline duration and zoom. Click or drag
 * anywhere on it to scrub the playhead.
 */

import { useEditorStore } from '../../stores/useEditorStore';
import { colors } from '../../styles/theme';
import { formatRulerLabel } from '../../utils/format';

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
        height: 22,
        fontSize: 9.5,
        letterSpacing: '.02em',
        color: colors.textGhost,
        cursor: 'ew-resize',
        userSelect: 'none',
        borderBottom: `1px solid ${colors.border7}`,
      }}
    >
      {/* minor ticks — short hairlines hanging from the bottom of the row */}
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
                height: 4,
                background: 'rgba(148,190,220,.22)',
              }}
            />
          ) : null;
        }),
      )}
      {/* major ticks + their second label, centred on the tick */}
      {majors.map((t) => (
        <div key={t}>
          <div
            style={{
              position: 'absolute',
              left: t * pxPerSec,
              bottom: 0,
              width: 1,
              height: 7,
              background: 'rgba(148,190,220,.38)',
            }}
          />
          <span
            style={{
              position: 'absolute',
              left: t * pxPerSec,
              top: 4,
              transform: t === 0 ? 'none' : 'translateX(-50%)',
              paddingLeft: t === 0 ? 3 : 0,
              whiteSpace: 'nowrap',
            }}
          >
            {formatRulerLabel(t)}
          </span>
        </div>
      ))}
    </div>
  );
}
