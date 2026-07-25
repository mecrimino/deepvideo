import { ArrowRight, MessageSquare } from 'lucide-react';
import { themes } from '../data/themes';
import { useAppStore } from '../stores/useAppStore';
import { colors, fontMono, gradients } from '../styles/theme';

export function ThemeScreen() {
  const themeIdx = useAppStore((s) => s.themeIdx);
  const selectTheme = useAppStore((s) => s.selectTheme);
  const go = useAppStore((s) => s.go);
  const themeName = themes[themeIdx].name;

  return (
    <div style={{ minHeight: '100vh', background: colors.bgAlt, padding: '40px 24px 90px' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <MessageSquare size={19} color={colors.textFaint} />
          <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.02em', margin: 0 }}>
            Theme Selection
          </h2>
        </div>
        <p style={{ margin: '0 0 26px', color: colors.textFaint, fontSize: 14 }}>
          Choose the styling for motion graphic templates used in generated videos.
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 24,
            alignItems: 'start',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {themes.map((t, i) => (
              <div
                key={t.name}
                onClick={() => selectTheme(i)}
                className="hv-theme"
                style={{
                  position: 'relative',
                  display: 'flex',
                  gap: 14,
                  background: colors.panel,
                  border: `1px solid ${colors.border8}`,
                  borderRadius: 14,
                  padding: 14,
                  cursor: 'pointer',
                }}
              >
                {i === themeIdx && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      border: `2px solid ${colors.accent}`,
                      borderRadius: 14,
                      pointerEvents: 'none',
                    }}
                  />
                )}
                <div
                  style={{
                    width: 82,
                    height: 58,
                    borderRadius: 9,
                    background: gradients.placeholderSm,
                    flexShrink: 0,
                  }}
                />
                <div>
                  <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 4 }}>{t.name}</div>
                  <div style={{ fontSize: 12.5, color: colors.textFaint, lineHeight: 1.5 }}>
                    {t.desc}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              position: 'sticky',
              top: 40,
              background: colors.panel,
              border: `1px solid ${colors.border8}`,
              borderRadius: 16,
              padding: 22,
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Preview</div>
            <div
              style={{
                aspectRatio: '16/10',
                borderRadius: 12,
                background: gradients.placeholderLg,
                border: `1px solid ${colors.border6}`,
                display: 'grid',
                placeItems: 'center',
                position: 'relative',
              }}
            >
              <div
                style={{
                  fontFamily: fontMono,
                  fontSize: 11,
                  color: colors.textGhost,
                  textAlign: 'center',
                }}
              >
                MOTION TEMPLATE PREVIEW
                <br />
                <span style={{ color: colors.textDim }}>{themeName}</span>
              </div>
            </div>
            <div style={{ fontSize: 13, color: colors.textFaint, lineHeight: 1.55, marginTop: 16 }}>
              {themeName} applied. Motion graphics, transitions, and lower-thirds will follow this
              style across every generated segment.
            </div>
            <button
              onClick={() => go('setup')}
              className="hv-blue"
              style={{
                width: '100%',
                marginTop: 18,
                padding: 12,
                borderRadius: 11,
                background: colors.accent,
                border: 'none',
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
              }}
            >
              Continue
              <ArrowRight size={16} />
            </button>
            <button
              onClick={() => go('home')}
              className="hv-panel"
              style={{
                width: '100%',
                marginTop: 10,
                padding: 11,
                borderRadius: 11,
                background: 'transparent',
                border: `1px solid ${colors.border10}`,
                color: colors.textDim,
                fontSize: 13.5,
                fontWeight: 500,
              }}
            >
              Back
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
