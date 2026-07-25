/**
 * Overlay — the one composition that renders any OverlaySpec.
 * Data-driven: template picks a layout, preset picks motion, theme picks
 * colors/typography. Production look: layered animated background (drifting
 * glow + particles + vignette), staggered entrances, glow accents and a subtle
 * breathing drift so no frame is ever static.
 */

import React from 'react';
import {
  AbsoluteFill, Easing, interpolate, random, useCurrentFrame, useVideoConfig,
} from 'remotion';
import { defaultsFor, type OverlaySpec } from './spec';
import { THEMES, TYPE_SCALE, type Theme } from './themes';
import { useMotion, wordProgress } from './presets';

/* ------------------------------ background ------------------------------- */

const BG_VARIANTS = ['orbs', 'aurora', 'beams', 'grid', 'rings'] as const;

/** Drifting particles shared by several variants. */
const Particles: React.FC<{ theme: Theme; t: number; count?: number }> = ({ theme, t, count = 12 }) => (
  <>
    {new Array(count).fill(0).map((_, i) => {
      const seed = random(`dot-${i}`);
      const size = 3 + seed * 5;
      const x = seed * 100;
      const y = ((random(`y-${i}`) * 100) + t * (2 + seed * 3)) % 108 - 4;
      const o = 0.05 + random(`o-${i}`) * 0.1;
      return (
        <div key={i} style={{
          position: 'absolute', left: `${x}%`, top: `${y}%`,
          width: size, height: size, borderRadius: '50%',
          background: theme.accent, opacity: o,
          filter: `blur(${size > 5 ? 1 : 0}px)`,
        }} />
      );
    })}
  </>
);

const Background: React.FC<{
  theme: Theme; frame: number; fps: number; height: number; variant: string;
}> = ({ theme, frame, fps, height, variant }) => {
  const t = frame / fps;
  let scene: React.ReactNode = null;

  if (variant === 'aurora') {
    // three wide soft color bands drifting sideways like an aurora
    scene = new Array(3).fill(0).map((_, i) => (
      <div key={i} style={{
        position: 'absolute', left: '-30%', width: '160%', height: '34%',
        top: `${8 + i * 26}%`,
        background: `linear-gradient(90deg, transparent, ${theme.accent}${['26', '1c', '12'][i]}, transparent)`,
        filter: 'blur(46px)',
        transform: `translateX(${Math.sin(t * (0.25 + i * 0.09) + i * 2) * 14}%) rotate(${-8 + i * 6}deg)`,
      }} />
    ));
  } else if (variant === 'beams') {
    // diagonal light beams slowly sweeping
    scene = new Array(3).fill(0).map((_, i) => (
      <div key={i} style={{
        position: 'absolute', top: '-30%', height: '160%', width: '14%',
        left: `${12 + i * 30}%`,
        background: `linear-gradient(180deg, transparent, ${theme.accent}${['20', '16', '0e'][i]}, transparent)`,
        filter: 'blur(24px)',
        transform: `rotate(${18 + Math.sin(t * 0.3 + i) * 5}deg) translateX(${Math.sin(t * 0.2 + i * 1.7) * 60}px)`,
      }} />
    ));
  } else if (variant === 'grid') {
    const cell = height * 0.085;
    scene = (
      <>
        <AbsoluteFill style={{
          backgroundImage:
            `linear-gradient(${theme.accent}12 1px, transparent 1px),` +
            `linear-gradient(90deg, ${theme.accent}12 1px, transparent 1px)`,
          backgroundSize: `${cell}px ${cell}px`,
          backgroundPosition: `${(t * 6) % cell}px ${(t * 4) % cell}px`,
          maskImage: 'radial-gradient(80% 70% at 50% 45%, black 30%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(80% 70% at 50% 45%, black 30%, transparent 100%)',
        }} />
        <AbsoluteFill style={{
          background: `radial-gradient(46% 46% at ${50 + Math.sin(t * 0.3) * 14}% 42%, ${theme.accent}1e 0%, transparent 70%)`,
        }} />
      </>
    );
  } else if (variant === 'rings') {
    // concentric rings expanding from center
    scene = new Array(4).fill(0).map((_, i) => {
      const p = ((t * 0.16 + i / 4) % 1);
      const size = 18 + p * 95;
      return (
        <div key={i} style={{
          position: 'absolute', left: '50%', top: '46%',
          width: `${size}%`, aspectRatio: '1',
          transform: 'translate(-50%,-50%)',
          borderRadius: '50%',
          border: `1.5px solid ${theme.accent}`,
          opacity: (1 - p) * 0.16,
        }} />
      );
    });
  } else {
    // orbs (default): two glow blobs drifting in opposite directions
    const gx = 50 + Math.sin(t * 0.35) * 18;
    const gy = 38 + Math.cos(t * 0.28) * 12;
    const g2x = 30 + Math.cos(t * 0.22) * 22;
    const g2y = 70 + Math.sin(t * 0.3) * 10;
    scene = (
      <AbsoluteFill style={{
        background: `radial-gradient(42% 42% at ${gx}% ${gy}%, ${theme.accent}22 0%, transparent 70%),` +
          `radial-gradient(50% 50% at ${g2x}% ${g2y}%, ${theme.accent}14 0%, transparent 72%)`,
      }} />
    );
  }

  return (
    <AbsoluteFill style={{ background: theme.bg }}>
      {scene}
      <Particles theme={theme} t={t} count={variant === 'grid' ? 6 : 12} />
      {/* vignette for depth */}
      <AbsoluteFill style={{
        background: `radial-gradient(120% 90% at 50% 45%, transparent 55%, rgba(0,0,0,.42) 100%)`,
      }} />
      {/* hairline frame for a finished, composed look */}
      <AbsoluteFill style={{
        border: `1px solid ${theme.accent}1f`,
        margin: height * 0.03,
        width: 'auto', height: 'auto', borderRadius: 12,
      }} />
    </AbsoluteFill>
  );
};

/* ------------------------------ text helpers ------------------------------ */

const Words: React.FC<{
  text: string; highlight: string[]; theme: Theme; kinetic: boolean;
  underline: boolean; frame: number; fps: number;
}> = ({ text, highlight, theme, kinetic, underline, frame, fps }) => {
  const lower = highlight.map((h) => h.toLowerCase());
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <span>
      {words.map((w, i) => {
        const bare = w.toLowerCase().replace(/[^\w]/g, '');
        const hot = lower.some((h) => h.split(' ').some((hw) => hw.replace(/[^\w]/g, '') === bare) || bare.includes(h.replace(/[^\w\s]/g, '').replace(/\s/g, '')));
        const p = kinetic ? wordProgress(frame, fps, i, words.length) : 1;
        const rot = kinetic ? (1 - p) * (random(`rot-${i}`) - 0.5) * 10 : 0;
        return (
          <span key={i} style={{
            display: 'inline-block', whiteSpace: 'pre',
            color: hot ? theme.accent : undefined,
            textShadow: hot ? `0 0 30px ${theme.accent}66` : undefined,
            opacity: p,
            transform: `translateY(${(1 - p) * 26}px) rotate(${rot}deg)`,
            borderBottom: underline && hot ? `0.06em solid ${theme.accent}` : undefined,
          }}>
            {w}{i < words.length - 1 ? ' ' : ''}
          </span>
        );
      })}
    </span>
  );
};

/** Grows the accent divider under titles. */
const AccentBar: React.FC<{ theme: Theme; frame: number; fps: number; delay?: number }> = ({
  theme, frame, fps, delay = 0.35,
}) => {
  const w = interpolate(frame, [delay * fps, (delay + 0.5) * fps], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic),
  });
  return (
    <div style={{
      width: `${w * 3.4}em`, height: 6, background: theme.accent, borderRadius: 3,
      marginTop: '0.55em', boxShadow: `0 0 24px ${theme.accent}88`,
    }} />
  );
};

/* -------------------------------- overlay -------------------------------- */

export const Overlay: React.FC<OverlaySpec> = (spec) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, height } = useVideoConfig();
  const d = defaultsFor(spec);
  const theme: Theme = { ...THEMES[spec.theme] ?? THEMES.dark };
  if (spec.accentColor) theme.accent = spec.accentColor;
  const motion = useMotion(frame, fps, durationInFrames, spec.preset, d.exitPreset, height);
  const fontSize = TYPE_SCALE[d.typography] * height;
  const kinetic = spec.preset === 'kinetic_text';
  const underline = spec.preset === 'underline_draw';
  // subtle breathing drift so the hold is never static
  const breathe = 1 + Math.sin((frame / fps) * 0.9) * 0.008 + (frame / fps) * 0.004;
  // background: explicit choice, else seeded by the text — clips in one video
  // get DIFFERENT variants while sharing the same theme palette.
  const bgVariant = spec.background
    ?? BG_VARIANTS[Math.floor(random(`bg-${spec.text}`) * BG_VARIANTS.length)];

  const align: React.CSSProperties =
    d.position === 'lower_third' ? { justifyContent: 'flex-end', paddingBottom: height * 0.08 }
    : d.position === 'top' ? { justifyContent: 'flex-start', paddingTop: height * 0.08 }
    : d.position === 'left' ? { alignItems: 'flex-start', paddingLeft: '8%' }
    : d.position === 'right' ? { alignItems: 'flex-end', paddingRight: '8%' }
    : {};

  const words = (
    <Words text={spec.text} highlight={d.highlight} theme={theme}
           kinetic={kinetic} underline={underline} frame={frame} fps={fps} />
  );
  const iconPulse = 1 + Math.sin((frame / fps) * 2.2) * 0.03;
  const icon = spec.icon ? (
    <div style={{
      fontSize: fontSize * 1.15, lineHeight: 1, marginBottom: '0.35em',
      transform: `scale(${iconPulse})`,
      filter: `drop-shadow(0 0 26px ${theme.accent}aa)`,
    }}>{spec.icon}</div>
  ) : null;
  const secondaryIn = interpolate(frame, [0.45 * fps, 0.85 * fps], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic),
  });
  const secondary = spec.secondary ? (
    <div style={{
      fontSize: fontSize * 0.4, color: theme.muted, marginTop: '0.55em', fontWeight: 500,
      letterSpacing: '0.14em', textTransform: 'uppercase',
      opacity: secondaryIn, transform: `translateY(${(1 - secondaryIn) * 14}px)`,
    }}>
      {spec.secondary}
    </div>
  ) : null;

  const base: React.CSSProperties = {
    fontFamily: theme.font, color: theme.text, textAlign: 'center',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    ...align,
  };
  const anim: React.CSSProperties = {
    opacity: motion.opacity,
    transform: `${motion.transform === 'none' ? '' : motion.transform} scale(${breathe})`,
    filter: motion.filter, clipPath: motion.clipPath,
  };
  const shell = (children: React.ReactNode) => (
    <AbsoluteFill style={base}>
      <Background theme={theme} frame={frame} fps={fps} height={height} variant={bgVariant} />
      <div style={{ ...anim, display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: '84%', zIndex: 1 }}>
        {children}
      </div>
    </AbsoluteFill>
  );

  switch (spec.template) {
    case 'lower_third':
      return (
        <AbsoluteFill style={{ ...base, justifyContent: 'flex-end', alignItems: 'flex-start' }}>
          <Background theme={theme} frame={frame} fps={fps} height={height} variant={bgVariant} />
          <div style={{ ...anim, zIndex: 1, margin: `0 0 ${height * 0.08}px ${height * 0.06}px`,
                        background: theme.panel, backdropFilter: 'blur(6px)',
                        borderLeft: `6px solid ${theme.accent}`,
                        boxShadow: `0 18px 50px rgba(0,0,0,.45), 0 0 40px ${theme.accent}22`,
                        padding: '0.6em 1.3em', borderRadius: 12, textAlign: 'left' }}>
            <div style={{ fontSize, fontWeight: 700 }}>{words}</div>
            {secondary}
          </div>
        </AbsoluteFill>
      );
    case 'stat': {
      // count-up when the text is numeric (e.g. "60+", "10")
      const num = spec.text.match(/^(\d+)(.*)$/);
      const counted = num
        ? Math.round(interpolate(frame, [0, 0.9 * fps], [0, parseInt(num[1], 10)], {
            extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic),
          }))
        : null;
      return shell(
        <>
          {icon}
          <div style={{
            fontSize: fontSize * 1.7, fontWeight: 800, color: theme.accent, lineHeight: 1.05,
            textShadow: `0 0 60px ${theme.accent}55`, letterSpacing: '-0.02em',
          }}>
            {num && counted !== null ? `${counted}${num[2]}` : words}
          </div>
          <AccentBar theme={theme} frame={frame} fps={fps} />
          {secondary}
        </>,
      );
    }
    case 'quote': {
      const markIn = interpolate(frame, [0, 0.4 * fps], [0, 1], {
        extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.back(1.6)),
      });
      return shell(
        <>
          <div style={{
            fontSize: fontSize * 2.4, color: theme.accent, lineHeight: 0.7, fontFamily: 'Georgia, serif',
            transform: `scale(${markIn})`, textShadow: `0 0 50px ${theme.accent}66`,
          }}>“</div>
          <div style={{ fontSize, fontWeight: 600, fontStyle: 'italic', lineHeight: 1.3, maxWidth: '86%' }}>
            {words}
          </div>
          {secondary}
        </>,
      );
    }
    case 'callout':
      return shell(
        <div style={{
          background: theme.panel, backdropFilter: 'blur(6px)',
          border: `2px solid ${theme.accent}`, borderRadius: 20, padding: '1em 1.7em',
          boxShadow: `0 24px 60px rgba(0,0,0,.5), 0 0 ${34 + Math.sin((frame / fps) * 2.4) * 14}px ${theme.accent}44`,
        }}>
          {icon}
          <div style={{ fontSize, fontWeight: 700, lineHeight: 1.28 }}>{words}</div>
          {secondary}
        </div>,
      );
    case 'badge':
      return shell(
        <div style={{
          background: theme.accent, color: '#0b0b0f', borderRadius: 999,
          padding: '0.5em 1.5em', fontSize, fontWeight: 800, letterSpacing: '0.05em',
          boxShadow: `0 16px 44px rgba(0,0,0,.45), 0 0 60px ${theme.accent}77`,
        }}>
          {words}
        </div>,
      );
    case 'end_screen':
      return shell(
        <>
          {icon}
          <div style={{ fontSize, fontWeight: 800, letterSpacing: '-0.01em' }}>{words}</div>
          {secondary}
          <div style={{ display: 'flex', gap: '0.9em', marginTop: '1.1em' }}>
            {['👍 Like', '🔔 Subscribe'].map((b, i) => {
              const p = interpolate(frame, [(0.5 + i * 0.18) * fps, (0.9 + i * 0.18) * fps], [0, 1], {
                extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.back(1.8)),
              });
              return (
                <div key={b} style={{
                  background: theme.panel, border: `2px solid ${theme.accent}`, borderRadius: 14,
                  padding: '0.45em 1.1em', fontSize: fontSize * 0.5, fontWeight: 700,
                  opacity: p, transform: `scale(${p})`,
                  boxShadow: `0 0 30px ${theme.accent}33`,
                }}>{b}</div>
              );
            })}
          </div>
        </>,
      );
    default: // title_card
      return shell(
        <>
          {icon}
          <div style={{
            fontSize, fontWeight: 800, lineHeight: 1.12, letterSpacing: '-0.015em',
            textShadow: '0 6px 40px rgba(0,0,0,.55)',
          }}>
            {words}
          </div>
          <AccentBar theme={theme} frame={frame} fps={fps} />
          {secondary}
        </>,
      );
  }
};
