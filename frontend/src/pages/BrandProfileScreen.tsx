/**
 * Brand profiles — per-channel production settings (video-style setup):
 *   Overview        channel identity (real YouTube data) + niche + video language
 *   Voiceover       Kokoro voice picker with real audio previews
 *   Creative Assets motion-template theme + footage source
 *   Compliance      disable animations/overlays/effects + template blocklist
 * Every change is saved to the channel's brand profile (localStorage) and sent
 * with each generation run.
 */

import { useState, useSyncExternalStore } from 'react';
import { ArrowLeft, Check, Eye, Image as ImageIcon, Mic, Shield } from 'lucide-react';
import { BackgroundPicker } from '../components/BackgroundPicker';
import { VoicePicker } from '../components/VoicePicker';
import { Avatar } from '../components/Avatar';
import { themes } from '../data/themes';
import { fmtSubscribers } from '../services/youtube';
import {
  brandOf,
  getActiveChannel,
  getChannelsState,
  subscribeChannel,
  updateBrand,
} from '../utils/channel';
import { useAppStore } from '../stores/useAppStore';
import { colors, gradients } from '../styles/theme';

type Tab = 'overview' | 'voice' | 'assets' | 'compliance';

const TABS: Array<{ id: Tab; icon: typeof Eye; label: string }> = [
  { id: 'overview', icon: Eye, label: 'Overview' },
  { id: 'voice', icon: Mic, label: 'Voiceover' },
  { id: 'assets', icon: ImageIcon, label: 'Creative Assets' },
  { id: 'compliance', icon: Shield, label: 'Compliance' },
];

/** Real motion-template types from core/agents/graphics/templates.py. */
const MOTION_TEMPLATES = [
  { type: 'title', label: 'Title Card' },
  { type: 'subtitle', label: 'Subtitle Text' },
  { type: 'lower_third', label: 'Lower Third' },
  { type: 'stat', label: 'Stat / Number' },
  { type: 'chart', label: 'Chart' },
  { type: 'timeline', label: 'Timeline' },
  { type: 'map', label: 'Map' },
  { type: 'callout', label: 'Callout' },
  { type: 'highlight', label: 'Highlight' },
  { type: 'kinetic', label: 'Kinetic Text' },
];

const LANGUAGES = [
  'American English', 'British English', 'Hindi', 'Spanish', 'French',
  'Italian', 'Brazilian Portuguese', 'Japanese', 'Mandarin Chinese',
];

export function BrandProfileScreen() {
  const go = useAppStore((s) => s.go);
  useSyncExternalStore(subscribeChannel, getChannelsState);
  const channel = getActiveChannel();
  const [tab, setTab] = useState<Tab>('overview');
  const [nicheDraft, setNicheDraft] = useState(channel?.niche ?? '');

  if (!channel) {
    return (
      <div style={{ minHeight: '100vh', background: colors.bgAlt, display: 'grid', placeItems: 'center' }}>
        <div style={{ textAlign: 'center', color: colors.textFaint }}>
          <div style={{ marginBottom: 12 }}>No channel connected yet.</div>
          <button onClick={() => go('home')} style={saveBtnStyle}>
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  const brand = brandOf(channel);
  const patch = (p: Parameters<typeof updateBrand>[1]) => updateBrand(channel.id, p);

  return (
    <div style={{ minHeight: '100vh', background: colors.bgAlt, padding: '0 24px 60px' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        {/* sticky header */}
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 5,
            background: colors.bgAlt,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '20px 0 14px',
            borderBottom: `1px solid ${colors.border8}`,
            marginBottom: 20,
          }}
        >
          <button
            onClick={() => go('home')}
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
              cursor: 'pointer',
            }}
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em' }}>
              Brand profiles
            </div>
            <div style={{ fontSize: 12.5, color: colors.textFaint }}>
              Channel-specific editing style, voice and compliance — applied to every video.
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <button onClick={() => go('home')} className="hv-blue" style={saveBtnStyle}>
            <Check size={15} /> Save brand profile
          </button>
        </div>

        {/* tabs */}
        <div style={{ display: 'flex', gap: 22, marginBottom: 22 }}>
          {TABS.map((t) => {
            const active = tab === t.id;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  background: 'none',
                  border: 'none',
                  borderBottom: `2px solid ${active ? colors.accent : 'transparent'}`,
                  color: active ? colors.accent : colors.textDim,
                  fontSize: 14,
                  fontWeight: active ? 600 : 500,
                  padding: '4px 2px 10px',
                  cursor: 'pointer',
                }}
              >
                <Icon size={16} />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* ---------------- Overview ---------------- */}
        {tab === 'overview' && (
          <div style={panelStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
              {channel.thumb ? (
                <img
                  src={channel.thumb}
                  alt=""
                  style={{ width: 54, height: 54, borderRadius: '50%', objectFit: 'cover' }}
                />
              ) : (
                <Avatar size={54} />
              )}
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{channel.title}</div>
                <div style={{ fontSize: 12.5, color: colors.textFaint }}>
                  {channel.handle} · {fmtSubscribers(channel.subscribers)} subscribers
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <label style={fieldLabelStyle}>
                Channel niche
                <input
                  value={nicheDraft}
                  onChange={(e) => setNicheDraft(e.target.value)}
                  onBlur={() => {
                    if (nicheDraft.trim()) updateBrand(channel.id, {}, nicheDraft.trim());
                  }}
                  placeholder="e.g. senior fitness"
                  style={fieldInputStyle}
                />
              </label>
              <label style={fieldLabelStyle}>
                Video language
                <select
                  value={brand.language}
                  onChange={(e) => patch({ language: e.target.value })}
                  style={fieldInputStyle}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        )}

        {/* ---------------- Voiceover ---------------- */}
        {tab === 'voice' && (
          <VoicePicker value={brand.voice} onSelect={(v) => patch({ voice: v })} />
        )}

        {/* ---------------- Creative Assets ---------------- */}
        {tab === 'assets' && (
          <>
            <div style={{ ...panelStyle, marginBottom: 18 }}>
              <div style={sectionTitleStyle}>Background image</div>
              <div style={{ fontSize: 12.5, color: colors.textFaint, marginBottom: 14 }}>
                The backdrop behind motion-graphic scenes. Choose one from the asset library.
              </div>
              <BackgroundPicker
                value={brand.background}
                onSelect={(background) => patch({ background })}
              />
            </div>

            <div style={{ ...panelStyle, marginBottom: 18 }}>
              <div style={sectionTitleStyle}>Theme selection</div>
              <div style={{ fontSize: 12.5, color: colors.textFaint, marginBottom: 14 }}>
                Choose the styling for motion-graphic templates used in generated videos.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {themes.map((t, i) => {
                  const active = brand.themeIdx === i;
                  return (
                    <button
                      key={t.name}
                      onClick={() => patch({ themeIdx: i })}
                      className="hv-row"
                      style={{
                        textAlign: 'left',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        background: active ? 'rgba(47,107,255,.10)' : colors.card,
                        border: `1px solid ${active ? colors.accent : colors.border8}`,
                        borderRadius: 12,
                        padding: '13px 15px',
                        cursor: 'pointer',
                      }}
                    >
                      <span
                        style={{
                          width: 52,
                          height: 34,
                          borderRadius: 7,
                          background: gradients.themeSwatch,
                          flexShrink: 0,
                        }}
                      />
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: colors.textBright }}>
                          {t.name}
                        </div>
                        <div style={{ fontSize: 12, color: colors.textFaint, lineHeight: 1.4 }}>
                          {t.desc}
                        </div>
                      </div>
                      {active && <Check size={16} color={colors.accent} style={{ marginLeft: 'auto', flexShrink: 0 }} />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={panelStyle}>
              <div style={sectionTitleStyle}>Footage &amp; images</div>
              <div style={{ fontSize: 12.5, color: colors.textFaint, marginBottom: 14 }}>
                Where each scene's visuals come from.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {(
                  [
                    { id: 'mixed', label: 'Mixed', sub: 'Stock + AI where needed' },
                    { id: 'stock_video', label: 'Stock video', sub: 'Pexels / Pixabay clips' },
                    { id: 'stock_image', label: 'Stock images', sub: 'Pexels / Pixabay photos' },
                    { id: 'ai_image', label: 'AI images', sub: 'Generated per scene' },
                  ] as const
                ).map((o) => {
                  const active = brand.assetSource === o.id;
                  return (
                    <button
                      key={o.id}
                      onClick={() => patch({ assetSource: o.id })}
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
          </>
        )}

        {/* ---------------- Compliance ---------------- */}
        {tab === 'compliance' && (
          <>
            <div style={{ ...panelStyle, marginBottom: 18 }}>
              {(
                [
                  {
                    key: 'disableAnimations',
                    label: 'Disable animations',
                    desc: 'Generate videos without motion graphics or kinetic effects — those scenes use real footage instead.',
                  },
                  {
                    key: 'disableOverlays',
                    label: 'Disable overlays',
                    desc: 'Generate videos without captions or text layered over the footage.',
                  },
                  {
                    key: 'disableEffects',
                    label: 'Disable effects',
                    desc: 'Render without transitions, grading or stylized treatments.',
                  },
                ] as const
              ).map((t, i) => (
                <div
                  key={t.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    padding: '13px 0',
                    borderBottom: i < 2 ? `1px solid ${colors.border6}` : 'none',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{t.label}</div>
                    <div style={{ fontSize: 12, color: colors.textFaint, marginTop: 2 }}>{t.desc}</div>
                  </div>
                  <Toggle on={brand[t.key]} onChange={(v) => patch({ [t.key]: v })} />
                </div>
              ))}
            </div>

            <div style={panelStyle}>
              <div style={sectionTitleStyle}>Template blocklist</div>
              <div style={{ fontSize: 12.5, color: colors.textFaint, marginBottom: 14 }}>
                Blocked motion templates are never used in this channel's videos.
                {brand.blockedTemplates.length === 0 && ' No templates blocklisted.'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 10 }}>
                {MOTION_TEMPLATES.map((t) => {
                  const blocked = brand.blockedTemplates.includes(t.type);
                  return (
                    <button
                      key={t.type}
                      onClick={() =>
                        patch({
                          blockedTemplates: blocked
                            ? brand.blockedTemplates.filter((x) => x !== t.type)
                            : [...brand.blockedTemplates, t.type],
                        })
                      }
                      className="hv-row"
                      style={{
                        textAlign: 'left',
                        background: blocked ? 'rgba(255,77,77,.10)' : colors.card,
                        border: `1px solid ${blocked ? 'rgba(255,77,77,.45)' : colors.border8}`,
                        borderRadius: 10,
                        padding: '11px 13px',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, color: blocked ? '#e48a8a' : colors.textBright }}>
                        {t.label}
                      </div>
                      <div style={{ fontSize: 11, color: colors.textGhost, marginTop: 2, fontFamily: 'ui-monospace,monospace' }}>
                        {t.type}
                        {blocked ? ' · blocked' : ''}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
      style={{
        width: 42,
        height: 24,
        borderRadius: 20,
        border: 'none',
        background: on ? colors.accent : colors.control,
        position: 'relative',
        cursor: 'pointer',
        flexShrink: 0,
        transition: 'background .2s',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 3,
          left: on ? 21 : 3,
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left .2s',
        }}
      />
    </button>
  );
}

const panelStyle: React.CSSProperties = {
  background: colors.panel,
  border: `1px solid ${colors.border8}`,
  borderRadius: 16,
  padding: 20,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 14.5,
  fontWeight: 600,
  marginBottom: 4,
};

const fieldLabelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 7,
  fontSize: 12.5,
  color: colors.textFaint,
};

const fieldInputStyle: React.CSSProperties = {
  background: colors.card,
  border: `1px solid ${colors.border8}`,
  borderRadius: 10,
  color: colors.text,
  fontSize: 13.5,
  padding: '10px 12px',
  outline: 'none',
};

const saveBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  padding: '9px 16px',
  borderRadius: 10,
  background: colors.accent,
  border: 'none',
  color: '#fff',
  fontSize: 13.5,
  fontWeight: 600,
  cursor: 'pointer',
};
