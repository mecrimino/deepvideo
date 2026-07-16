/**
 * Timeline: one horizontally-scrolling surface holding the ruler, caption /
 * video / audio tracks and the playhead — all positioned on the same
 * time→pixel mapping (store.pxPerSec). Keeps the playhead in view while
 * playing.
 */

import { GripVertical, Sparkles } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useEditorStore } from '../../store/useEditorStore';
import { colors } from '../../theme';
import { FilmTrack } from './FilmTrack';
import { Playhead } from './Playhead';
import { Ruler } from './Ruler';
import { TextTrack } from './TextTrack';
import { WaveTrack } from './WaveTrack';

/** One timeline lane with its drag grip. */
function TrackRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <GripVertical size={10} color="#4a4a52" style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

/**
 * Floating "Ctrl L · Add to Deep Video Agent" pill anchored to the selected
 * clip (reference behavior): clicking attaches the clip to the agent composer
 * as a mention chip.
 */
function AddToAgentPill() {
  const timeline = useEditorStore((s) => s.timeline);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const pxPerSec = useEditorStore((s) => s.pxPerSec);
  const addMentionFromSelection = useEditorStore((s) => s.addMentionFromSelection);
  const showChat = useAppStore((s) => s.showChat);
  const toggleChat = useAppStore((s) => s.toggleChat);

  const clip = timeline?.tracks
    .find((t) => t.kind === 'video')
    ?.clips.find((c) => c.id === selectedClipId);
  if (!clip) return null;

  // Anchored just below the selected clip on the film track (14px lane inset).
  const left = 14 + clip.range.endSec * pxPerSec - 4;

  return (
    <button
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => {
        addMentionFromSelection();
        if (!showChat) toggleChat();
      }}
      title="Attach this clip to your agent prompt (Ctrl+L)"
      style={{
        position: 'absolute',
        left,
        top: 48,
        transform: 'translateX(-100%)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '5px 10px 5px 6px',
        borderRadius: 8,
        background: '#0d0d10',
        border: `1px solid ${colors.border10}`,
        boxShadow: '0 8px 22px rgba(0,0,0,.55)',
        color: '#fff',
        fontSize: 11.5,
        fontWeight: 600,
        whiteSpace: 'nowrap',
        zIndex: 6,
        cursor: 'pointer',
      }}
    >
      <span
        style={{
          fontFamily: 'ui-monospace, monospace',
          fontSize: 10,
          fontWeight: 500,
          color: colors.textDim,
          background: 'rgba(255,255,255,.07)',
          border: `1px solid ${colors.border9}`,
          borderRadius: 5,
          padding: '2px 6px',
        }}
      >
        ctrl L
      </span>
      Add to Deep Video Agent
    </button>
  );
}

export function TimelinePanel() {
  const timeline = useEditorStore((s) => s.timeline);
  const pxPerSec = useEditorStore((s) => s.pxPerSec);
  const playheadSec = useEditorStore((s) => s.playheadSec);
  const playing = useEditorStore((s) => s.playing);
  const toggleChat = useAppStore((s) => s.toggleChat);
  const showChat = useAppStore((s) => s.showChat);
  const scrollRef = useRef<HTMLDivElement>(null);

  const durationSec = timeline?.durationSec ?? 0;
  const contentSec = Math.max(durationSec + 12, 60);
  const contentW = contentSec * pxPerSec;

  // Keep the playhead visible while playing.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !playing) return;
    const x = playheadSec * pxPerSec;
    if (x < el.scrollLeft + 40 || x > el.scrollLeft + el.clientWidth - 80) {
      el.scrollLeft = Math.max(0, x - 120);
    }
  }, [playheadSec, playing, pxPerSec]);

  return (
    <div style={{ padding: '0 16px 10px', position: 'relative' }}>
      <div
        ref={scrollRef}
        style={{ overflowX: 'auto', overflowY: 'hidden', paddingBottom: 2 }}
      >
        <div style={{ width: contentW, minWidth: '100%', position: 'relative' }}>
          <div style={{ paddingLeft: 14 }}>
            <div style={{ position: 'relative' }}>
              <Ruler contentSec={contentSec} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginLeft: -14 }}>
              <TrackRow>
                <TextTrack />
              </TrackRow>
              <TrackRow>
                <FilmTrack />
              </TrackRow>
              <TrackRow>
                <WaveTrack contentSec={contentSec} />
              </TrackRow>
            </div>
            <Playhead />
            <AddToAgentPill />
          </div>
        </div>
      </div>

      {!showChat && (
        <button
          onClick={toggleChat}
          className="hv-blue"
          style={{
            position: 'absolute',
            right: 22,
            bottom: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            padding: '7px 13px',
            borderRadius: 9,
            background: colors.accent,
            border: 'none',
            color: '#fff',
            fontSize: 12.5,
            fontWeight: 600,
            boxShadow: '0 8px 24px rgba(0,0,0,.5)',
            zIndex: 5,
          }}
        >
          <Sparkles size={14} />
          Ask Deep Video Agent
        </button>
      )}
    </div>
  );
}
