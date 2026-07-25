/**
 * Center preview: real playback of the timeline. Shows the video-track clip
 * under the playhead (seeked into its source in/out window), narration audio
 * when the timeline has one, caption overlay, and a working fullscreen button.
 * The requestAnimationFrame clock that advances the playhead lives here.
 */

import { Maximize, Sparkles } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { TimelineClip } from '@deep-vision/shared';
import { audioClipsAtTime, clipAtTime, cueAtTime, fileUrl, useEditorStore } from '../../stores/useEditorStore';
import { colors } from '../../styles/theme';

const IMAGE_RE = /\.(png|jpe?g|webp|bmp|gif)$/i;

/** Keep a media element's clock glued to the project clock. */
function useMediaSync(
  ref: React.RefObject<HTMLVideoElement | HTMLAudioElement>,
  wantSec: number,
  playing: boolean,
  speed: number,
  muted: boolean,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.muted = muted;
    el.playbackRate = speed;
    const drift = Math.abs(el.currentTime - wantSec);
    if ((playing && drift > 0.3) || (!playing && drift > 0.03)) {
      el.currentTime = Math.max(0, wantSec);
    }
    if (playing && el.paused) void el.play().catch(() => {});
    if (!playing && !el.paused) el.pause();
  });
}

/**
 * One clip's media layer. The pane renders the CURRENT clip (visible, synced)
 * AND the NEXT clip (hidden, pre-loaded, pre-seeked to its in-point). Both are
 * keyed by clip id, so when the playhead crosses the boundary React keeps the
 * already-buffered element and just flips visibility — no mount/fetch/decode
 * gap at clip changes (the "shows late" lag).
 */
function ClipLayer({ clip, active }: { clip: NonNullable<ReturnType<typeof clipAtTime>>; active: boolean }) {
  const playheadSec = useEditorStore((s) => s.playheadSec);
  const playing = useEditorStore((s) => s.playing);
  const speed = useEditorStore((s) => s.speed);
  const muted = useEditorStore((s) => s.muted);
  const assets = useEditorStore((s) => s.assets);
  const ref = useRef<HTMLVideoElement>(null);

  const asset = clip.source.kind === 'asset' ? assets[clip.source.assetId] : undefined;
  const wantSec =
    clip.source.kind === 'asset'
      ? active
        ? clip.source.inSec + (playheadSec - clip.range.startSec)
        : clip.source.inSec // idle buffer: pre-seek to the in-point, ready to go
      : 0;

  useMediaSync(ref, wantSec, active && playing, speed, muted || !active);

  if (clip.source.kind !== 'asset' || !asset) return null;

  const layerStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    background: '#000',
    visibility: active ? 'visible' : 'hidden',
  };

  if (IMAGE_RE.test(asset.path)) {
    return <img src={fileUrl(asset.path)} alt={clip.label ?? ''} style={layerStyle} />;
  }

  return (
    <video ref={ref} src={fileUrl(asset.path)} preload="auto" playsInline style={layerStyle} />
  );
}

/**
 * One sound effect / music clip from an audio lane, synced to the project
 * clock: the element only exists while the playhead is inside the clip, so
 * nothing plays outside its range and nothing is decoded before it's needed.
 */
function AudioClipLayer({ clip }: { clip: TimelineClip }) {
  const playheadSec = useEditorStore((s) => s.playheadSec);
  const playing = useEditorStore((s) => s.playing);
  const speed = useEditorStore((s) => s.speed);
  const muted = useEditorStore((s) => s.muted);
  const assets = useEditorStore((s) => s.assets);
  const ref = useRef<HTMLAudioElement>(null);

  const asset = clip.source.kind === 'asset' ? assets[clip.source.assetId] : undefined;
  const wantSec =
    clip.source.kind === 'asset' ? clip.source.inSec + (playheadSec - clip.range.startSec) : 0;

  useMediaSync(ref, wantSec, playing, speed, muted);
  useEffect(() => {
    if (ref.current) ref.current.volume = Math.max(0, Math.min(1, clip.gain ?? 1));
  }, [clip.gain]);

  if (!asset) return null;
  return <audio ref={ref} src={fileUrl(asset.path)} preload="auto" />;
}

function NarrationAudio() {
  const timeline = useEditorStore((s) => s.timeline);
  const playheadSec = useEditorStore((s) => s.playheadSec);
  const playing = useEditorStore((s) => s.playing);
  const speed = useEditorStore((s) => s.speed);
  const muted = useEditorStore((s) => s.muted);
  const ref = useRef<HTMLAudioElement>(null);

  useMediaSync(ref, playheadSec, playing, speed, muted);

  if (!timeline?.audioPath) return null;
  return <audio ref={ref} src={fileUrl(timeline.audioPath)} preload="auto" />;
}

/** Center preview: fills the workspace, resize pill underneath. */
export function PreviewPane() {
  const timeline = useEditorStore((s) => s.timeline);
  const playheadSec = useEditorStore((s) => s.playheadSec);
  const playing = useEditorStore((s) => s.playing);
  const showCaptions = useEditorStore((s) => s.showCaptions);
  const advance = useEditorStore((s) => s.advance);
  const speed = useEditorStore((s) => s.speed);
  const togglePlay = useEditorStore((s) => s.togglePlay);
  const frameRef = useRef<HTMLDivElement>(null);

  // The project clock: advance the playhead while playing. Interval + real
  // time deltas (not rAF) so playback survives throttled/background panes.
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      advance(((now - last) / 1000) * speed);
      last = now;
    }, 33);
    return () => window.clearInterval(id);
  }, [playing, speed, advance]);

  const clip = clipAtTime(timeline, playheadSec);
  // The clip right after the current one — mounted hidden so it's already
  // buffered when the playhead reaches it (removes the boundary lag).
  const nextClip = clip ? clipAtTime(timeline, clip.range.endSec + 0.01) : null;
  const cue = cueAtTime(timeline, playheadSec);
  const isEmpty = !timeline || timeline.durationSec <= 0;

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '14px 18px 4px',
        background: colors.bgEditor,
        minHeight: 0,
      }}
    >
      <div style={{ flex: 1, minHeight: 0, width: '100%', display: 'grid', placeItems: 'center' }}>
        <div
          ref={frameRef}
          onClick={togglePlay}
          style={{
            height: '100%',
            maxWidth: '100%',
            aspectRatio: '16/9',
            borderRadius: 8,
            overflow: 'hidden',
            position: 'relative',
            border: `1px solid ${colors.border8}`,
            background: '#000',
            cursor: 'pointer',
          }}
        >
          {clip && <ClipLayer key={clip.id} clip={clip} active />}
          {nextClip && nextClip.id !== clip?.id && (
            <ClipLayer key={nextClip.id} clip={nextClip} active={false} />
          )}
          <NarrationAudio />
          {audioClipsAtTime(timeline, playheadSec).map((c) => (
            <AudioClipLayer key={c.id} clip={c} />
          ))}

          {clip?.source.kind === 'generate' && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'grid',
                placeItems: 'center',
                background: 'linear-gradient(160deg,#241b3a,#2b2140)',
              }}
            >
              <div style={{ textAlign: 'center', maxWidth: '70%' }}>
                <Sparkles size={26} color="#a68cff" style={{ marginBottom: 10 }} />
                <div style={{ fontSize: 13, color: '#c9b8ff', fontWeight: 600, marginBottom: 6 }}>
                  Generation slot
                </div>
                <div style={{ fontSize: 12, color: '#8f83b8', lineHeight: 1.5 }}>
                  “{clip.source.slot.prompt}” — no library clip cleared the match threshold. Add
                  matching footage to the library, or a future generator fills this slot.
                </div>
              </div>
            </div>
          )}

          {!clip && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'grid',
                placeItems: 'center',
                color: colors.textGhost,
                fontSize: 13,
              }}
            >
              {isEmpty ? 'Timeline is empty — add clips from the Media panel' : ''}
            </div>
          )}

          {showCaptions && cue && (
            <div
              style={{
                position: 'absolute',
                left: '8%',
                right: '8%',
                bottom: '7%',
                textAlign: 'center',
                pointerEvents: 'none',
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  background: 'rgba(0,0,0,.65)',
                  color: '#fff',
                  fontSize: 'clamp(12px, 2.2vmin, 20px)',
                  lineHeight: 1.35,
                  padding: '4px 12px',
                  borderRadius: 6,
                }}
              >
                {cue.text}
              </span>
            </div>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              void frameRef.current?.requestFullscreen().catch(() => {});
            }}
            title="Fullscreen"
            style={{
              position: 'absolute',
              top: 11,
              right: 11,
              width: 30,
              height: 30,
              borderRadius: 8,
              background: 'rgba(0,0,0,.55)',
              display: 'grid',
              placeItems: 'center',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <Maximize size={15} color={colors.textBright} />
          </button>
        </div>
      </div>
      {/* resize handle: drag vertically to trade preview space for timeline space */}
      <div
        onPointerDown={(e) => {
          e.preventDefault();
          const startY = e.clientY;
          const startH = useEditorStore.getState().timelineH;
          const move = (ev: PointerEvent) =>
            useEditorStore.getState().setTimelineH(startH - (ev.clientY - startY));
          const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
        }}
        title="Drag to resize the timeline"
        style={{
          padding: '5px 30px 3px',
          cursor: 'ns-resize',
          touchAction: 'none',
        }}
      >
        <div style={{ width: 44, height: 4, borderRadius: 3, background: '#3a3a42' }} />
      </div>
    </div>
  );
}
