import { steps } from '../data/steps';
import { colors } from '../theme';

export function ProcessingScreen() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: colors.bg,
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            border: '3px solid rgba(255,255,255,.12)',
            borderTopColor: colors.accent,
            margin: '0 auto 26px',
            animation: 'spin 1s linear infinite',
          }}
        />
        <div style={{ fontSize: 19, fontWeight: 600, marginBottom: 8 }}>
          Processing your request…
        </div>
        <div style={{ fontSize: 14, color: colors.textFaint, marginBottom: 26 }}>
          The agent is planning, sourcing footage, and assembling your timeline.
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 11,
            textAlign: 'left',
            background: colors.panel,
            border: `1px solid ${colors.border8}`,
            borderRadius: 14,
            padding: '16px 18px',
          }}
        >
          {steps.map((s) => (
            <div
              key={s.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 11,
                fontSize: 13.5,
                color: colors.textMid,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: colors.accent,
                  flexShrink: 0,
                  animation: 'pulseDot 1.4s ease-in-out infinite',
                  animationDelay: s.delay,
                }}
              />
              <span style={{ flex: 1 }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
