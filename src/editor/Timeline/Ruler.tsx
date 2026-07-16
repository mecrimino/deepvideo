import { ruler3 } from '../../data/timeline-mock';
import { colors, fontMono } from '../../theme';

/** Monospace time ruler above the tracks. */
export function Ruler() {
  return (
    <div
      style={{
        display: 'flex',
        gap: 0,
        fontFamily: fontMono,
        fontSize: 10,
        color: colors.textMono,
        padding: '3px 0 6px',
        overflow: 'hidden',
      }}
    >
      {ruler3.map((m) => (
        <div key={m} style={{ width: 150, flexShrink: 0 }}>
          {m}
        </div>
      ))}
    </div>
  );
}
