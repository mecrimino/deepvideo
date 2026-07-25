/**
 * Timeline: a fixed lane gutter (name, lock, mute, delete) beside one
 * horizontally-scrolling surface holding the ruler, caption / video / audio
 * lanes and the playhead — all positioned on the same time→pixel mapping
 * (store.pxPerSec). Both columns are built from the same `rows` list, so the
 * heads stay aligned with their lanes whatever the layer count. Keeps the
 * playhead in view while playing.
 */

import { Lock, LockOpen, Sparkles, Trash2, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { Track } from '@deep-vision/shared';
import { useAppStore } from '../../stores/useAppStore';
import { audioLanes, laneTracks, useEditorStore } from '../../stores/useEditorStore';
import { colors } from '../../styles/theme';
import { FilmTrack } from './FilmTrack';
import { Playhead } from './Playhead';
import { Ruler } from './Ruler';
import { TextTrack } from './TextTrack';
import { WaveTrack } from './WaveTrack';

const GUTTER = 122;
const RULER_H = 23;

/** One timeline row: a real track, or the captions / narration strips. */
interface Row {
  key: string;
  height: number;
  label: string;
  track?: Track;
}

function IconBtn({
  title,
  onClick,
  active,
  danger,
  children,
}: {
  title: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="hv-rail"
      style={{
        width: 17,
        height: 17,
        flexShrink: 0,
        display: 'grid',
        placeItems: 'center',
        borderRadius: 5,
        border: 'none',
        background: active ? 'rgba(47,107,255,.2)' : 'transparent',
        color: active ? '#6f9bff' : danger ? '#c76b6b' : colors.textMono,
        cursor: 'pointer',
        padding: 0,
      }}
    >
      {children}
    </button>
  );
}

/** The lane's controls, pinned outside the horizontal scroll. */
function LaneHead({ row }: { row: Row }) {
  const toggleTrackLocked = useEditorStore((s) => s.toggleTrackLocked);
  const toggleTrackMuted = useEditorStore((s) => s.toggleTrackMuted);
  const removeTrack = useEditorStore((s) => s.removeTrack);
  const track = row.track;

  return (
    <div
      style={{
        height: row.height,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        paddingRight: 6,
        opacity: track?.locked ? 0.65 : 1,
      }}
    >
      <span
        title={row.label}
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 9.5,
          color: colors.textMono,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {row.label}
      </span>
      {track && (
        <>
          <IconBtn
            title={track.locked ? `Unlock ${track.name}` : `Lock ${track.name} — no edits, no drops`}
            active={track.locked}
            onClick={() => toggleTrackLocked(track.id)}
          >
            {track.locked ? <Lock size={11} /> : <LockOpen size={11} />}
          </IconBtn>
          {track.kind === 'audio' && (
            <IconBtn
              title={track.muted ? `Unmute ${track.name}` : `Mute ${track.name}`}
              danger={track.muted}
              onClick={() => toggleTrackMuted(track.id)}
            >
              {track.muted ? <VolumeX size={11} /> : <Volume2 size={11} />}
            </IconBtn>
          )}
          <IconBtn
            title={`Delete ${track.name} and everything on it (Ctrl+Z undoes it)`}
            danger
            onClick={() => removeTrack(track.id)}
          >
            <Trash2 size={11} />
          </IconBtn>
        </>
      )}
    </div>
  );
}

/**
 * "Ctrl L · Add to Deep Video Agent" pill in a FIXED spot at the timeline's
 * bottom-right (reference layout). Shown while a video clip is selected;
 * clicking attaches the clip to the agent composer as a mention chip.
 */
function AddToAgentPill() {
  const timeline = useEditorStore((s) => s.timeline);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const addMentionFromSelection = useEditorStore((s) => s.addMentionFromSelection);
  const showChat = useAppStore((s) => s.showChat);
  const toggleChat = useAppStore((s) => s.toggleChat);

  const clip = timeline?.tracks
    .find((t) => t.kind === 'video')
    ?.clips.find((c) => c.id === selectedClipId);
  if (!clip) return null;

  return (
    <button
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => {
        addMentionFromSelection();
        if (!showChat) toggleChat();
      }}
      title="Attach the selected clip to your agent prompt (Ctrl+L)"
      style={{
        position: 'absolute',
        right: 16,
        bottom: 8,
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

/** Drop results and drop errors, above the lanes and out of the way. */
function NoticeLine() {
  const notice = useEditorStore((s) => s.notice);
  if (!notice) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: 16,
        top: 2,
        zIndex: 7,
        padding: '3px 9px',
        borderRadius: 7,
        fontSize: 11,
        pointerEvents: 'none',
        background: notice.error ? '#2a1113' : 'rgba(13,13,16,.92)',
        border: `1px solid ${notice.error ? '#5c2226' : colors.border10}`,
        color: notice.error ? '#ffb3b3' : colors.textMid,
      }}
    >
      {notice.text}
    </div>
  );
}

export function TimelinePanel() {
  const timeline = useEditorStore((s) => s.timeline);
  const pxPerSec = useEditorStore((s) => s.pxPerSec);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const toggleChat = useAppStore((s) => s.toggleChat);
  const showChat = useAppStore((s) => s.showChat);
  const scrollRef = useRef<HTMLDivElement>(null);

  const timelineH = useEditorStore((s) => s.timelineH);

  const durationSec = timeline?.durationSec ?? 0;
  const contentSec = Math.max(durationSec + 12, 60);
  const contentW = contentSec * pxPerSec;

  // Lanes grow with the strip up to a comfortable ceiling, then the leftover
  // height becomes breathing room instead of stretching clips into fat blocks
  // (resizing should give space to edit in, like a real NLE). Fixed costs:
  // transport ~46, ruler 23, paddings/gaps ~28.
  const extra = Math.max(0, timelineH - 46 - RULER_H - 28 - (18 + 36 + 26));
  const textH = Math.min(24, Math.round(18 + extra * 0.14));
  const filmH = Math.min(56, Math.round(36 + extra * 0.6));
  const waveH = Math.min(40, Math.round(26 + extra * 0.26));

  // Keep the playhead visible while playing. Subscribed rather than selected:
  // the playhead moves ~30x a second and must not re-render every lane.
  useEffect(
    () =>
      useEditorStore.subscribe((s, prev) => {
        const el = scrollRef.current;
        if (!el || !s.playing || s.playheadSec === prev.playheadSec) return;
        const x = s.playheadSec * s.pxPerSec;
        if (x < el.scrollLeft + 40 || x > el.scrollLeft + el.clientWidth - 80) {
          el.scrollLeft = Math.max(0, x - 120);
        }
      }),
    [],
  );

  const rows: Row[] = timeline
    ? [
        { key: 'captions', height: textH, label: 'Captions' },
        ...laneTracks(timeline).map((l) => ({ key: l.id, height: filmH, label: l.name, track: l })),
        ...(timeline.audioPath ? [{ key: 'narration', height: waveH, label: 'Narration' }] : []),
        ...audioLanes(timeline).map((l) => ({ key: l.id, height: waveH, label: l.name, track: l })),
      ]
    : [];

  return (
    <div style={{ padding: '0 16px 2px', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        <div style={{ width: GUTTER, flexShrink: 0, paddingTop: RULER_H }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {rows.map((row) => (
              <LaneHead key={row.key} row={row} />
            ))}
          </div>
        </div>

        <div ref={scrollRef} style={{ flex: 1, minWidth: 0, overflowX: 'auto', overflowY: 'hidden' }}>
          <div style={{ width: contentW, minWidth: '100%', position: 'relative' }}>
            <Ruler contentSec={contentSec} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {rows.map((row) =>
                row.track ? (
                  <FilmTrack key={row.key} trackId={row.track.id} height={row.height} />
                ) : row.key === 'captions' ? (
                  <TextTrack key={row.key} height={row.height} />
                ) : (
                  <WaveTrack key={row.key} contentSec={contentSec} height={row.height} />
                ),
              )}
            </div>
            <Playhead />
          </div>
        </div>
      </div>

      <NoticeLine />
      <AddToAgentPill />

      {!showChat && !selectedClipId && (
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
