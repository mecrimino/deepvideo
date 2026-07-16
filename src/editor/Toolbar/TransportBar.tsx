import {
  Captions,
  Code,
  Ellipsis,
  Minus,
  Play,
  Plus,
  Redo2,
  Settings,
  Undo2,
  Upload,
  Volume2,
} from 'lucide-react';
import { colors, fontMono } from '../../theme';

/** Transport row above the timeline: playback, timecode, zoom, track toggles. */
export function TransportBar() {
  const ghostBtn: React.CSSProperties = {
    width: 30,
    height: 30,
    borderRadius: 7,
    background: 'transparent',
    border: 'none',
    color: colors.textDim,
    display: 'grid',
    placeItems: 'center',
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <button className="hv-rail" style={ghostBtn}>
          <Undo2 size={15} />
        </button>
        <button className="hv-rail" style={ghostBtn}>
          <Redo2 size={15} />
        </button>
        <button
          style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            background: colors.accent,
            border: 'none',
            color: '#fff',
            display: 'grid',
            placeItems: 'center',
            marginLeft: 2,
          }}
        >
          <Play size={16} />
        </button>
      </div>

      <div style={{ fontFamily: fontMono, fontSize: 12.5, color: colors.textMid }}>
        08:44:21 <span style={{ color: colors.textMono }}>/ 10:00:27</span>
      </div>
      <span
        style={{
          fontSize: 11.5,
          color: colors.textDim,
          background: colors.raised,
          border: `1px solid ${colors.border8}`,
          padding: '3px 9px',
          borderRadius: 7,
        }}
      >
        1x
      </span>

      <div style={{ flex: 1 }} />

      {/* zoom slider (42%) */}
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
        <Minus size={14} color={colors.textDim} />
        <div
          style={{
            position: 'relative',
            width: 88,
            height: 3,
            borderRadius: 2,
            background: '#33333b',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: '42%',
              background: colors.accent,
              borderRadius: 2,
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: '42%',
              top: '50%',
              transform: 'translate(-50%,-50%)',
              width: 11,
              height: 11,
              borderRadius: '50%',
              background: '#fff',
              boxShadow: '0 1px 3px rgba(0,0,0,.5)',
            }}
          />
        </div>
        <Plus size={14} color={colors.textDim} />
      </div>

      <button className="hv-rail" style={ghostBtn}>
        <Settings size={15} />
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, color: colors.textDim }}>
        <Code size={16} />
        <Captions size={16} />
        <Volume2 size={15} />
        <Upload size={15} />
        <Ellipsis size={16} />
      </div>
    </div>
  );
}
