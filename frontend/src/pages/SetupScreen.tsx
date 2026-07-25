import {
  ArrowRight,
  BadgeDollarSign,
  Ban,
  ChevronDown,
  ChevronLeft,
  Circle,
  CircleCheckBig,
  Info,
  Pencil,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';
import { models } from '../data/models';
import { themes } from '../data/themes';
import { BackgroundPicker, bgLabel } from '../components/BackgroundPicker';
import { VoicePicker } from '../components/VoicePicker';
import { estimateCostCredits, estimateLengthSec } from '../utils/credits';
import { brandOf, getActiveChannel } from '../utils/channel';
import { formatDuration } from '../utils/format';
import { effectiveScript, useAppStore } from '../stores/useAppStore';
import { colors, gradients } from '../styles/theme';

export function SetupScreen() {
  const modelIdx = useAppStore((s) => s.modelIdx);
  const themeIdx = useAppStore((s) => s.themeIdx);
  const voice = useAppStore((s) => s.voice);
  const go = useAppStore((s) => s.go);
  const approve = useAppStore((s) => s.approve);
  const plannedScript = useAppStore((s) => s.plannedScript);
  const assetSource = useAppStore((s) => s.assetSource);
  const selectAssetSource = useAppStore((s) => s.selectAssetSource);
  const backgroundOverride = useAppStore((s) => s.backgroundOverride);
  const setBackgroundOverride = useAppStore((s) => s.setBackgroundOverride);
  const [showBgPicker, setShowBgPicker] = useState(false);
  // Brand default unless overridden here for this generation.
  const effectiveBackground = backgroundOverride ?? brandOf(getActiveChannel()).background;

  const sel = models[modelIdx];
  const themeName = themes[themeIdx].name;

  // Real estimate: narration duration when audio is attached, otherwise the
  // locked/planned script length at narration pace; cost = model rate × minutes.
  const audio = useAppStore((s) => s.audio);
  const lengthSec = estimateLengthSec({
    script: audio ? undefined : plannedScript ?? effectiveScript(useAppStore.getState()),
    audioDurationSec: audio?.durationSec,
  });
  const prettyVoice = (name: string) => {
    const base = name.includes('_') ? name.slice(name.indexOf('_') + 1) : name;
    return base.charAt(0).toUpperCase() + base.slice(1);
  };
  const totalCredits = estimateCostCredits(sel.rateCreditsPerMin, lengthSec);
  const lengthLabel = `~${formatDuration(lengthSec)} min`;

  const costRows = [
    { k: 'Production model', v: sel.name.replace('Deep Video ', '') },
    { k: 'Theme', v: themeName.replace(' theme', '') },
    { k: 'Input', v: audio ? `Narration audio (${formatDuration(audio.durationSec)})` : 'Script / prompt' },
    { k: 'Voice', v: audio ? 'Uploaded audio' : prettyVoice(voice) },
    { k: 'Estimated length', v: lengthLabel },
    { k: 'Rate', v: sel.credits },
  ];

  const chipButton: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    fontSize: 13,
    color: colors.textSoft,
    background: colors.chip,
    border: `1px solid ${colors.border8}`,
    padding: '7px 12px',
    borderRadius: 9,
  };

  return (
    <div style={{ minHeight: '100vh', background: colors.bgAlt, padding: '26px 24px 90px' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        {/* progress strip */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 26,
            borderBottom: `1px solid ${colors.border8}`,
            paddingBottom: 14,
            marginBottom: 24,
            fontSize: 13.5,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: colors.textGhost }}>
            <Circle size={15} />
            Settings &amp; Details
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: colors.accent,
              fontWeight: 600,
            }}
          >
            <CircleCheckBig size={16} />
            Creative Setup
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: colors.textGhost }}>
            <ShieldCheck size={15} />
            Compliance &amp; Sourcing
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: colors.textGhost }}>
            <BadgeDollarSign size={15} />
            Estimated Cost
          </div>
        </div>

        {/* heading row — sticks to the top so Approve stays reachable */}
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 5,
            background: colors.bgAlt,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: 10,
            paddingBottom: 12,
            marginBottom: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={() => go('theme')}
              className="hv-dark"
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: colors.raised,
                border: `1px solid ${colors.border9}`,
                color: colors.textMid,
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <ChevronLeft size={18} />
            </button>
            <h2 style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-.02em', margin: 0 }}>
              Creative Setup
            </h2>
          </div>
          <button
            onClick={approve}
            className="hv-blue"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 18px',
              borderRadius: 11,
              background: colors.accent,
              border: 'none',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Approve and continue
            <ArrowRight size={16} />
          </button>
        </div>
        <p style={{ margin: '0 0 20px', color: colors.textFaint, fontSize: 14 }}>
          Review the agent's understanding, adjust settings, and see estimated cost before
          generation starts.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 340px',
            gap: 22,
            alignItems: 'start',
          }}
        >
          <div>
            {/* info banner */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: colors.banner,
                border: `1px solid ${colors.border7}`,
                borderRadius: 11,
                padding: '12px 14px',
                marginBottom: 18,
              }}
            >
              <Info size={16} color={colors.textFaint} />
              <span style={{ fontSize: 13, color: colors.textDim }}>
                Changes made here won't affect the original brand configuration.
              </span>
            </div>

            {/* creative assets */}
            <div
              style={{
                background: colors.panel,
                border: `1px solid ${colors.border8}`,
                borderRadius: 16,
                padding: 20,
                marginBottom: 18,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  fontSize: 14.5,
                  fontWeight: 600,
                  marginBottom: 16,
                }}
              >
                <Sparkles size={17} color={colors.textFaint} />
                Creative Assets
              </div>
              <div
                style={{
                  background: colors.card,
                  border: `1px solid ${colors.border6}`,
                  borderRadius: 12,
                  padding: '13px 14px',
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                    {effectiveBackground ? (
                      <img
                        src={`/files/${effectiveBackground}`}
                        alt=""
                        style={{ width: 62, height: 44, borderRadius: 9, objectFit: 'cover' }}
                      />
                    ) : (
                      <span
                        style={{
                          width: 62,
                          height: 44,
                          borderRadius: 9,
                          background: '#000',
                          border: `1px solid ${colors.border8}`,
                          display: 'inline-block',
                        }}
                      />
                    )}
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>Background</div>
                      <div style={{ fontSize: 11.5, color: colors.textFaint }}>
                        {effectiveBackground ? bgLabel(effectiveBackground) : 'None (black)'}
                      </div>
                    </div>
                  </div>
                  <button
                    className="hv-row"
                    style={chipButton}
                    onClick={() => setShowBgPicker((v) => !v)}
                  >
                    Change
                    <ChevronDown size={14} color={colors.textFaint} />
                  </button>
                </div>
                {showBgPicker && (
                  <div style={{ marginTop: 14 }}>
                    <BackgroundPicker
                      value={effectiveBackground}
                      onSelect={(p) => {
                        setBackgroundOverride(p);
                        setShowBgPicker(false);
                      }}
                    />
                  </div>
                )}
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: colors.card,
                  border: `1px solid ${colors.border6}`,
                  borderRadius: 12,
                  padding: '13px 14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                  <span
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 9,
                      background: gradients.themeSwatch,
                      display: 'inline-block',
                    }}
                  />
                  <div>
                    <div style={{ fontSize: 11.5, color: colors.textFaint }}>Theme</div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{themeName}</div>
                  </div>
                </div>
                <button className="hv-row" style={chipButton}>
                  Edit
                  <Pencil size={13} color={colors.textFaint} />
                </button>
              </div>
            </div>

            {/* footage source — pins where each scene's visuals come from */}
            <div
              style={{
                background: colors.panel,
                border: `1px solid ${colors.border8}`,
                borderRadius: 16,
                padding: 20,
                marginBottom: 18,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  fontSize: 14.5,
                  fontWeight: 600,
                  marginBottom: 6,
                }}
              >
                <Sparkles size={17} color={colors.textFaint} />
                Footage &amp; images
              </div>
              <div style={{ fontSize: 12.5, color: colors.textFaint, marginBottom: 14 }}>
                Where each scene's visuals come from. Motion graphics &amp; text
                animations are always planned automatically for titles, stats,
                quotes and calls-to-action.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {(
                  [
                    { id: 'mixed', label: 'Mixed', sub: 'Stock + AI + motion graphics' },
                    { id: 'stock_video', label: 'Stock video', sub: 'Pexels / Pixabay clips' },
                    { id: 'stock_image', label: 'Stock images', sub: 'Pexels / Pixabay photos' },
                    { id: 'ai_image', label: 'AI images', sub: 'Generated per scene' },
                  ] as const
                ).map((o) => {
                  const active = assetSource === o.id;
                  return (
                    <button
                      key={o.id}
                      onClick={() => selectAssetSource(o.id)}
                      className="hv-row"
                      style={{
                        textAlign: 'left',
                        background: active ? 'rgba(47,107,255,.12)' : colors.card,
                        border: `1px solid ${active ? colors.accent : colors.border6}`,
                        borderRadius: 12,
                        padding: '12px 14px',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: colors.textBright }}>
                        {o.label}
                      </div>
                      <div style={{ fontSize: 11.5, color: colors.textFaint, marginTop: 2 }}>
                        {o.sub}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* narration voice (skipped when the user attached their own audio) */}
            {!audio && <VoicePicker />}

            {/* blocklisting */}
            <div
              style={{
                background: colors.panel,
                border: `1px solid ${colors.border8}`,
                borderRadius: 16,
                padding: 20,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 6,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 9,
                    fontSize: 14.5,
                    fontWeight: 600,
                  }}
                >
                  <Ban size={16} color={colors.textFaint} />
                  Blocklisting
                </div>
                <button className="hv-row" style={chipButton}>
                  Edit
                  <Pencil size={13} color={colors.textFaint} />
                </button>
              </div>
              <div style={{ fontSize: 12.5, color: colors.textFaint, marginBottom: 16 }}>
                Choose which templates should not be used in videos.
              </div>
              <div
                style={{
                  width: 220,
                  position: 'relative',
                  background: '#1a1112',
                  border: '1px solid rgba(255,90,90,.28)',
                  borderRadius: 12,
                  overflow: 'hidden',
                }}
              >
                <div style={{ height: 74, background: gradients.blocked, position: 'relative' }}>
                  <div
                    style={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: 'rgba(220,60,60,.9)',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    <Ban size={14} color="#fff" />
                  </div>
                </div>
                <div style={{ padding: '10px 12px 12px' }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Dual Impact Karaoke</div>
                  <div style={{ fontSize: 11.5, color: colors.textFaint, marginTop: 2 }}>
                    A two-phase fullscreen subtitle style
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* estimated cost sidebar */}
          <div
            style={{
              position: 'sticky',
              top: 26,
              background: colors.panel,
              border: `1px solid ${colors.border8}`,
              borderRadius: 16,
              padding: 20,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                fontSize: 14.5,
                fontWeight: 600,
                marginBottom: 16,
              }}
            >
              <BadgeDollarSign size={17} color={colors.textFaint} />
              Estimated Cost
            </div>
            {costRows.map((c) => (
              <div
                key={c.k}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 0',
                  borderBottom: `1px solid ${colors.border6}`,
                  fontSize: 13.5,
                }}
              >
                <span style={{ color: colors.textFaint }}>{c.k}</span>
                <span style={{ color: colors.textBright, fontWeight: 500 }}>{c.v}</span>
              </div>
            ))}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: 14,
                marginTop: 4,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 600 }}>Total</span>
              <span style={{ fontSize: 18, fontWeight: 700, color: colors.accent }}>
                {totalCredits} credits
              </span>
            </div>
            <div
              style={{ fontSize: 11.5, color: colors.textGhost, marginTop: 6, lineHeight: 1.5 }}
            >
              Final cost is calculated from actual rendered duration.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
