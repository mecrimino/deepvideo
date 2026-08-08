/**
 * Design tokens extracted from Deep Video.dc.html. Components use these for
 * the recurring values and keep one-off values inline, mirroring the design.
 */

// Values are CSS variables (defined in index.css for both the dark default and
// the [data-theme="light"] palette) so the whole app — every component reads
// these tokens inline — re-skins on a theme switch with no per-component edits.
// The dark base is rgb(21,21,21) with translucent, blurred "glass" surfaces.
export const colors = {
  // surfaces
  bg: 'var(--bg)',
  bgAlt: 'var(--bg-alt)',
  bgEditor: 'var(--bg-editor)',
  bgBar: 'var(--bg-bar)',
  panel: 'var(--panel)',
  banner: 'var(--banner)',
  card: 'var(--card)',
  raised: 'var(--raised)',
  control: 'var(--control)',
  chip: 'var(--chip)',
  // borders
  border6: 'var(--b6)',
  border7: 'var(--b7)',
  border8: 'var(--b8)',
  border9: 'var(--b9)',
  border10: 'var(--b10)',
  // text
  text: 'var(--text)',
  textSoft: 'var(--text-soft)',
  textBright: 'var(--text-bright)',
  textMid: 'var(--text-mid)',
  textDim: 'var(--text-dim)',
  textFaint: 'var(--text-faint)',
  textGhost: 'var(--text-ghost)',
  textMono: 'var(--text-mono)',
  // accents (shared across themes)
  accent: '#2f6bff',
  accentHover: '#4880ff',
  playhead: '#ff4d4d',
  waveform: '#dca93a',
  gold: '#ffb340',
} as const;

export const gradients = {
  brand: 'linear-gradient(140deg,#ff8a4c,#2f6bff)',
  avatar: 'linear-gradient(140deg,#e05fa0,#7b5cff)',
  avatar2: 'linear-gradient(140deg,#4caf88,#2f6bff)',
  homeHero: 'var(--home-hero)',
  placeholder: 'repeating-linear-gradient(135deg,var(--ph1) 0 9px,var(--ph2) 9px 18px)',
  placeholderLg: 'repeating-linear-gradient(135deg,var(--ph1) 0 10px,var(--ph2) 10px 20px)',
  placeholderSm: 'repeating-linear-gradient(135deg,var(--ph1) 0 8px,var(--ph2) 8px 16px)',
  elementTrack: 'linear-gradient(180deg,#7d5cf0,#6538d2)',
  background: 'linear-gradient(140deg,#2f7d5f,#1f5c47)',
  themeSwatch: 'repeating-linear-gradient(135deg,#242429 0 7px,#1c1c21 7px 14px)',
  blocked: 'repeating-linear-gradient(135deg,#3a1618 0 9px,#2a1113 9px 18px)',
  chatThumb: 'repeating-linear-gradient(135deg,#2a3a55 0 5px,#22304a 5px 10px)',
} as const;

export const fontMono = 'ui-monospace,monospace';
