/**
 * Transport row above the timeline: play/pause, seek-to-start, undo/redo,
 * live timecode, speed, zoom, caption + mute toggles, split-at-playhead and
 * export (real ffmpeg render with progress + download link).
 */

import {
  Captions,
  Check,
  Download,
  Loader2,
  Minus,
  Pause,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  Scissors,
  SlidersHorizontal,
  Undo2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useEditorStore } from '../../store/useEditorStore';
import { colors, fontMono } from '../../theme';

const SPEEDS = [0.5, 1, 1.5, 2];
const ZOOM_MIN = 2;
const ZOOM_MAX = 60;

function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.floor((sec - Math.floor(sec)) * 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export function TransportBar() {
  const playing = useEditorStore((s) => s.playing);
  const togglePlay = useEditorStore((s) => s.togglePlay);
  const playheadSec = useEditorStore((s) => s.playheadSec);
  const setPlayhead = useEditorStore((s) => s.setPlayhead);
  const timeline = useEditorStore((s) => s.timeline);
  const speed = useEditorStore((s) => s.speed);
  const setSpeed = useEditorStore((s) => s.setSpeed);
  const pxPerSec = useEditorStore((s) => s.pxPerSec);
  const setPxPerSec = useEditorStore((s) => s.setPxPerSec);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const canUndo = useEditorStore((s) => s.past.length > 0);
  const canRedo = useEditorStore((s) => s.future.length > 0);
  const muted = useEditorStore((s) => s.muted);
  const toggleMuted = useEditorStore((s) => s.toggleMuted);
  const showCaptions = useEditorStore((s) => s.showCaptions);
  const toggleCaptions = useEditorStore((s) => s.toggleCaptions);
  const splitAtPlayhead = useEditorStore((s) => s.splitAtPlayhead);
  const renderJob = useEditorStore((s) => s.renderJob);
  const requestRender = useEditorStore((s) => s.requestRender);
  const saveState = useEditorStore((s) => s.saveState);
  const toggleSettings = useAppStore((s) => s.toggleSettings);

  const ghostBtn = (active = false, disabled = false): React.CSSProperties => ({
    width: 30,
    height: 30,
    borderRadius: 7,
    background: active ? 'rgba(47,107,255,.16)' : 'transparent',
    border: 'none',
    color: active ? '#6f9bff' : disabled ? '#4a4a52' : colors.textDim,
    display: 'grid',
    placeItems: 'center',
    cursor: disabled ? 'default' : 'pointer',
  });

  const zoomPct = (pxPerSec - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN);

  const dragZoom = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const apply = (clientX: number) => {
      const rect = el.getBoundingClientRect();
      const p = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      setPxPerSec(ZOOM_MIN + p * (ZOOM_MAX - ZOOM_MIN));
    };
    apply(e.clientX);
    const move = (ev: PointerEvent) => apply(ev.clientX);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const rendering = renderJob?.status === 'running' || renderJob?.status === 'queued';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <button className="hv-rail" style={ghostBtn(false, !canUndo)} onClick={undo} title="Undo (Ctrl+Z)">
          <Undo2 size={15} />
        </button>
        <button className="hv-rail" style={ghostBtn(false, !canRedo)} onClick={redo} title="Redo (Ctrl+Y)">
          <Redo2 size={15} />
        </button>
        <button className="hv-rail" style={ghostBtn()} onClick={() => setPlayhead(0)} title="Back to start">
          <RotateCcw size={14} />
        </button>
        <button
          className="hv-blue"
          onClick={togglePlay}
          title="Play/Pause (Space)"
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            background: colors.accent,
            border: 'none',
            color: '#fff',
            display: 'grid',
            placeItems: 'center',
            marginLeft: 2,
          }}
        >
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <button className="hv-rail" style={ghostBtn()} onClick={splitAtPlayhead} title="Split clip at playhead (S)">
          <Scissors size={14} />
        </button>
      </div>

      <div style={{ fontFamily: fontMono, fontSize: 12.5, color: colors.textMid }}>
        {fmtClock(playheadSec)}{' '}
        <span style={{ color: colors.textMono }}>/ {fmtClock(timeline?.durationSec ?? 0)}</span>
      </div>
      <button
        onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])}
        title="Playback speed"
        style={{
          fontSize: 11.5,
          color: colors.textDim,
          background: colors.raised,
          border: `1px solid ${colors.border8}`,
          padding: '3px 9px',
          borderRadius: 7,
          cursor: 'pointer',
        }}
      >
        {speed}x
      </button>

      <span style={{ fontSize: 10.5, color: colors.textGhost }}>
        {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Save failed' : ''}
      </span>

      <div style={{ flex: 1 }} />

      {/* zoom slider */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: colors.card,
          border: `1px solid ${colors.border8}`,
          borderRadius: 9,
          padding: '6px 10px',
        }}
      >
        <button style={{ ...ghostBtn(), width: 18, height: 18 }} onClick={() => setPxPerSec(pxPerSec - 4)}>
          <Minus size={14} />
        </button>
        <div
          onPointerDown={dragZoom}
          style={{
            position: 'relative',
            width: 88,
            height: 12,
            display: 'flex',
            alignItems: 'center',
            cursor: 'pointer',
          }}
        >
          <div style={{ position: 'absolute', left: 0, right: 0, height: 3, borderRadius: 2, background: '#33333b' }} />
          <div
            style={{
              position: 'absolute',
              left: 0,
              width: `${zoomPct * 100}%`,
              height: 3,
              background: colors.accent,
              borderRadius: 2,
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: `${zoomPct * 100}%`,
              transform: 'translateX(-50%)',
              width: 11,
              height: 11,
              borderRadius: '50%',
              background: '#fff',
              boxShadow: '0 1px 3px rgba(0,0,0,.5)',
            }}
          />
        </div>
        <button style={{ ...ghostBtn(), width: 18, height: 18 }} onClick={() => setPxPerSec(pxPerSec + 4)}>
          <Plus size={14} />
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button className="hv-rail" style={ghostBtn(showCaptions)} onClick={toggleCaptions} title="Toggle captions">
          <Captions size={16} />
        </button>
        <button className="hv-rail" style={ghostBtn(false)} onClick={toggleMuted} title="Mute">
          {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
        </button>
        <button className="hv-rail" style={ghostBtn()} onClick={toggleSettings} title="Animation settings">
          <SlidersHorizontal size={15} />
        </button>

        {/* export */}
        {renderJob?.status === 'done' && renderJob.url ? (
          <a
            href={renderJob.url}
            download
            target="_blank"
            rel="noreferrer"
            title="Download export"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 10px',
              borderRadius: 8,
              background: 'rgba(56,160,90,.18)',
              border: '1px solid rgba(56,160,90,.4)',
              color: '#6fd08e',
              fontSize: 12,
              textDecoration: 'none',
            }}
          >
            <Check size={13} />
            Download
          </a>
        ) : (
          <button
            className="hv-rail"
            style={{ ...ghostBtn(false, rendering), width: 'auto', padding: '0 8px', gap: 6, display: 'flex', alignItems: 'center' }}
            onClick={() => void requestRender()}
            disabled={rendering}
            title="Export video (ffmpeg)"
          >
            {rendering ? (
              <>
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                <span style={{ fontSize: 11.5 }}>{Math.round((renderJob?.progress ?? 0) * 100)}%</span>
              </>
            ) : (
              <Download size={15} />
            )}
          </button>
        )}
        {renderJob?.status === 'failed' && (
          <span style={{ fontSize: 10.5, color: '#e46a6a', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={renderJob.error}>
            Render failed
          </span>
        )}
      </div>
    </div>
  );
}
