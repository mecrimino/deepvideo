import { elements } from '../../data/timeline-mock';
import { gradients } from '../../theme';

/** Purple overlay-elements track (titles, transitions, SFX, ...). */
export function ElementsTrack() {
  return (
    <div style={{ display: 'flex', gap: 3, height: 30, overflow: 'hidden' }}>
      {elements.map((e) => (
        <div
          key={e.label}
          style={{
            position: 'relative',
            width: e.w,
            flexShrink: 0,
            borderRadius: 6,
            background: gradients.elementTrack,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '0 9px',
            overflow: 'hidden',
          }}
        >
          <e.icon size={12} color="#fff" style={{ flexShrink: 0, opacity: 0.9 }} />
          <span
            style={{
              fontSize: 10.5,
              color: '#fff',
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {e.label}
          </span>
        </div>
      ))}
    </div>
  );
}
