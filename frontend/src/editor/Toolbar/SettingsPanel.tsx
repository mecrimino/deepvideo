import { ChevronDown, Settings, X } from 'lucide-react';
import { animNames } from '../../data/anims';
import { useAppStore, type AnimTab } from '../../stores/useAppStore';
import { colors } from '../../styles/theme';

/** Floating settings card: layout preset + Enter/Exit animation grid. */
export function SettingsPanel() {
  const animIdx = useAppStore((s) => s.animIdx);
  const animTab = useAppStore((s) => s.animTab);
  const selectAnim = useAppStore((s) => s.selectAnim);
  const setAnimTab = useAppStore((s) => s.setAnimTab);
  const closeSettings = useAppStore((s) => s.closeSettings);

  const tabStyle = (tab: AnimTab): React.CSSProperties => ({
    flex: 1,
    border: 'none',
    borderRadius: 7,
    padding: '7px 0',
    fontSize: 12.5,
    fontWeight: 600,
    cursor: 'pointer',
    background: animTab === tab ? '#2e2e35' : 'transparent',
    color: animTab === tab ? '#fff' : colors.textFaint,
  });

  return (
    <div
      style={{
        position: 'absolute',
        left: 12,
        top: 12,
        zIndex: 6,
        width: 280,
        background: '#101014',
        border: `1px solid ${colors.border8}`,
        borderRadius: 14,
        padding: '15px 14px',
        boxShadow: '0 24px 60px rgba(0,0,0,.55)',
        maxHeight: 'calc(100% - 24px)',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600 }}
        >
          <Settings size={16} color={colors.textDim} />
          Settings
        </div>
        <button
          onClick={closeSettings}
          className="hv-rail"
          style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            background: 'transparent',
            border: 'none',
            color: colors.textGhost,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <X size={15} />
        </button>
      </div>

      <div style={{ fontSize: 12, color: colors.textFaint, marginBottom: 7 }}>Layout Preset</div>
      <button
        className="hv-input"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: colors.card,
          border: `1px solid ${colors.border8}`,
          borderRadius: 9,
          padding: '9px 12px',
          color: colors.textSoft,
          fontSize: 13,
          marginBottom: 18,
        }}
      >
        None
        <ChevronDown size={15} color={colors.textFaint} />
      </button>

      <div style={{ fontSize: 12.5, fontWeight: 600, color: colors.textMid, marginBottom: 10 }}>
        Animations
      </div>
      <div
        style={{
          display: 'flex',
          background: colors.card,
          border: `1px solid ${colors.border8}`,
          borderRadius: 9,
          padding: 3,
          marginBottom: 14,
        }}
      >
        <button onClick={() => setAnimTab('Enter')} style={tabStyle('Enter')}>
          Enter
        </button>
        <button onClick={() => setAnimTab('Exit')} style={tabStyle('Exit')}>
          Exit
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
        {animNames.map((name, i) => {
          const selected = i === animIdx;
          return (
            <button
              key={name}
              onClick={() => selectAnim(i)}
              className="hv-input"
              style={{
                position: 'relative',
                background: colors.card,
                border: `1px solid ${colors.border8}`,
                borderRadius: 9,
                padding: '9px 2px 6px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 5,
              }}
            >
              {selected && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    border: `1.5px solid ${colors.accent}`,
                    borderRadius: 9,
                    pointerEvents: 'none',
                  }}
                />
              )}
              <span
                style={{
                  width: 15,
                  height: 15,
                  borderRadius: '50%',
                  border: `1.5px solid ${selected ? '#6f9bff' : '#7f7f88'}`,
                  display: 'inline-block',
                }}
              />
              <span
                style={{
                  fontSize: 9.5,
                  color: selected ? '#6f9bff' : '#a7a7ad',
                  lineHeight: 1,
                  textAlign: 'center',
                }}
              >
                {name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
