/** Small dark-theme building blocks shared by every Developer Dashboard panel. */

import type { CSSProperties, ReactNode } from 'react';
import type { AgentStatus } from './types';

// Palette mirrors the app's design tokens (frontend/src/styles/theme.ts) so the
// dashboard reads as part of the same product.
export const dev = {
  bg: '#08080a',
  bgAlt: '#0a0a0c',
  panel: '#141417',
  card: '#17171b',
  raised: '#1b1b1f',
  control: '#1f1f24',
  chip: '#232329',
  border: 'rgba(255,255,255,.08)',
  border2: 'rgba(255,255,255,.12)',
  text: '#ececee',
  bright: '#e7e7ea',
  dim: '#9a9aa1',
  faint: '#6b6b72',
  accent: '#2f6bff',
  accentHover: '#4880ff',
  green: '#3ecf8e',
  amber: '#ffb340',
  red: '#ff4d4d',
  mono: 'ui-monospace,SFMono-Regular,Menlo,monospace',
} as const;

export const devGradients = {
  brand: 'linear-gradient(140deg,#ff8a4c,#2f6bff)',
  hero:
    'radial-gradient(48vw 48vh at 12% 8%, rgba(255,120,44,.10), transparent 60%),' +
    'radial-gradient(46vw 50vh at 92% 4%, rgba(62,92,232,.14), transparent 58%), #08080a',
} as const;

export function statusColor(s: AgentStatus | string): string {
  switch (s) {
    case 'running':
      return dev.accent;
    case 'completed':
      return dev.green;
    case 'failed':
      return dev.red;
    case 'waiting':
      return dev.amber;
    default:
      return dev.faint;
  }
}

export function Card({
  title,
  right,
  children,
  style,
}: {
  title?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        background: dev.card,
        border: `1px solid ${dev.border}`,
        borderRadius: 10,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        ...style,
      }}
    >
      {(title || right) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: dev.dim, letterSpacing: 0.3 }}>
            {title}
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function StatChip({
  label,
  value,
  color,
  accent,
}: {
  label: string;
  value: ReactNode;
  color?: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        padding: '9px 14px',
        background: dev.card,
        border: `1px solid ${dev.border}`,
        borderRadius: 10,
        minWidth: 92,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {accent && (
        <span
          style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: accent }}
        />
      )}
      <span style={{ fontSize: 10, color: dev.faint, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </span>
      <span style={{ fontSize: 17, fontWeight: 700, color: color ?? dev.text, fontFamily: dev.mono }}>
        {value}
      </span>
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  color?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <div style={{ fontSize: 11, color: dev.faint, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color ?? dev.text, fontFamily: dev.mono }}>
        {value}
      </div>
      {sub != null && <div style={{ fontSize: 11, color: dev.dim }}>{sub}</div>}
    </div>
  );
}

export function Bar({ pct, color }: { pct: number; color?: string }) {
  const clamped = Math.max(0, Math.min(100, pct || 0));
  return (
    <div
      style={{
        height: 7,
        borderRadius: 5,
        background: 'rgba(255,255,255,.07)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${clamped}%`,
          height: '100%',
          background: color ?? dev.accent,
          transition: 'width .4s ease',
        }}
      />
    </div>
  );
}

export function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span
      style={{
        fontSize: 10.5,
        fontWeight: 700,
        color,
        background: `${color}22`,
        border: `1px solid ${color}55`,
        borderRadius: 5,
        padding: '2px 7px',
        textTransform: 'uppercase',
        letterSpacing: 0.4,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </span>
  );
}

export function Dot({ color }: { color: string }) {
  return (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: color,
        display: 'inline-block',
        flexShrink: 0,
      }}
    />
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div style={{ color: dev.faint, fontSize: 12, padding: '18px 4px', textAlign: 'center' }}>
      {children}
    </div>
  );
}
