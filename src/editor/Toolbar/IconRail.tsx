import { SlidersHorizontal, WandSparkles, X } from 'lucide-react';
import { colors } from '../../theme';

/** Narrow icon rail on the editor's far left; settings panel is active. */
export function IconRail() {
  const base: React.CSSProperties = {
    width: 30,
    height: 30,
    borderRadius: 8,
    background: 'transparent',
    border: 'none',
    color: colors.textFaint,
    display: 'grid',
    placeItems: 'center',
  };

  return (
    <div
      style={{
        width: 44,
        flexShrink: 0,
        borderRight: `1px solid ${colors.border7}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        padding: '10px 0',
        background: colors.bgBar,
      }}
    >
      <button className="hv-rail" style={base}>
        <X size={17} />
      </button>
      <button
        style={{ ...base, background: 'rgba(47,107,255,.16)', color: '#6f9bff' }}
      >
        <SlidersHorizontal size={17} />
      </button>
      <button className="hv-rail" style={base}>
        <WandSparkles size={17} />
      </button>
    </div>
  );
}
