/**
 * Caption track: one chip per caption cue, positioned by real time. Click
 * selects the cue (editable in the Text panel); drag moves it in time.
 */

import { Type } from 'lucide-react';
import { useState } from 'react';
import type { CaptionCue } from '@deep-video/shared';
import { useEditorStore } from '../../store/useEditorStore';
import { colors } from '../../theme';

function Chip({ cue }: { cue: CaptionCue }) {
  const pxPerSec = useEditorStore((s) => s.pxPerSec);
  const selected = useEditorStore((s) => s.selectedCueId === cue.id);
  const selectCue = useEditorStore((s) => s.selectCue);
  const applyTimeline = useEditorStore((s) => s.applyTimeline);
  const timeline = useEditorStore((s) => s.timeline);
  const setActivePanel = useEditorStore((s) => s.setActivePanel);
  const [dSec, setDSec] = useState(0);

  const left = (cue.range.startSec + dSec) * pxPerSec;
  const width = Math.max(14, (cue.range.endSec - cue.range.startSec) * pxPerSec);

  const drag = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    selectCue(cue.id);
    const startX = e.clientX;
    const move = (ev: PointerEvent) => setDSec((ev.clientX - startX) / pxPerSec);
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const d = (ev.clientX - startX) / pxPerSec;
      setDSec(0);
      if (Math.abs(d) < 0.02 || !timeline) return;
      const next = structuredClone(timeline);
      const target = next.captions.find((c) => c.id === cue.id);
      if (!target) return;
      const dur = target.range.endSec - target.range.startSec;
      const start = Math.max(0, target.range.startSec + d);
      target.range = { startSec: start, endSec: start + dur };
      next.captions.sort((a, b) => a.range.startSec - b.range.startSec);
      applyTimeline(next);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div
      onPointerDown={drag}
      onDoubleClick={() => setActivePanel('text')}
      title={cue.text}
      style={{
        position: 'absolute',
        left,
        width,
        top: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        background: selected ? 'rgba(47,107,255,.25)' : colors.raised,
        border: `1px solid ${selected ? colors.accent : colors.border6}`,
        borderRadius: 4,
        padding: '0 6px',
        overflow: 'hidden',
        cursor: 'grab',
        userSelect: 'none',
      }}
    >
      <Type size={8} color={colors.textGhost} style={{ flexShrink: 0 }} />
      <span
        style={{
          fontSize: 9,
          color: colors.textDim,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {cue.text}
      </span>
    </div>
  );
}

export function TextTrack() {
  const timeline = useEditorStore((s) => s.timeline);
  return (
    <div style={{ position: 'relative', height: 18 }}>
      {(timeline?.captions ?? []).map((cue) => (
        <Chip key={cue.id} cue={cue} />
      ))}
    </div>
  );
}
