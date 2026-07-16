/**
 * One clip on the video track, positioned by real time. Footage clips show
 * their extracted thumbnail as a filmstrip; generation slots render as purple
 * element blocks. Click selects; drag moves; the side handles trim (visible
 * when selected). All edits preview locally and commit to the store on
 * pointer-up.
 */

import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import type { ClipAsset, TimelineClip } from '@deep-video/shared';
import { fileUrl, useEditorStore } from '../../store/useEditorStore';
import { gradients } from '../../theme';

interface DragState {
  kind: 'move' | 'trim-start' | 'trim-end';
  dSec: number;
}

export function ClipBlock({ clip, asset }: { clip: TimelineClip; asset?: ClipAsset }) {
  const pxPerSec = useEditorStore((s) => s.pxPerSec);
  const selected = useEditorStore((s) => s.selectedClipId === clip.id);
  const selectClip = useEditorStore((s) => s.selectClip);
  const moveClip = useEditorStore((s) => s.moveClip);
  const trimClipEdge = useEditorStore((s) => s.trimClipEdge);
  const [drag, setDrag] = useState<DragState | null>(null);

  const start = clip.range.startSec + (drag?.kind === 'move' || drag?.kind === 'trim-start' ? drag.dSec : 0);
  const end = clip.range.endSec + (drag?.kind === 'move' || drag?.kind === 'trim-end' ? drag.dSec : 0);
  const left = Math.max(0, start) * pxPerSec;
  const width = Math.max(4, (end - Math.max(0, start)) * pxPerSec);

  const beginDrag = (kind: DragState['kind']) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    selectClip(clip.id);
    const startX = e.clientX;
    const move = (ev: PointerEvent) => {
      setDrag({ kind, dSec: (ev.clientX - startX) / pxPerSec });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const dSec = (ev.clientX - startX) / pxPerSec;
      setDrag(null);
      if (Math.abs(dSec) < 0.02) return; // click, not a drag
      if (kind === 'move') moveClip(clip.id, clip.range.startSec + dSec);
      if (kind === 'trim-start') trimClipEdge(clip.id, 'start', clip.range.startSec + dSec);
      if (kind === 'trim-end') trimClipEdge(clip.id, 'end', clip.range.endSec + dSec);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const isSlot = clip.source.kind === 'generate';
  const thumb = asset?.thumbPath ? fileUrl(asset.thumbPath) : undefined;

  return (
    <div
      onPointerDown={beginDrag('move')}
      title={
        clip.review
          ? `${clip.label ?? ''} — weak match (${clip.matchScore ?? '?'}), review suggested`.trim()
          : clip.label
      }
      style={{
        position: 'absolute',
        left,
        width,
        top: 0,
        bottom: 0,
        borderRadius: isSlot ? 6 : 4,
        overflow: 'hidden',
        cursor: 'grab',
        background: isSlot
          ? gradients.elementTrack
          : thumb
            ? '#22252c'
            : 'linear-gradient(160deg,#3a4a6c,#7285b4)',
        opacity: drag ? 0.85 : 1,
        zIndex: selected ? 2 : 1,
        userSelect: 'none',
      }}
    >
      {!isSlot && thumb && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url(${thumb})`,
            backgroundRepeat: 'repeat-x',
            backgroundSize: 'auto 100%',
          }}
        />
      )}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg,rgba(0,0,0,.05),rgba(0,0,0,.35))',
        }}
      />
      {clip.review && !selected && (
        // Below-threshold match flagged by the pipeline: yellow outline for a
        // quick manual swap (Deep Video v1 Mini spec, step 6).
        <div
          style={{
            position: 'absolute',
            inset: 0,
            border: '2px solid #f5c542',
            borderRadius: isSlot ? 6 : 4,
            boxShadow: '0 0 0 1px rgba(0,0,0,.4)',
            pointerEvents: 'none',
          }}
        />
      )}
      {isSlot && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '0 9px',
            overflow: 'hidden',
          }}
        >
          <Sparkles size={12} color="#fff" style={{ flexShrink: 0, opacity: 0.9 }} />
          <span
            style={{
              fontSize: 10.5,
              color: '#fff',
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {clip.label ?? 'Generation slot'}
          </span>
        </div>
      )}
      {selected && (
        <>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              border: '2px solid #fff',
              borderRadius: isSlot ? 6 : 4,
              boxShadow: '0 0 0 1px rgba(0,0,0,.4)',
              pointerEvents: 'none',
            }}
          />
          <div
            onPointerDown={beginDrag('trim-start')}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: 6,
              background: '#fff',
              borderRadius: '4px 0 0 4px',
              cursor: 'ew-resize',
            }}
          />
          <div
            onPointerDown={beginDrag('trim-end')}
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              bottom: 0,
              width: 6,
              background: '#fff',
              borderRadius: '0 4px 4px 0',
              cursor: 'ew-resize',
            }}
          />
        </>
      )}
    </div>
  );
}
