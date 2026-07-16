import { wave } from '../../data/timeline-mock';
import { colors } from '../../theme';

/** Amber narration-audio waveform track. */
export function WaveTrack() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        height: 32,
        background: '#171310',
        border: '1px solid rgba(217,169,58,.18)',
        borderRadius: 5,
        padding: '0 4px',
        overflow: 'hidden',
      }}
    >
      {wave.map((h, i) => (
        <div
          key={i}
          style={{
            width: 2,
            flexShrink: 0,
            height: `${h}%`,
            background: colors.waveform,
            borderRadius: 1,
          }}
        />
      ))}
    </div>
  );
}
