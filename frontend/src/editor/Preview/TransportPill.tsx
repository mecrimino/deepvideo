/**
 * Floating playback pill over the canvas (Rive-style): live timecode, frame
 * stepping, play/pause, loop toggle and speed. Everything drives the real
 * project clock in the editor store.
 */

import { ChevronDown, Pause, Play, Repeat, SkipBack, SkipForward, StepBack, StepForward } from 'lucide-react';
import { useState } from 'react';
import { useEditorStore } from '../../stores/useEditorStore';
import { colors } from '../../styles/theme';

const SPEEDS = [0.5, 1, 1.5, 2];

export function TransportPill() {
  const playing = useEditorStore((s) => s.playing);
  const togglePlay = useEditorStore((s) => s.togglePlay);
  const playheadSec = useEditorStore((s) => s.playheadSec);
  const setPlayhead = useEditorStore((s) => s.setPlayhead);
  const timeline = useEditorStore((s) => s.timeline);
  const speed = useEditorStore((s) => s.speed);
  const setSpeed = useEditorStore((s) => s.setSpeed);
  const loop = useEditorStore((s) => s.loop);
  const toggleLoop = useEditorStore((s) => s.toggleLoop);
  const [speedOpen, setSpeedOpen] = useState(false);

  const fps = timeline?.fps ?? 30;
  const dur = timeline?.durationSec ?? 0;
  const sec = Math.floor(playheadSec);
  const frame = Math.round((playheadSec - sec) * fps);

  const btn: React.CSSProperties = {
    width: 26,
    height: 26,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 6,
    border: 'none',
    background: 'transparent',
    color: colors.textMid,
    cursor: 'pointer',
    padding: 0,
  };

  return (
    <div
      className="glass"
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 14,
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: '5px 8px',
        borderRadius: 10,
        background: 'rgba(6,29,45,.88)',
        border: `1px solid ${colors.border8}`,
        boxShadow: '0 12px 34px -10px rgba(0,0,0,.75)',
        zIndex: 6,
        userSelect: 'none',
      }}
    >
      <span
        title="Current time — seconds and frames"
        style={{
          minWidth: 54,
          padding: '0 8px',
          fontSize: 11.5,
          color: colors.textSoft,
          fontWeight: 500,
          whiteSpace: 'nowrap',
        }}
      >
        {sec}s {frame}f
      </span>

      <button style={btn} className="hv-rail" title="Back to start" onClick={() => setPlayhead(0)}>
        <SkipBack size={14} />
      </button>
      <button
        style={btn}
        className="hv-rail"
        title="Previous frame"
        onClick={() => setPlayhead(playheadSec - 1 / fps)}
      >
        <StepBack size={14} />
      </button>
      <button
        onClick={togglePlay}
        title={playing ? 'Pause (Space)' : 'Play (Space)'}
        style={{ ...btn, color: colors.accentHi }}
        className="hv-rail"
      >
        {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
      </button>
      <button
        style={btn}
        className="hv-rail"
        title="Next frame"
        onClick={() => setPlayhead(playheadSec + 1 / fps)}
      >
        <StepForward size={14} />
      </button>
      <button style={btn} className="hv-rail" title="Jump to end" onClick={() => setPlayhead(dur)}>
        <SkipForward size={14} />
      </button>
      <button
        onClick={toggleLoop}
        title={loop ? 'Looping — click to play once' : 'Play once — click to loop'}
        style={{ ...btn, color: loop ? colors.accentHi : colors.textGhost }}
        className="hv-rail"
      >
        <Repeat size={14} />
      </button>

      <div style={{ width: 1, height: 18, background: colors.border8, margin: '0 5px' }} />

      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setSpeedOpen((v) => !v)}
          title="Playback speed"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            height: 26,
            padding: '0 8px',
            borderRadius: 6,
            border: 'none',
            background: 'transparent',
            color: colors.textMid,
            fontSize: 11.5,
            cursor: 'pointer',
          }}
          className="hv-rail"
        >
          {speed}x
          <ChevronDown size={12} color={colors.textGhost} />
        </button>
        {speedOpen && (
          <div
            style={{
              position: 'absolute',
              bottom: 32,
              right: 0,
              background: colors.raised,
              border: `1px solid ${colors.border9}`,
              borderRadius: 8,
              padding: 4,
              boxShadow: '0 16px 40px rgba(0,0,0,.6)',
              zIndex: 8,
            }}
          >
            {SPEEDS.map((s) => (
              <div
                key={s}
                className="hv-dark"
                onClick={() => {
                  setSpeed(s);
                  setSpeedOpen(false);
                }}
                style={{
                  padding: '5px 14px',
                  borderRadius: 5,
                  fontSize: 11.5,
                  cursor: 'pointer',
                  color: s === speed ? colors.accentHi : colors.textMid,
                  whiteSpace: 'nowrap',
                }}
              >
                {s}x
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
