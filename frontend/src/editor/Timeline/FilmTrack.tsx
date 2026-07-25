/**
 * One lane — a video/overlay layer or an audio layer — holding every clip of
 * the given track, positioned by real time. Click empty lane space to move the
 * playhead; drag a clip vertically to move it between layers of the same kind
 * (handled in ClipBlock via laneH). Anything dragged in from a panel (media,
 * sfx, looks, shots) or from the desktop lands here — see useLaneDrop.
 */

import { useEditorStore } from '../../stores/useEditorStore';
import { colors } from '../../styles/theme';
import { ClipBlock } from '../ClipBlock/ClipBlock';
import { useLaneDrop } from './useLaneDrop';

export function FilmTrack({ trackId, height = 36 }: { trackId: string; height?: number }) {
  const timeline = useEditorStore((s) => s.timeline);
  const assets = useEditorStore((s) => s.assets);
  const pxPerSec = useEditorStore((s) => s.pxPerSec);
  const setPlayhead = useEditorStore((s) => s.setPlayhead);
  const selectClip = useEditorStore((s) => s.selectClip);
  const { over, dropProps } = useLaneDrop(trackId);

  const track = timeline?.tracks.find((t) => t.id === trackId);
  const clips = track?.clips ?? [];
  const isAudio = track?.kind === 'audio';
  const locked = Boolean(track?.locked);

  return (
    <div
      {...dropProps}
      onPointerDown={(e) => {
        // Clicking bare lane: deselect and scrub here.
        const rect = e.currentTarget.getBoundingClientRect();
        selectClip(null);
        setPlayhead((e.clientX - rect.left) / pxPerSec);
      }}
      style={{
        position: 'relative',
        height,
        background: locked
          ? 'repeating-linear-gradient(135deg,rgba(255,255,255,.03) 0 6px,transparent 6px 12px)'
          : over
            ? 'rgba(47,107,255,.16)'
            : isAudio
              ? 'rgba(70,190,140,.05)'
              : 'rgba(255,255,255,.02)',
        borderRadius: 4,
        outline: over && !locked ? `1px dashed ${colors.accent}` : undefined,
        opacity: locked ? 0.72 : 1,
      }}
    >
      {clips.length === 0 && (
        <div
          style={{
            position: 'absolute',
            left: 8,
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: 9.5,
            color: colors.textGhost,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {locked
            ? `${track?.name} is locked`
            : `${track?.name} — drop ${isAudio ? 'sound' : 'media, looks or shots'} here`}
        </div>
      )}
      {clips.map((clip) => (
        <ClipBlock
          key={clip.id}
          clip={clip}
          laneH={height}
          audio={isAudio}
          locked={locked}
          asset={clip.source.kind === 'asset' ? assets[clip.source.assetId] : undefined}
        />
      ))}
    </div>
  );
}
