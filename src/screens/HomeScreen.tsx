import {
  ArrowUp,
  ArrowUpRight,
  ChevronDown,
  FileText,
  Mic,
  Plus,
} from 'lucide-react';
import { Avatar } from '../components/Avatar';
import { GradientLogo } from '../components/GradientLogo';
import { ModelModal } from '../components/ModelModal';
import { models } from '../data/models';
import { recents } from '../data/recents';
import { useAppStore } from '../store/useAppStore';
import { colors, fontMono, gradients } from '../theme';

export function HomeScreen() {
  const prompt = useAppStore((s) => s.prompt);
  const setPrompt = useAppStore((s) => s.setPrompt);
  const modelIdx = useAppStore((s) => s.modelIdx);
  const showModel = useAppStore((s) => s.showModel);
  const showPlus = useAppStore((s) => s.showPlus);
  const togglePlus = useAppStore((s) => s.togglePlus);
  const openModel = useAppStore((s) => s.openModel);
  const go = useAppStore((s) => s.go);

  return (
    <div
      style={{
        position: 'relative',
        minHeight: '100vh',
        overflow: 'hidden',
        background: gradients.homeHero,
      }}
    >
      {/* top bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '18px 30px',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 11,
            fontWeight: 700,
            fontSize: 17,
            letterSpacing: '-.02em',
          }}
        >
          <GradientLogo />
          Deep Video
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(20,20,23,.7)',
              backdropFilter: 'blur(8px)',
              border: `1px solid ${colors.border9}`,
              padding: '7px 13px',
              borderRadius: 999,
              fontSize: 13,
              color: colors.textMid,
              fontWeight: 500,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: colors.gold,
                display: 'inline-block',
              }}
            />
            1,240 credits
          </div>
          <Avatar size={34} />
        </div>
      </div>

      {/* hero + prompt */}
      <div
        style={{
          maxWidth: 840,
          margin: '8vh auto 0',
          padding: '0 24px',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 30 }}>
          <h1 style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-.025em', margin: '0 0 10px' }}>
            What will you create today?
          </h1>
          <p style={{ margin: 0, color: colors.textDim, fontSize: 16 }}>
            Describe an idea and the agent produces a finished video — script, footage, motion
            graphics, and edit.
          </p>
        </div>

        <div
          style={{
            position: 'relative',
            background: colors.panel,
            border: `1px solid ${colors.border9}`,
            borderRadius: 24,
            padding: '20px 20px 14px',
            boxShadow: '0 26px 70px rgba(0,0,0,.5)',
          }}
        >
          <textarea
            rows={3}
            placeholder="Create a space exploration story..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              color: colors.text,
              fontSize: 17,
              lineHeight: 1.5,
              minHeight: 66,
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
            <div style={{ position: 'relative' }}>
              <button
                onClick={togglePlus}
                className="hv-dark"
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: '50%',
                  background: colors.control,
                  border: `1px solid ${colors.border9}`,
                  color: '#cfcfd4',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <Plus size={19} />
              </button>
              {showPlus && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 48,
                    left: 0,
                    width: 200,
                    background: colors.raised,
                    border: `1px solid ${colors.border10}`,
                    borderRadius: 14,
                    padding: 6,
                    boxShadow: '0 18px 44px rgba(0,0,0,.55)',
                    zIndex: 5,
                  }}
                >
                  <div
                    className="hv-dark"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 11,
                      padding: '10px 11px',
                      borderRadius: 10,
                      fontSize: 14,
                      color: colors.textSoft,
                      cursor: 'pointer',
                    }}
                  >
                    <FileText size={17} color={colors.textDim} />
                    Custom Script
                  </div>
                  <div
                    className="hv-dark"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 11,
                      padding: '10px 11px',
                      borderRadius: 10,
                      fontSize: 14,
                      color: colors.textSoft,
                      cursor: 'pointer',
                    }}
                  >
                    <Mic size={17} color={colors.textDim} />
                    Custom Audio
                  </div>
                </div>
              )}
            </div>
            <button
              className="hv-dark"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: colors.control,
                border: `1px solid ${colors.border9}`,
                padding: '5px 12px 5px 5px',
                borderRadius: 999,
                color: colors.textSoft,
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              <Avatar size={24} />
              Amish channel1
              <ChevronDown size={15} color={colors.textFaint} />
            </button>
            <div style={{ flex: 1 }} />
            <button
              onClick={openModel}
              className="hv-dark"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: colors.control,
                border: `1px solid ${colors.border9}`,
                padding: '9px 13px',
                borderRadius: 999,
                color: colors.textSoft,
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              {models[modelIdx].name}
              <ChevronDown size={15} color={colors.textFaint} />
            </button>
            <button
              onClick={() => go('theme')}
              className="hv-blue"
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: colors.accent,
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                border: 'none',
              }}
            >
              <ArrowUp size={20} />
            </button>
          </div>
        </div>

        {/* recent generations */}
        <div style={{ marginTop: 42 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 600, color: colors.textBright }}>
              Recent Generations
            </div>
            <a
              href="#"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 13,
                color: colors.textDim,
              }}
            >
              View all
              <ArrowUpRight size={14} />
            </a>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
            {recents.map((r) => (
              <div
                key={r.title}
                className="hv-card"
                style={{
                  background: colors.panel,
                  border: `1px solid ${colors.border7}`,
                  borderRadius: 14,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    aspectRatio: '16/10',
                    background: gradients.placeholder,
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      left: 9,
                      bottom: 8,
                      fontFamily: fontMono,
                      fontSize: 10,
                      color: colors.textMono,
                      letterSpacing: '.04em',
                    }}
                  >
                    {r.tag}
                  </div>
                  <div
                    style={{
                      position: 'absolute',
                      right: 8,
                      bottom: 8,
                      background: 'rgba(0,0,0,.6)',
                      padding: '2px 7px',
                      borderRadius: 6,
                      fontSize: 11,
                      color: colors.textMid,
                    }}
                  >
                    {r.dur}
                  </div>
                </div>
                <div style={{ padding: '10px 12px 12px' }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: colors.textSoft,
                      lineHeight: 1.35,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {r.title}
                  </div>
                  <div style={{ fontSize: 11, color: colors.textGhost, marginTop: 4 }}>{r.meta}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showModel && <ModelModal />}
    </div>
  );
}
