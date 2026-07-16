import { Sparkles } from 'lucide-react';
import { colors } from '../../theme';
import { ElementsTrack } from './ElementsTrack';
import { FilmTrack } from './FilmTrack';
import { Playhead } from './Playhead';
import { Ruler } from './Ruler';
import { WaveTrack } from './WaveTrack';

/** Timeline area: ruler + playhead + three tracks + floating agent button. */
export function TimelinePanel() {
  return (
    <div style={{ padding: '0 16px 12px', position: 'relative' }}>
      <Ruler />
      <Playhead />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, overflow: 'hidden' }}>
        <FilmTrack />
        <ElementsTrack />
        <WaveTrack />
      </div>
      <button
        className="hv-blue"
        style={{
          position: 'absolute',
          right: 22,
          bottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          padding: '8px 14px',
          borderRadius: 9,
          background: colors.accent,
          border: 'none',
          color: '#fff',
          fontSize: 12.5,
          fontWeight: 600,
          boxShadow: '0 8px 24px rgba(0,0,0,.5)',
        }}
      >
        <Sparkles size={14} />
        Add to Rush Agent
      </button>
    </div>
  );
}
