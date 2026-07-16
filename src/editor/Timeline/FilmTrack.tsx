/**
 * Video track: every clip from the timeline's video track, positioned by
 * real time. Click empty lane space to move the playhead.
 */

import { useEditorStore } from '../../store/useEditorStore';
import { ClipBlock } from '../ClipBlock/ClipBlock';

export function FilmTrack() {
  const timeline = useEditorStore((s) => s.timeline);
  const assets = useEditorStore((s) => s.assets);
  const pxPerSec = useEditorStore((s) => s.pxPerSec);
  const setPlayhead = useEditorStore((s) => s.setPlayhead);
  const selectClip = useEditorStore((s) => s.selectClip);

  const clips = timeline?.tracks.find((t) => t.kind === 'video')?.clips ?? [];

  return (
    <div
      onPointerDown={(e) => {
        // Clicking bare lane: deselect and scrub here.
        const rect = e.currentTarget.getBoundingClientRect();
        selectClip(null);
        setPlayhead((e.clientX - rect.left) / pxPerSec);
      }}
      style={{ position: 'relative', height: 36, background: 'rgba(255,255,255,.02)', borderRadius: 4 }}
    >
      {clips.map((clip) => (
        <ClipBlock
          key={clip.id}
          clip={clip}
          asset={clip.source.kind === 'asset' ? assets[clip.source.assetId] : undefined}
        />
      ))}
    </div>
  );
}
