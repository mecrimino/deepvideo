/**
 * One video/overlay lane: every clip of the given track, positioned by real
 * time. Click empty lane space to move the playhead. Drag a clip vertically
 * to move it between layers (handled in ClipBlock via laneH).
 */

import { useEditorStore } from '../../store/useEditorStore';
import { ClipBlock } from '../ClipBlock/ClipBlock';

export function FilmTrack({
  trackId,
  height = 36,
}: {
  trackId?: string;
  height?: number;
}) {
  const timeline = useEditorStore((s) => s.timeline);
  const assets = useEditorStore((s) => s.assets);
  const pxPerSec = useEditorStore((s) => s.pxPerSec);
  const setPlayhead = useEditorStore((s) => s.setPlayhead);
  const selectClip = useEditorStore((s) => s.selectClip);

  const track = trackId
    ? timeline?.tracks.find((t) => t.id === trackId)
    : timeline?.tracks.find((t) => t.kind === 'video');
  const clips = track?.clips ?? [];

  return (
    <div
      onPointerDown={(e) => {
        // Clicking bare lane: deselect and scrub here.
        const rect = e.currentTarget.getBoundingClientRect();
        selectClip(null);
        setPlayhead((e.clientX - rect.left) / pxPerSec);
      }}
      style={{ position: 'relative', height, background: 'rgba(255,255,255,.02)', borderRadius: 4 }}
    >
      {clips.map((clip) => (
        <ClipBlock
          key={clip.id}
          clip={clip}
          laneH={height}
          asset={clip.source.kind === 'asset' ? assets[clip.source.assetId] : undefined}
        />
      ))}
    </div>
  );
}
