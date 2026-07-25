/**
 * One clip on the video track, positioned by real time. Footage clips show
 * their extracted thumbnail as a filmstrip; generation slots render as purple
 * element blocks. Click selects; drag moves; the side handles trim (visible
 * when selected). All edits preview locally and commit to the store on
 * pointer-up.
 */

import { Lock, Music, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import type { ClipAsset, TimelineClip } from '@deep-vision/shared';
import { fileUrl, useEditorStore } from '../../stores/useEditorStore';
import { gradients } from '../../styles/theme';

interface DragState {
  kind: 'move' | 'trim-start' | 'trim-end';
  dSec: number;
  /** Vertical offset (px) while moving — crossing a lane switches layers. */
  dY: number;
}

export function ClipBlock({
  clip,
  asset,
  laneH = 36,
  audio = false,
  locked = false,
}: {
  clip: TimelineClip;
  asset?: ClipAsset;
  laneH?: number;
  /** Audio-lane clip: waveform-green block with its name, no filmstrip. */
  audio?: boolean;
  /** The lane is locked: select and inspect, but never move, trim or delete. */
  locked?: boolean;
}) {
  const pxPerSec = useEditorStore((s) => s.pxPerSec);
  const selected = useEditorStore((s) => s.selectedClipId === clip.id);
  const selectClip = useEditorStore((s) => s.selectClip);
  const moveClip = useEditorStore((s) => s.moveClip);
  const moveClipLane = useEditorStore((s) => s.moveClipLane);
  const trimClipEdge = useEditorStore((s) => s.trimClipEdge);
  const deleteClip = useEditorStore((s) => s.deleteClip);
  const setActivePanel = useEditorStore((s) => s.setActivePanel);
  const [drag, setDrag] = useState<DragState | null>(null);

  // Row pitch: lane height + the 4px gap between TrackRows.
  const lanePitch = laneH + 4;
  const laneDeltaOf = (dY: number) => Math.round(dY / lanePitch);

  const start = clip.range.startSec + (drag?.kind === 'move' || drag?.kind === 'trim-start' ? drag.dSec : 0);
  const end = clip.range.endSec + (drag?.kind === 'move' || drag?.kind === 'trim-end' ? drag.dSec : 0);
  const left = Math.max(0, start) * pxPerSec;
  const width = Math.max(4, (end - Math.max(0, start)) * pxPerSec);
  const dragLaneDelta = drag?.kind === 'move' ? laneDeltaOf(drag.dY) : 0;

  const beginDrag = (kind: DragState['kind']) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    selectClip(clip.id);
    // A locked lane still selects (so you can look at the clip), but nothing
    // moves — no listeners are attached at all.
    if (locked) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const move = (ev: PointerEvent) => {
      setDrag({
        kind,
        dSec: (ev.clientX - startX) / pxPerSec,
        dY: kind === 'move' ? ev.clientY - startY : 0,
      });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const dSec = (ev.clientX - startX) / pxPerSec;
      const laneDelta = kind === 'move' ? laneDeltaOf(ev.clientY - startY) : 0;
      setDrag(null);
      if (Math.abs(dSec) < 0.02 && laneDelta === 0) return; // click, not a drag
      if (kind === 'move') {
        if (laneDelta !== 0) moveClipLane(clip.id, laneDelta, clip.range.startSec + dSec);
        else moveClip(clip.id, clip.range.startSec + dSec);
      }
      if (kind === 'trim-start') trimClipEdge(clip.id, 'start', clip.range.startSec + dSec);
      if (kind === 'trim-end') trimClipEdge(clip.id, 'end', clip.range.endSec + dSec);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const isSlot = clip.source.kind === 'generate';
  const thumb = !audio && asset?.thumbPath ? fileUrl(asset.thumbPath) : undefined;

  return (
    <div
      onPointerDown={beginDrag('move')}
      // A composed shot re-opens in the Presets panel, ready to re-customize.
      onDoubleClick={() => {
        selectClip(clip.id);
        setActivePanel('presets');
      }}
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
        cursor: locked ? 'default' : 'grab',
        background: isSlot
          ? gradients.elementTrack
          : audio
            ? 'linear-gradient(160deg,#1f4c3c,#2f7a5e)'
            : thumb
              ? '#22252c'
              : 'linear-gradient(160deg,#3a4a6c,#7285b4)',
        opacity: drag ? 0.85 : 1,
        zIndex: drag ? 3 : selected ? 2 : 1,
        userSelect: 'none',
        // Snap the preview to the lane it would land on.
        transform: dragLaneDelta !== 0 ? `translateY(${dragLaneDelta * lanePitch}px)` : undefined,
        boxShadow: dragLaneDelta !== 0 ? '0 0 0 2px rgba(111,155,255,.7)' : undefined,
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
      {audio && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '0 7px',
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
        >
          <Music size={10} color="#bff0dc" style={{ flexShrink: 0 }} />
          <span
            style={{
              fontSize: 9.5,
              color: '#dbfaec',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {clip.label ?? 'audio'}
          </span>
        </div>
      )}
      {(clip.lookId || clip.shotSpec) && (
        // A look preset or a built shot rides on the clip — say which, and
        // double-clicking the block opens it for another round of tweaking.
        <div
          title="Double-click to customize"
          style={{
            position: 'absolute',
            left: 3,
            top: 3,
            padding: '1px 5px',
            borderRadius: 4,
            background: clip.lookId ? 'rgba(47,107,255,.85)' : 'rgba(140,90,255,.85)',
            color: '#fff',
            fontSize: 9,
            letterSpacing: 0.2,
            pointerEvents: 'none',
            maxWidth: 'calc(100% - 6px)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {clip.lookId ?? clip.shotSpec?.presetId}
        </div>
      )}
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
      {selected && locked && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            border: '2px dashed rgba(255,255,255,.55)',
            borderRadius: isSlot ? 6 : 4,
            display: 'grid',
            placeItems: 'center',
            pointerEvents: 'none',
          }}
        >
          <Lock size={12} color="#fff" />
        </div>
      )}
      {selected && !locked && (
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
          <button
            // Delete this clip. Works for footage, images, shots and sounds
            // alike; Delete/Backspace does the same for the selection.
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              deleteClip(clip.id);
            }}
            title="Remove this clip (Delete)"
            style={{
              position: 'absolute',
              right: 8,
              top: 2,
              width: 15,
              height: 15,
              display: 'grid',
              placeItems: 'center',
              padding: 0,
              borderRadius: 4,
              border: 'none',
              background: 'rgba(200,60,60,.9)',
              color: '#fff',
              cursor: 'pointer',
              zIndex: 4,
            }}
          >
            <X size={10} />
          </button>
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
