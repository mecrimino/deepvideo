import type { ThemeId } from './spec';

export interface Theme {
  bg: string;        // full-frame card background (CSS gradient ok)
  panel: string;     // callout/lower-third panel fill
  text: string;
  muted: string;
  accent: string;
  font: string;
}

const SANS = `'Segoe UI', system-ui, -apple-system, sans-serif`;
const SERIF = `Georgia, 'Times New Roman', serif`;

export const THEMES: Record<ThemeId, Theme> = {
  dark:        { bg: 'linear-gradient(135deg,#0b0b0f 0%,#16161d 100%)', panel: 'rgba(255,255,255,.07)', text: '#f5f5f7', muted: '#9a9aa3', accent: '#5b8cff', font: SANS },
  light:       { bg: 'linear-gradient(135deg,#fafafa 0%,#eef0f4 100%)', panel: 'rgba(0,0,0,.05)',      text: '#17181c', muted: '#5f6470', accent: '#2563eb', font: SANS },
  minimal:     { bg: '#101013',                                          panel: 'rgba(255,255,255,.05)', text: '#ececee', muted: '#8a8a92', accent: '#e4e4e7', font: SANS },
  modern:      { bg: 'linear-gradient(120deg,#101322 0%,#1c1436 100%)', panel: 'rgba(255,255,255,.08)', text: '#f4f2ff', muted: '#a09ac0', accent: '#a78bfa', font: SANS },
  tech:        { bg: 'linear-gradient(135deg,#04070d 0%,#0a1626 100%)', panel: 'rgba(56,189,248,.10)',  text: '#e8f4ff', muted: '#7ca6c8', accent: '#38bdf8', font: SANS },
  health:      { bg: 'linear-gradient(135deg,#07120c 0%,#0d2417 100%)', panel: 'rgba(74,222,128,.10)',  text: '#f0fff5', muted: '#8fbf9f', accent: '#4ade80', font: SANS },
  documentary: { bg: 'linear-gradient(135deg,#120f0b 0%,#241c12 100%)', panel: 'rgba(250,204,21,.08)',  text: '#fdf8ef', muted: '#b3a98f', accent: '#eab308', font: SERIF },
};

/** Typography scale, in fractions of frame height (resolution-independent). */
export const TYPE_SCALE: Record<string, number> = {
  hero: 0.115, title: 0.085, subtitle: 0.055, heading: 0.045,
  body: 0.035, caption: 0.028, label: 0.024, badge: 0.032,
};
