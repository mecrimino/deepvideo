import { ChevronDown, Play, X } from 'lucide-react';
import { models, previewFormats } from '../data/models';
import { useAppStore } from '../store/useAppStore';
import { colors, fontMono, gradients } from '../theme';
import { GradientLogo } from './GradientLogo';

/** "Select Production Model" modal — Home screen, opened from the model pill. */
export function ModelModal() {
  const modelIdx = useAppStore((s) => s.modelIdx);
  const selectModel = useAppStore((s) => s.selectModel);
  const closeModel = useAppStore((s) => s.closeModel);
  const sel = models[modelIdx];

  return (
    <div
      onClick={closeModel}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(4,4,6,.72)',
        backdropFilter: 'blur(6px)',
        zIndex: 20,
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 900,
          background: '#111114',
          border: `1px solid ${colors.border10}`,
          borderRadius: 20,
          padding: 28,
          boxShadow: '0 40px 100px rgba(0,0,0,.6)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            marginBottom: 22,
          }}
        >
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.02em' }}>
              Select Production Model
            </div>
            <div style={{ fontSize: 14, color: colors.textFaint, marginTop: 4 }}>
              Choose the intelligence level for your content.
            </div>
          </div>
          <button
            onClick={closeModel}
            className="hv-dark"
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              background: colors.raised,
              border: `1px solid ${colors.border9}`,
              color: colors.textDim,
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {models.map((m, i) => {
              const selected = i === modelIdx;
              return (
                <div
                  key={m.name}
                  onClick={() => selectModel(i)}
                  style={{
                    position: 'relative',
                    background: colors.card,
                    border: `1px solid ${colors.border8}`,
                    borderRadius: 15,
                    padding: 16,
                    cursor: 'pointer',
                  }}
                >
                  {selected && (
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        border: `2px solid ${colors.accent}`,
                        borderRadius: 15,
                        pointerEvents: 'none',
                      }}
                    />
                  )}
                  {m.popular && (
                    <div
                      style={{
                        position: 'absolute',
                        top: -9,
                        left: 16,
                        background: colors.accent,
                        color: '#fff',
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '2px 9px',
                        borderRadius: 999,
                      }}
                    >
                      Most popular
                    </div>
                  )}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <GradientLogo size={34} radius={9} />
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 600 }}>{m.name}</div>
                        <div
                          style={{
                            fontSize: 12.5,
                            color: colors.textFaint,
                            marginTop: 2,
                            maxWidth: 230,
                          }}
                        >
                          {m.blurb}
                        </div>
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: 11.5,
                        color: colors.textMid,
                        background: colors.chip,
                        padding: '3px 9px',
                        borderRadius: 999,
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}
                    >
                      {m.credits}
                    </div>
                  </div>
                  {selected && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginTop: 14,
                        paddingTop: 13,
                        borderTop: `1px solid ${colors.border7}`,
                      }}
                    >
                      <span style={{ fontSize: 13, color: colors.textDim }}>Reasoning Effort</span>
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 7,
                          fontSize: 13,
                          color: colors.textSoft,
                          background: colors.chip,
                          padding: '5px 11px',
                          borderRadius: 8,
                        }}
                      >
                        Medium
                        <ChevronDown size={14} color={colors.textFaint} />
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div>
            <div
              style={{
                aspectRatio: '16/10',
                borderRadius: 13,
                background: gradients.placeholderLg,
                position: 'relative',
                display: 'grid',
                placeItems: 'center',
                border: `1px solid ${colors.border6}`,
              }}
            >
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,.14)',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <Play size={22} color="#fff" />
              </div>
              <div
                style={{
                  position: 'absolute',
                  left: 12,
                  top: 12,
                  fontFamily: fontMono,
                  fontSize: 10,
                  color: colors.textMono,
                }}
              >
                PREVIEW / {sel.name}
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 14,
              }}
            >
              <div style={{ fontSize: 17, fontWeight: 700 }}>{sel.name}</div>
              <div
                style={{
                  fontSize: 11.5,
                  color: colors.textMid,
                  background: colors.chip,
                  padding: '3px 9px',
                  borderRadius: 999,
                }}
              >
                {sel.credits}
              </div>
            </div>
            <div
              style={{
                fontSize: 12,
                color: colors.textFaint,
                margin: '14px 0 7px',
                textTransform: 'uppercase',
                letterSpacing: '.06em',
              }}
            >
              Preview Format
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {previewFormats.map((f) => (
                <span
                  key={f}
                  style={{
                    fontSize: 12.5,
                    color: colors.textSoft,
                    background: colors.chip,
                    padding: '4px 11px',
                    borderRadius: 8,
                  }}
                >
                  {f}
                </span>
              ))}
            </div>
            <div
              style={{ fontSize: 13, color: colors.textFaint, lineHeight: 1.55, marginTop: 14 }}
            >
              {sel.desc}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
          <button
            onClick={closeModel}
            className="hv-dark"
            style={{
              padding: '10px 18px',
              borderRadius: 10,
              background: colors.control,
              border: `1px solid ${colors.border9}`,
              color: colors.textSoft,
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            Discard
          </button>
          <button
            onClick={closeModel}
            className="hv-blue"
            style={{
              padding: '10px 20px',
              borderRadius: 10,
              background: colors.accent,
              border: 'none',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Select Model
          </button>
        </div>
      </div>
    </div>
  );
}
