/**
 * Design tokens extracted from Deep Video.dc.html. Components use these for
 * the recurring values and keep one-off values inline, mirroring the design.
 */

export const colors = {
  // surfaces
  bg: '#08080a',
  bgAlt: '#0a0a0c',
  bgEditor: '#0c0c0e',
  bgBar: '#0e0e11',
  panel: '#141417',
  banner: '#15161a',
  card: '#17171b',
  raised: '#1b1b1f',
  control: '#1f1f24',
  chip: '#232329',
  // borders
  border6: 'rgba(255,255,255,.06)',
  border7: 'rgba(255,255,255,.07)',
  border8: 'rgba(255,255,255,.08)',
  border9: 'rgba(255,255,255,.09)',
  border10: 'rgba(255,255,255,.1)',
  // text
  text: '#ececee',
  textSoft: '#dcdce0',
  textBright: '#e7e7ea',
  textMid: '#c9c9cf',
  textDim: '#9a9aa1',
  textFaint: '#8b8b92',
  textGhost: '#6b6b72',
  textMono: '#5c5c63',
  // accents
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
  homeHero:
    'radial-gradient(58vw 58vh at 16% 22%, rgba(255,120,44,.26), transparent 62%), radial-gradient(52vw 54vh at 86% 78%, rgba(62,92,232,.30), transparent 60%), #060608',
  placeholder: 'repeating-linear-gradient(135deg,#1b1b20 0 9px,#161619 9px 18px)',
  placeholderLg: 'repeating-linear-gradient(135deg,#1b1b20 0 10px,#161619 10px 20px)',
  placeholderSm: 'repeating-linear-gradient(135deg,#1b1b20 0 8px,#161619 8px 16px)',
  elementTrack: 'linear-gradient(180deg,#7d5cf0,#6538d2)',
  background: 'linear-gradient(140deg,#2f7d5f,#1f5c47)',
  themeSwatch: 'repeating-linear-gradient(135deg,#242429 0 7px,#1c1c21 7px 14px)',
  blocked: 'repeating-linear-gradient(135deg,#3a1618 0 9px,#2a1113 9px 18px)',
  chatThumb: 'repeating-linear-gradient(135deg,#2a3a55 0 5px,#22304a 5px 10px)',
} as const;

export const fontMono = 'ui-monospace,monospace';
