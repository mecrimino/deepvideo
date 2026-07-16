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
