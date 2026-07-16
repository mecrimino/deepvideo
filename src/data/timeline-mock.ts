/**
 * Editor timeline mock data, matching the reference screenshots:
 * ruler labels, a script/text chip track, a video track that mixes footage
 * cells (some with image-overlay badges) and purple element blocks, plus two
 * audio tracks (narration waveform + thin cue track).
 */

import {
  Captions,
  Maximize2,
  Shuffle,
  Sparkles,
  Type,
  type LucideIcon,
} from 'lucide-react';

export const ruler3 = [
  '8m 20s',
  '8m 40s',
  '9m 0s',
  '9m 20s',
  '9m 40s',
  '10m 0s',
  '10m 20s',
  '10m 40s',
];

/* -------------------------- script / text track -------------------------- */

export interface ScriptChip {
  w: number;
  text: string;
}

export const scriptChips: ScriptChip[] = [
  { w: 118, text: 'Kicking off the countdown with a legend' },
  { w: 132, text: 'The prototype stunned Western analysts' },
  { w: 128, text: 'Radar stations clocked it above Mach 3' },
  { w: 104, text: 'Built from steel, not titanium' },
  { w: 122, text: 'Its engines ran hot enough to melt' },
  { w: 110, text: 'Pilots were ordered to hold back' },
  { w: 126, text: 'A parade flyover revealed the airframe' },
  { w: 130, text: 'Reconnaissance runs over the desert' },
  { w: 138, text: 'No interceptor could reach its ceiling' },
  { w: 112, text: 'The climb record still stands today' },
  { w: 120, text: 'Next, a jet built for the very edge' },
  { w: 134, text: 'This slot is queued for a generated shot' },
];

/* ------------------------------ video track ------------------------------ */

/** Photo-ish layered gradients standing in for real clip thumbnails. */
const grads = [
  'radial-gradient(120% 90% at 28% 18%, rgba(255,255,255,.28), transparent 55%), linear-gradient(160deg,#5b8dd6,#aecbf0)',
  'radial-gradient(110% 80% at 70% 25%, rgba(255,255,255,.12), transparent 50%), linear-gradient(160deg,#2c2c34,#4a4a56)',
  'radial-gradient(120% 90% at 30% 20%, rgba(255,240,200,.3), transparent 55%), linear-gradient(160deg,#c98a3a,#e8b96e)',
  'radial-gradient(110% 80% at 65% 30%, rgba(220,255,220,.18), transparent 50%), linear-gradient(160deg,#3c5a3a,#78a166)',
  'radial-gradient(120% 90% at 40% 15%, rgba(160,170,255,.15), transparent 55%), linear-gradient(160deg,#1c1c26,#3a3a48)',
  'radial-gradient(110% 80% at 30% 25%, rgba(255,200,200,.2), transparent 50%), linear-gradient(160deg,#7a3232,#b45a5a)',
  'radial-gradient(120% 90% at 60% 20%, rgba(200,215,255,.22), transparent 55%), linear-gradient(160deg,#3a4a6c,#7285b4)',
  'radial-gradient(110% 80% at 35% 20%, rgba(255,235,190,.2), transparent 50%), linear-gradient(160deg,#5a4a2a,#9a8450)',
];

export type TimelineCell =
  | { kind: 'clip'; w: number; grad: string; selected?: boolean; badge?: boolean }
  | { kind: 'element'; w: number; icon: LucideIcon; label: string };

const clip = (w: number, g: number, opts?: { selected?: boolean; badge?: boolean }): TimelineCell => ({
  kind: 'clip',
  w,
  grad: grads[g % grads.length],
  ...opts,
});

const elem = (w: number, icon: LucideIcon, label: string): TimelineCell => ({
  kind: 'element',
  w,
  icon,
  label,
});

export const videoCells: TimelineCell[] = [
  clip(84, 0, { badge: true }),
  clip(62, 1),
  elem(96, Shuffle, 'Transition'),
  clip(88, 2, { badge: true }),
  clip(70, 3),
  clip(64, 4),
  elem(104, Maximize2, 'Zoom in'),
  clip(92, 5, { badge: true }),
  clip(74, 6),
  clip(96, 7, { selected: true, badge: true }),
  elem(120, Captions, 'Lower third'),
  clip(68, 0),
  clip(82, 2, { badge: true }),
  clip(60, 4),
  elem(110, Sparkles, 'Outro'),
  clip(78, 6),
  clip(88, 1),
  clip(72, 3, { badge: true }),
];

/** Intro-title chip shown at the far left of the video row. */
export const introElement = elem(112, Type, 'Intro title');

/* ------------------------------ audio tracks ----------------------------- */

export const narrationLabel = 'Narration: 0d8b25c1d1ba90a1c72ecd_78b232f2f2c2.mp3';
export const cueLabel = 'Cue 000.mp3';

/** 190 deterministic waveform bar heights (percent) — the design's formula. */
export const wave: number[] = Array.from({ length: 190 }, (_, i) =>
  26 +
  Math.round(
    Math.abs(
      Math.sin(i * 0.55) * Math.cos(i * 0.19) + Math.sin(i * 0.11) * 0.5 + Math.sin(i * 1.3) * 0.25,
    ) * 62,
  ),
);

/** Thin cue/music track — lower amplitude. */
export const wave2: number[] = Array.from({ length: 190 }, (_, i) =>
  30 + Math.round(Math.abs(Math.sin(i * 0.7) * Math.cos(i * 0.13)) * 55),
);
