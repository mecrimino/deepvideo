/**
 * Shot composer — turns a composition preset + your inputs into an ffmpeg
 * command. Every look here was lifted from a real documentary edit: article
 * panels with a highlighter sweep, photo scatters, annotated group photos,
 * name plates, year stamps, VHS frames, map zooms.
 *
 * Hard-won rules for this ffmpeg build (8.1, Windows):
 *   - drawtext SEGFAULTS on inline text containing quotes or any non-ASCII, and
 *     on absolute font paths, and on an animated `fontsize`. So: text always
 *     goes through `textfile=`, fonts are repo-relative, and size changes are
 *     separate drawtexts.
 *   - `pad` locks its size on frame 1, so it must precede any moving `scale`.
 *   - x/y/w/h expressions containing a comma must be quoted.
 */

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { config } from '../config/index.ts';
import { probe } from './media.ts';
import { ZOOM, geocode, globeMap, project as projectPx, regionMask, staticMap } from './staticMap.ts';
import type { MapStyle } from './staticMap.ts';

export const CANVAS = { w: 1280, h: 720 };
/** When an entry animation lands — the sfx is aligned to this. */
export const POP_SEC = 0.38;

const TEXT_DIR = join(config.paths.temp, 'editinglab', 'text');

export type Kind =
  | 'card' | 'photo' | 'article' | 'stat' | 'title' | 'label' | 'year' | 'vhs'
  | 'pair' | 'trio' | 'scatter' | 'compare' | 'annotate' | 'map' | 'chip'
  | 'tree' | 'callout' | 'cctv' | 'transcript' | 'tag'
  | 'terminal' | 'bullets' | 'news' | 'source' | 'target' | 'route';

export interface Composition extends Record<string, unknown> {
  id: string;
  name: string;
  kind: Kind;
  note?: string;
}

export interface ComposeInput extends Record<string, unknown> {
  image?: string;
  images?: string[];
  text?: string;
  background?: string;
  sfx?: string;
  music?: string;
  durationSec?: number;
}

export interface Control {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'color' | 'bool' | 'select' | 'background' | 'sfx' | 'music' | 'font' | 'images';
  options?: string[];
  min?: number;
  max?: number;
  /** images: how many slots this kind takes. */
  count?: number;
}

/** Sound bed + length — every kind takes these. */
const COMMON: Control[] = [
  { key: 'sfx', label: 'entry sound', type: 'sfx' },
  { key: 'sfxVolume', label: 'sound volume %', type: 'number', min: 0, max: 200 },
  { key: 'music', label: 'background music', type: 'music' },
  { key: 'musicVolume', label: 'music volume %', type: 'number', min: 0, max: 200 },
  { key: 'durationSec', label: 'duration (s)', type: 'number', min: 1, max: 30 },
];

/** When things move — exposed wherever there is an entry animation. */
const TIMING: Control[] = [
  { key: 'entryDelay', label: 'entry delay (s)', type: 'number', min: 0, max: 10 },
  { key: 'stagger', label: 'stagger (s)', type: 'number', min: 0, max: 3 },
];

const TEXT_CONTROLS: Control[] = [
  { key: 'textFont', label: 'font', type: 'font' },
  { key: 'textSize', label: 'text size', type: 'number', min: 10, max: 200 },
  { key: 'textColor', label: 'text colour', type: 'color' },
  { key: 'textXPct', label: 'text x %', type: 'number', min: 0, max: 100 },
  { key: 'textYPct', label: 'text y %', type: 'number', min: 0, max: 100 },
  { key: 'typewriter', label: 'type it in', type: 'bool' },
];

/** The subject slot for kinds that take exactly one image or clip. */
const SUBJECT: Control[] = [{ key: 'images', label: 'image / clip', type: 'images', count: 1 }];

const MULTI: Control[] = [
  { key: 'text', label: 'captions (one per image, split with |)', type: 'text' },
  { key: 'entry', label: 'entry', type: 'select', options: ['slide', 'pop'] },
  { key: 'gutter', label: 'gap px', type: 'number', min: 0, max: 80 },
  { key: 'border', label: 'border px', type: 'number', min: 0, max: 40 },
  { key: 'borderColor', label: 'border colour', type: 'color' },
  { key: 'captionFont', label: 'caption font', type: 'font' },
  { key: 'captionSize', label: 'caption size', type: 'number', min: 10, max: 60 },
  { key: 'captionColor', label: 'caption colour', type: 'color' },
  { key: 'background', label: 'background', type: 'background' },
];

export const CONTROLS: Record<Kind, Control[]> = {
  terminal: [
    { key: 'text', label: 'console lines (one per line)', type: 'textarea' },
    { key: 'header', label: 'header bar text', type: 'text' },
    { key: 'prompt', label: 'line prefix', type: 'text' },
    { key: 'images', label: 'background (optional)', type: 'images', count: 1 },
    { key: 'screenColor', label: 'screen colour', type: 'color' },
    { key: 'textColor', label: 'text colour', type: 'color' },
    { key: 'frameColor', label: 'frame colour', type: 'color' },
    { key: 'framePct', label: 'screen width %', type: 'number', min: 40, max: 100 },
    { key: 'textFont', label: 'font', type: 'font' },
    { key: 'textSize', label: 'text size', type: 'number', min: 10, max: 40 },
    { key: 'typewriter', label: 'type it in', type: 'bool' },
    { key: 'scanlines', label: 'scanlines', type: 'bool' },
    ...TIMING,
    ...COMMON,
  ],
  bullets: [
    ...SUBJECT,
    { key: 'text', label: 'points (one per line)', type: 'textarea' },
    { key: 'title', label: 'heading', type: 'text' },
    { key: 'markerColor', label: 'marker colour', type: 'color' },
    { key: 'align', label: 'align', type: 'select', options: ['left', 'centre'] },
    { key: 'textXPct', label: 'x %', type: 'number', min: 0, max: 100 },
    { key: 'textYPct', label: 'first line y %', type: 'number', min: 0, max: 100 },
    { key: 'dim', label: 'darken footage', type: 'number', min: 0, max: 100 },
    { key: 'textFont', label: 'font', type: 'font' },
    { key: 'textSize', label: 'text size', type: 'number', min: 10, max: 60 },
    { key: 'textColor', label: 'text colour', type: 'color' },
    { key: 'typewriter', label: 'type it in', type: 'bool' },
    ...TIMING,
    ...COMMON,
  ],
  news: [
    ...SUBJECT,
    { key: 'channel', label: 'channel / banner', type: 'text' },
    { key: 'text', label: 'headline', type: 'text' },
    { key: 'body', label: 'body text', type: 'textarea' },
    { key: 'highlight', label: 'highlight these phrases (one per line)', type: 'textarea' },
    { key: 'accent', label: 'banner colour', type: 'color' },
    { key: 'panelColor', label: 'card colour', type: 'color' },
    { key: 'panelWidthPct', label: 'card width %', type: 'number', min: 40, max: 100 },
    { key: 'anchor', label: 'card position', type: 'select', options: ['bottom', 'top', 'centre'] },
    { key: 'highlightColor', label: 'highlighter', type: 'color' },
    { key: 'textFont', label: 'headline font', type: 'font' },
    { key: 'textSize', label: 'headline size', type: 'number', min: 12, max: 60 },
    { key: 'bodyFont', label: 'body font', type: 'font' },
    { key: 'bodySize', label: 'body size', type: 'number', min: 10, max: 30 },
    { key: 'textColor', label: 'text colour', type: 'color' },
    ...TIMING,
    ...COMMON,
  ],
  source: [
    ...SUBJECT,
    { key: 'text', label: 'source line (url / outlet)', type: 'text' },
    { key: 'body', label: 'quoted text', type: 'textarea' },
    { key: 'highlight', label: 'highlight these phrases (one per line)', type: 'textarea' },
    { key: 'highlightColor', label: 'highlighter', type: 'color' },
    { key: 'anchor', label: 'corner', type: 'select', options: ['bottom-left', 'bottom-right', 'top-left', 'top-right'] },
    { key: 'panelColor', label: 'panel colour', type: 'color' },
    { key: 'panelWidthPct', label: 'panel width %', type: 'number', min: 20, max: 90 },
    { key: 'accent', label: 'source colour', type: 'color' },
    { key: 'bodyFont', label: 'font', type: 'font' },
    { key: 'bodySize', label: 'text size', type: 'number', min: 8, max: 26 },
    { key: 'textColor', label: 'text colour', type: 'color' },
    ...TIMING,
    ...COMMON,
  ],
  target: [
    ...SUBJECT,
    { key: 'boxes', label: 'boxes — LABEL @ x%,y%,w%,h% @ delay (one per line)', type: 'textarea' },
    { key: 'accent', label: 'box colour', type: 'color' },
    { key: 'thickness', label: 'line thickness', type: 'number', min: 1, max: 12 },
    { key: 'corner', label: 'corner ticks only', type: 'bool' },
    { key: 'labelBox', label: 'chip behind label', type: 'bool' },
    { key: 'push', label: 'slow push in', type: 'bool' },
    { key: 'textFont', label: 'label font', type: 'font' },
    { key: 'textSize', label: 'label size', type: 'number', min: 10, max: 46 },
    { key: 'textColor', label: 'label colour', type: 'color' },
    { key: 'dim', label: 'darken footage', type: 'number', min: 0, max: 100 },
    ...TIMING,
    ...COMMON,
  ],
  route: [
    { key: 'place', label: 'from (place)', type: 'text' },
    { key: 'placeTo', label: 'to (place)', type: 'text' },
    { key: 'text', label: 'title', type: 'text' },
    { key: 'mapStyle', label: 'map style', type: 'select', options: ['navy', 'plain', 'noir', 'blueprint'] },
    { key: 'accent', label: 'route colour', type: 'color' },
    { key: 'pinColor', label: 'marker colour', type: 'color' },
    { key: 'dashes', label: 'dash count', type: 'number', min: 6, max: 60 },
    { key: 'labelPlaces', label: 'label both ends', type: 'bool' },
    { key: 'zoomPad', label: 'framing padding %', type: 'number', min: 5, max: 60 },
    ...TEXT_CONTROLS,
    ...TIMING,
    ...COMMON,
  ],
  tree: [
    { key: 'images', label: 'portraits', type: 'images', count: 4 },
    { key: 'text', label: 'names (split with |)', type: 'text' },
    { key: 'parentText', label: 'top name', type: 'text' },
    { key: 'parentImage', label: 'top portrait', type: 'images', count: 1 },
    { key: 'nodeWidthPct', label: 'portrait width %', type: 'number', min: 6, max: 30 },
    { key: 'lineColor', label: 'connector colour', type: 'color' },
    { key: 'border', label: 'frame px', type: 'number', min: 0, max: 20 },
    { key: 'borderColor', label: 'frame colour', type: 'color' },
    { key: 'captionFont', label: 'name font', type: 'font' },
    { key: 'captionSize', label: 'name size', type: 'number', min: 8, max: 40 },
    { key: 'captionColor', label: 'name colour', type: 'color' },
    { key: 'background', label: 'background', type: 'background' },
    ...TIMING,
    ...COMMON,
  ],
  callout: [
    ...SUBJECT,
    { key: 'text', label: 'heading', type: 'text' },
    { key: 'body', label: 'body text', type: 'textarea' },
    { key: 'side', label: 'panel side', type: 'select', options: ['right', 'left'] },
    { key: 'accent', label: 'heading colour', type: 'color' },
    { key: 'marker', label: 'arrow marker', type: 'bool' },
    { key: 'panelColor', label: 'panel colour', type: 'color' },
    { key: 'panelWidthPct', label: 'panel width %', type: 'number', min: 25, max: 70 },
    { key: 'textFont', label: 'heading font', type: 'font' },
    { key: 'textSize', label: 'heading size', type: 'number', min: 14, max: 80 },
    { key: 'bodyFont', label: 'body font', type: 'font' },
    { key: 'bodySize', label: 'body size', type: 'number', min: 10, max: 36 },
    { key: 'textColor', label: 'body colour', type: 'color' },
    { key: 'dim', label: 'darken footage', type: 'number', min: 0, max: 100 },
    ...TIMING,
    ...COMMON,
  ],
  cctv: [
    ...SUBJECT,
    { key: 'text', label: 'bottom caption', type: 'text' },
    { key: 'timestamp', label: 'timestamp chip', type: 'text' },
    { key: 'timestampColor', label: 'chip colour', type: 'color' },
    { key: 'faces', label: 'face thumbnails', type: 'images', count: 2 },
    { key: 'faceNames', label: 'face names (split with |)', type: 'text' },
    { key: 'faceSide', label: 'faces on', type: 'select', options: ['left', 'right'] },
    { key: 'tint', label: 'night-vision tint %', type: 'number', min: 0, max: 100 },
    { key: 'grain', label: 'grain', type: 'number', min: 0, max: 60 },
    { key: 'textFont', label: 'font', type: 'font' },
    { key: 'textSize', label: 'caption size', type: 'number', min: 10, max: 40 },
    { key: 'textColor', label: 'caption colour', type: 'color' },
    ...TIMING,
    ...COMMON,
  ],
  transcript: [
    { key: 'text', label: 'typed text', type: 'textarea' },
    { key: 'images', label: 'paper / background', type: 'images', count: 1 },
    { key: 'scrollPct', label: 'scroll % of overflow', type: 'number', min: 0, max: 200 },
    { key: 'paperColor', label: 'paper colour (no image)', type: 'color' },
    { key: 'dim', label: 'darken background', type: 'number', min: 0, max: 100 },
    { key: 'textFont', label: 'font', type: 'font' },
    { key: 'textSize', label: 'text size', type: 'number', min: 10, max: 40 },
    { key: 'textColor', label: 'text colour', type: 'color' },
    { key: 'marginPct', label: 'side margin %', type: 'number', min: 2, max: 40 },
    ...TIMING,
    ...COMMON,
  ],
  tag: [
    ...SUBJECT,
    { key: 'text', label: 'label', type: 'text' },
    { key: 'subtitle', label: 'second line', type: 'text' },
    { key: 'anchor', label: 'corner', type: 'select', options: ['bottom-left', 'bottom-right', 'top-left', 'top-right'] },
    { key: 'accent', label: 'rule colour', type: 'color' },
    { key: 'accentWidthPct', label: 'rule width %', type: 'number', min: 0, max: 60 },
    ...TEXT_CONTROLS.filter((c) => !c.key.endsWith('Pct')),
    { key: 'subtitleSize', label: 'second line size', type: 'number', min: 8, max: 40 },
    ...TIMING,
    ...COMMON,
  ],
  card: [
    ...SUBJECT,
    { key: 'text', label: 'caption', type: 'text' },
    { key: 'entry', label: 'entry', type: 'select', options: ['pop', 'slide'] },
    { key: 'cardWidthPct', label: 'card width %', type: 'number', min: 20, max: 95 },
    { key: 'border', label: 'border px', type: 'number', min: 0, max: 40 },
    { key: 'borderColor', label: 'border colour', type: 'color' },
    { key: 'captionFont', label: 'caption font', type: 'font' },
    { key: 'captionSize', label: 'caption size', type: 'number', min: 10, max: 80 },
    { key: 'captionColor', label: 'caption colour', type: 'color' },
    { key: 'typewriter', label: 'type it in', type: 'bool' },
    { key: 'background', label: 'background', type: 'background' },
    ...TIMING,
    ...COMMON,
  ],
  photo: [
    ...SUBJECT,
    { key: 'text', label: 'caption', type: 'text' },
    { key: 'cardWidthPct', label: 'photo width %', type: 'number', min: 20, max: 95 },
    { key: 'border', label: 'photo border px', type: 'number', min: 0, max: 40 },
    { key: 'borderColor', label: 'border colour', type: 'color' },
    { key: 'drift', label: 'drift %', type: 'number', min: 0, max: 30 },
    { key: 'rotate', label: 'rotation °', type: 'number', min: -20, max: 20 },
    { key: 'captionFont', label: 'caption font', type: 'font' },
    { key: 'captionSize', label: 'caption size', type: 'number', min: 10, max: 80 },
    { key: 'captionColor', label: 'caption colour', type: 'color' },
    { key: 'background', label: 'background', type: 'background' },
    ...TIMING,
    ...COMMON,
  ],
  pair: [{ key: 'images', label: 'images', type: 'images', count: 2 }, ...MULTI, ...TIMING, ...COMMON],
  trio: [{ key: 'images', label: 'images', type: 'images', count: 3 }, ...MULTI, ...TIMING, ...COMMON],
  scatter: [
    { key: 'images', label: 'images', type: 'images', count: 3 },
    { key: 'spread', label: 'spread %', type: 'number', min: 10, max: 60 },
    { key: 'rotate', label: 'max tilt °', type: 'number', min: 0, max: 25 },
    { key: 'drift', label: 'drift %', type: 'number', min: 0, max: 20 },
    ...MULTI,
    ...TIMING,
    ...COMMON,
  ],
  compare: [
    { key: 'images', label: 'images', type: 'images', count: 2 },
    { key: 'divider', label: 'divider px', type: 'number', min: 0, max: 20 },
    { key: 'dividerColor', label: 'divider colour', type: 'color' },
    ...MULTI,
    ...TIMING,
    ...COMMON,
  ],
  annotate: [
    ...SUBJECT,
    {
      key: 'annotations',
      label: 'labels — TEXT @ x%,y% @ delay (one per line)',
      type: 'textarea',
    },
    { key: 'chip', label: 'chip behind label', type: 'bool' },
    { key: 'chipColor', label: 'chip colour', type: 'color' },
    ...TEXT_CONTROLS.filter((c) => !c.key.endsWith('Pct')),
    ...TIMING,
    ...COMMON,
  ],
  map: [
    { key: 'place', label: 'place name', type: 'text' },
    { key: 'text', label: 'label (blank = place name)', type: 'text' },
    { key: 'dateLine', label: 'date line', type: 'text' },
    { key: 'zoomFrom', label: 'zoom from (2 world → 13 street)', type: 'number', min: 2, max: 13 },
    { key: 'zoomTo', label: 'zoom to', type: 'number', min: 2, max: 13 },
    { key: 'mapStyle', label: 'style', type: 'select', options: ['navy', 'plain', 'noir', 'blueprint'] },
    { key: 'wideLabel', label: 'wide-phase label (blank = country)', type: 'text' },
    { key: 'mapMode', label: 'wide phase', type: 'select', options: ['flat', 'globe'] },
    { key: 'globeSizePct', label: 'globe size %', type: 'number', min: 40, max: 200 },
    { key: 'spaceColor', label: 'space colour', type: 'color' },
    { key: 'region', label: 'colour in this region (place name)', type: 'text' },
    { key: 'regionColor', label: 'region colour', type: 'color' },
    { key: 'regionFill', label: 'region fill %', type: 'number', min: 0, max: 100 },
    { key: 'tilt', label: '3D tilt (0 = flat)', type: 'number', min: 0, max: 45 },
    { key: 'tiltMode', label: '3D move', type: 'select', options: ['flyin', 'hold', 'orbit'] },
    { key: 'yaw', label: 'orbit sweep %', type: 'number', min: 0, max: 30 },
    { key: 'pinColor', label: 'pin colour', type: 'color' },
    { key: 'dateColor', label: 'date colour', type: 'color' },
    ...TEXT_CONTROLS,
    ...TIMING,
    ...COMMON,
  ],
  article: [
    ...SUBJECT,
    { key: 'text', label: 'article body', type: 'textarea' },
    { key: 'highlight', label: 'highlight these phrases (one per line)', type: 'textarea' },
    { key: 'redact', label: 'black out these phrases (one per line)', type: 'textarea' },
    { key: 'redactColor', label: 'redaction colour', type: 'color' },
    { key: 'badge', label: 'source badge', type: 'text' },
    { key: 'panel', label: 'panel', type: 'select', options: ['sheet', 'strip', 'card'] },
    { key: 'panelWidthPct', label: 'panel width %', type: 'number', min: 30, max: 100 },
    { key: 'panelColor', label: 'panel colour', type: 'color' },
    { key: 'highlightColor', label: 'highlighter', type: 'color' },
    { key: 'highlightEvery', label: 'highlight every (s)', type: 'number', min: 0.2, max: 5 },
    { key: 'textFont', label: 'font', type: 'font' },
    { key: 'textSize', label: 'text size', type: 'number', min: 10, max: 48 },
    { key: 'textColor', label: 'text colour', type: 'color' },
    { key: 'dim', label: 'darken footage', type: 'number', min: 0, max: 100 },
    ...TIMING,
    ...COMMON,
  ],
  stat: [
    ...SUBJECT,
    { key: 'text', label: 'stat', type: 'text' },
    { key: 'punch', label: 'punch in', type: 'bool' },
    ...TEXT_CONTROLS,
    ...TIMING,
    ...COMMON,
  ],
  title: [
    { key: 'text', label: 'title', type: 'text' },
    { key: 'background', label: 'background', type: 'background' },
    ...TEXT_CONTROLS,
    ...TIMING,
    ...COMMON,
  ],
  label: [
    ...SUBJECT,
    { key: 'text', label: 'name', type: 'text' },
    { key: 'accent', label: 'underline colour', type: 'color' },
    { key: 'accentWidthPct', label: 'underline width %', type: 'number', min: 0, max: 100 },
    ...TEXT_CONTROLS,
    ...TIMING,
    ...COMMON,
  ],
  year: [
    ...SUBJECT,
    { key: 'text', label: 'year / date', type: 'text' },
    ...TEXT_CONTROLS,
    ...TIMING,
    ...COMMON,
  ],
  chip: [
    ...SUBJECT,
    { key: 'text', label: 'date / tag', type: 'text' },
    { key: 'chipColor', label: 'chip colour', type: 'color' },
    ...TEXT_CONTROLS,
    ...TIMING,
    ...COMMON,
  ],
  vhs: [
    ...SUBJECT,
    { key: 'text', label: 'tape label', type: 'text' },
    { key: 'timecode', label: 'live timecode', type: 'bool' },
    { key: 'grain', label: 'grain', type: 'number', min: 0, max: 60 },
    ...TEXT_CONTROLS,
    ...TIMING,
    ...COMMON,
  ],
};

export const isImage = (p: string) => /\.(png|jpe?g|webp|bmp)$/i.test(p);
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown, d: string) => (typeof v === 'string' && v !== '' ? v : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);

/**
 * Input args for a source that must fill `durationSec`. A still needs
 * `-loop 1` or ffmpeg emits a single frame (and then exits 0 with an empty
 * file); a clip shorter than the shot needs `-stream_loop`.
 */
export function feedArgs(path: string, durationSec: number, startSec = 0): string[] {
  if (isImage(path)) return ['-loop', '1', '-t', String(durationSec), '-i', path];
  const seek = startSec > 0 ? ['-ss', String(startSec)] : [];
  return [...seek, '-stream_loop', '-1', '-t', String(durationSec), '-i', path];
}

/**
 * drawtext's inline text parser crashes on quotes and non-ASCII, so every
 * string is written to a file and referenced with `textfile=`. Files are
 * content-hashed, so repeated renders reuse them.
 */
async function textFile(text: string): Promise<string> {
  const key = createHash('sha1').update(text).digest('hex').slice(0, 20);
  const rel = `temp/editinglab/text/${key}.txt`;
  await mkdir(TEXT_DIR, { recursive: true });
  await writeFile(join(config.root, rel), text, 'utf8');
  return rel;
}

interface TextOpts {
  font: string;
  size: number;
  color: string;
  y: number | string;
  x?: string;
  borderw?: number;
  box?: { color: string; pad: number };
  /** Broadcast-style drop shadow instead of an outline (map/title cards). */
  shadow?: boolean;
}

async function drawText(text: string, o: TextOpts, enable: string): Promise<string> {
  const parts = [
    `drawtext=fontfile=${o.font}`,
    `textfile=${await textFile(text)}`,
    `fontcolor=${o.color}`,
    `fontsize=${o.size}`,
    // Quoted: position expressions contain commas (min/pow), which would
    // otherwise terminate the filter.
    `x='${o.x ?? '(w-text_w)/2'}'`,
    `y='${o.y}'`,
    `enable='${enable}'`,
  ];
  if (o.box) parts.push('box=1', `boxcolor=${o.box.color}`, `boxborderw=${o.box.pad}`);
  else if (o.shadow) {
    const off = Math.max(2, Math.round(o.size * 0.06));
    parts.push(`shadowx=${off}`, `shadowy=${off}`, 'shadowcolor=black@0.7', 'borderw=1', 'bordercolor=black@0.4');
  } else parts.push(`borderw=${o.borderw ?? 2}`, 'bordercolor=black@0.55');
  return parts.join(':');
}

/**
 * Character reveal. drawtext can't animate its own text, so this emits one
 * drawtext per step with only one enabled at a time (steps capped so the
 * filtergraph stays sane on long text).
 */
async function typewriter(
  text: string,
  o: TextOpts,
  start: number,
  dur: number,
  on: boolean,
  /** Extra condition ANDed onto every step — e.g. hide again after a cut. */
  until = '',
): Promise<string> {
  const gate = (e: string) => (until ? `(${e})*(${until})` : e);
  if (!on) return drawText(text, o, gate(`gte(t,${start.toFixed(2)})`));
  const steps = Math.min(text.length, 26);
  const per = dur / steps;
  const parts: string[] = [];
  for (let i = 1; i <= steps; i += 1) {
    const n = Math.ceil((text.length * i) / steps);
    const t0 = start + (i - 1) * per;
    const enable =
      i === steps ? `gte(t,${t0.toFixed(3)})` : `between(t,${t0.toFixed(3)},${(t0 + per).toFixed(3)})`;
    parts.push(await drawText(text.slice(0, n), o, gate(enable)));
  }
  return parts.join(',');
}

/**
 * Fakes a camera looking down at the map plane: the source trapezoid's top
 * edge is pulled in, so mapping it back to the frame stretches the distance
 * and the ground appears to recede. `perspective` has no `t`, only the frame
 * counter `on` — everything here runs at 30fps, so on/30 is the clock.
 *
 *   flyin — starts tilted, settles flat as the zoom lands
 *   hold  — constant tilt for the whole shot
 *   orbit — constant tilt with a slow yaw sweep
 */
function tiltFilter(mode: string, tiltPct: number, durationSec: number, yawPct: number): string {
  if (tiltPct <= 0) return '';
  const k = tiltPct / 100;
  const settle = Math.max(0.6, durationSec * 0.6);
  const p = `min(1,on/${(30 * settle).toFixed(0)})`;
  const kx = mode === 'flyin' ? `${k}*(1-${p})` : `${k}`;
  const yaw = mode === 'orbit' && yawPct > 0 ? `+W*${(yawPct / 100).toFixed(3)}*sin(on/${(30 / 0.7).toFixed(1)})` : '';
  return (
    `,perspective=x0='W*(${kx})${yaw}':y0=0:` +
    `x1='W-W*(${kx})${yaw}':y1=0:` +
    `x2=0:y2=H:x3=W:y3=H:sense=source:eval=frame`
  );
}

/** Ease-out-back-ish 0→1 over `d` seconds starting at `at` — the pop. */
const popExpr = (d: number, at = 0) => {
  const u = `min(1,max(0,(t-${at})/${d}))`;
  return `(1-pow(1-${u},3))*(1+0.09*sin(3.14159*${u}))`;
};
/** Remaining slide distance at time t (px), settling `d` seconds after `at`. */
const slideExpr = (px: number, d: number, at = 0) => `${px}*pow(1-min(1,max(0,(t-${at})/${d})),3)`;

interface WrappedLine {
  text: string;
  /** Character range in the whitespace-normalised source, so a highlight
   *  phrase can be matched across the line breaks it happens to straddle. */
  start: number;
  end: number;
}

/**
 * Average glyph advance per font, as a fraction of the size. Courier is
 * monospace and genuinely wide; Impact is very narrow. Getting this wrong
 * overruns the panel (too small) or wastes half of it (too large).
 */
function glyphWidth(font: string): number {
  if (/courier|consol/i.test(font)) return 0.62;
  if (/impact/i.test(font)) return 0.42;
  if (/arialn/i.test(font)) return 0.44;
  if (/bahnschrift/i.test(font)) return 0.46;
  if (/georgia/i.test(font)) return 0.5;
  return 0.52;
}

/** Greedy wrap using an average glyph width — good enough for a text panel. */
function wrap(text: string, maxPx: number, fontSize: number, font = ''): WrappedLine[] {
  const perChar = fontSize * glyphWidth(font);
  const maxChars = Math.max(8, Math.floor(maxPx / perChar));
  const norm = text.replace(/\s+/g, ' ').trim();
  const out: WrappedLine[] = [];
  let i = 0;
  while (i < norm.length) {
    let end = Math.min(norm.length, i + maxChars);
    if (end < norm.length) {
      const sp = norm.lastIndexOf(' ', end);
      if (sp > i) end = sp;
    }
    out.push({ text: norm.slice(i, end).trim(), start: i, end });
    i = end + 1;
  }
  return out;
}

/** Character ranges of each highlight phrase, in the order they appear. */
function highlightRanges(text: string, phrases: string[]): Array<[number, number]> {
  const norm = text.replace(/\s+/g, ' ').trim().toLowerCase();
  return phrases
    .map((p) => {
      const at = norm.indexOf(p.replace(/\s+/g, ' ').trim().toLowerCase());
      return at < 0 ? null : ([at, at + p.trim().length] as [number, number]);
    })
    .filter((r): r is [number, number] => r !== null)
    .sort((a, b) => a[0] - b[0]);
}

interface Annotation {
  text: string;
  xPct: number;
  yPct: number;
  at: number;
}

/** `LABEL @ 30,78 @ 1.2` — position and timing are optional, in that order. */
function parseAnnotations(raw: string, stagger: number, delay: number): Annotation[] {
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line, i) => {
      const [text = '', pos = '', at = ''] = line.split('@').map((s) => s.trim());
      const [x, y] = pos.split(',').map((n) => Number(n));
      return {
        text,
        xPct: Number.isFinite(x) ? x : 50,
        yPct: Number.isFinite(y) ? y : 20 + i * 12,
        at: at !== '' && Number.isFinite(Number(at)) ? Number(at) : delay + i * stagger,
      };
    });
}

const cover = `scale=${CANVAS.w}:${CANVAS.h}:force_original_aspect_ratio=increase,crop=${CANVAS.w}:${CANVAS.h},setsar=1,fps=30`;
const coverTo = (w: number, h: number) =>
  `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,fps=30`;

/** Build the full ffmpeg argv for one composition. */
export async function buildCompose(
  preset: Composition,
  input: ComposeInput,
  outPath: string,
): Promise<string[]> {
  const c: Record<string, unknown> = {
    ...preset,
    ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined && v !== '')),
  };
  const kind = preset.kind;
  const D = num(c.durationSec, 4);
  const text = str(c.text, '');
  const delay = num(c.entryDelay, 0);
  const stagger = num(c.stagger, 0.25);
  const inputs: string[] = [];
  const chains: string[] = [];

  const bgPath = str(c.background, '');
  const selfBg = bgPath === 'self';
  const feed = (p: string) => feedArgs(p, D);

  // Subjects: `images` for the multi-image kinds, `image` for the rest.
  const subjects = (Array.isArray(input.images) ? input.images : []).filter(Boolean);
  if (!subjects.length && input.image) subjects.push(input.image);

  let idx = 0;
  let bgIdx = -1;
  const subIdx: number[] = [];
  const wantsBg = bgPath && !selfBg;
  if (wantsBg) {
    inputs.push(...feed(bgPath));
    bgIdx = idx++;
  }

  const font = str(c.textFont, 'assets/fonts/impact.ttf');
  const size = num(c.textSize, 90);
  const color = str(c.textColor, 'white');
  const typeIt = bool(c.typewriter, true);
  const xExpr = c.textXPct === undefined ? '(w-text_w)/2' : `${Math.round((CANVAS.w * num(c.textXPct, 50)) / 100)}-text_w/2`;
  const yPos = Math.round((CANVAS.h * num(c.textYPct, 42)) / 100);

  if (kind === 'map') {
    // Place name → two stitched OSM maps, zoomed and cross-faded, pin on top.
    // The palette is baked into the cached PNG (see staticMap), so the video
    // pass is just crop + type.
    const place = await geocode(str(c.place, text || 'Plainfield, Wisconsin'));
    const zFrom = Math.round(num(c.zoomFrom, ZOOM.country));
    const zTo = Math.round(num(c.zoomTo, ZOOM.town));
    const style = str(c.mapStyle, 'navy') as MapStyle;
    const mapW = 1920;
    const mapH = 1080;
    const wide = await staticMap(place.lat, place.lon, zFrom, mapW, mapH, style);
    const close = zTo === zFrom ? wide : await staticMap(place.lat, place.lon, zTo, mapW, mapH, style);

    inputs.push(...feedArgs(wide, D));
    const wideIdx = idx++;
    let closeIdx = wideIdx;
    if (close !== wide) {
      inputs.push(...feedArgs(close, D));
      closeIdx = idx++;
    }

    // Slow push on each map; the cut between them happens mid-shot.
    const push = (from: number, to: number) =>
      `crop=w='iw/(${from}+${(to - from).toFixed(3)}*min(t/${D},1))':h='ih/(${from}+${(to - from).toFixed(3)}*min(t/${D},1))':x='(iw-out_w)/2':y='(ih-out_h)/2',scale=${CANVAS.w}:${CANVAS.h},setsar=1,fps=30`;
    const cut = Math.max(0.4, D * 0.45);
    // The tilt runs on the composited plate so both phases share one camera.
    const tilt = tiltFilter(str(c.tiltMode, 'flyin'), num(c.tilt, 0), D, num(c.yaw, 0));

    // Wide phase is either the flat map or the planet seen from space.
    if (str(c.mapMode, 'flat') === 'globe') {
      const globe = await globeMap(place.lat, place.lon, 1080, style);
      inputs.push(...feedArgs(globe, D));
      const gIdx = idx++;
      const globeSize = Math.round((CANVAS.h * num(c.globeSizePct, 92)) / 100);
      chains.push(`color=c=${str(c.spaceColor, '0x05080F')}:s=${CANVAS.w}x${CANVAS.h}:d=${D}:r=30[space]`);
      chains.push(`[${gIdx}:v]scale=${globeSize}:${globeSize},format=rgba[globe]`);
      chains.push(`[space][globe]overlay=x='(W-w)/2':y='(H-h)/2'[gplate]`);
      chains.push(`[gplate]${push(1.0, 1.22)}[mwide]`);
    } else {
      chains.push(`[${wideIdx}:v]${push(1.0, 1.18)}[mwide]`);
    }

    // Colour in the region on the close map, the way a locator does.
    const regionName = str(c.region, '');
    if (regionName && closeIdx !== wideIdx) {
      const area = await geocode(regionName);
      const mask = await regionMask(area, zTo, mapW, mapH);
      if (mask) {
        inputs.push(...feedArgs(mask, D));
        const mIdx = idx++;
        const rc = str(c.regionColor, '0xF2C744');
        const fillPct = num(c.regionFill, 30) / 100;
        chains.push(
          `[${mIdx}:v]format=gray,split=3[mfill][medge][mtmp]`,
          `color=c=${rc}:s=${mapW}x${mapH}[fillsrc]`,
          `[mfill]lut=y='val*${fillPct.toFixed(2)}'[mfilla]`,
          `[fillsrc][mfilla]alphamerge[fillA]`,
          // outline = mask minus an eroded copy of itself
          `[mtmp]erosion,erosion,erosion,negate[inner]`,
          `[medge][inner]blend=all_mode=multiply[edge]`,
          `color=c=${rc}:s=${mapW}x${mapH}[strokesrc]`,
          `[strokesrc][edge]alphamerge[strokeA]`,
          `[${closeIdx}:v][fillA]overlay[rg1]`,
          `[rg1][strokeA]overlay[closeplate]`,
        );
        chains.push(`[closeplate]${push(1.25, 1.02)}[mclose]`);
      }
    }
    if (closeIdx !== wideIdx && !chains.some((l) => l.endsWith('[mclose]'))) {
      chains.push(`[${closeIdx}:v]${push(1.25, 1.02)}[mclose]`);
    }
    if (closeIdx !== wideIdx) {
      chains.push(`[mwide][mclose]xfade=transition=fade:duration=0.6:offset=${cut.toFixed(2)}[tilted]`);
    } else {
      chains.push('[mwide]null[tilted]');
    }
    chains.push(tilt ? `[tilted]${tilt.slice(1)}[base]` : '[tilted]null[base]');

    const twoPhase = closeIdx !== wideIdx;
    const pinAt = twoPhase ? cut + 0.6 : delay;
    const pin = num(c.pinSize, 18);
    const pinColor = str(c.pinColor, '0xE01B1B');
    const cx = CANVAS.w / 2;
    const cy = CANVAS.h / 2;
    const bigSize = num(c.textSize, 64);
    const layers: string[] = [];

    // Wide phase carries the country (or whatever you type), close phase the
    // place — same beat structure as the reference.
    // The country only belongs on the wide phase of a real country→town jump;
    // a 9→10 nudge is the same view. "none" forces it off.
    const isGlobe = str(c.mapMode, 'flat') === 'globe';
    const autoWide = twoPhase && (isGlobe || zTo - zFrom >= 3) ? place.name.split(',').pop()?.trim() ?? '' : '';
    const wideLabel = c.wideLabel === 'none' ? '' : str(c.wideLabel, autoWide);
    if (wideLabel) {
      layers.push(
        await typewriter(
          wideLabel.toUpperCase(),
          { font, size: Math.round(bigSize * 1.05), color, y: `${yPos}`, x: xExpr, shadow: true },
          delay + 0.15,
          0.5,
          typeIt,
          `lt(t,${cut.toFixed(2)})`,
        ),
      );
      const dateWide = str(c.dateLine, '');
      if (dateWide) {
        layers.push(
          await typewriter(
            dateWide.toUpperCase(),
            { font, size: Math.round(bigSize * 0.5), color: str(c.dateColor, '0xF2C744'), y: `${yPos + Math.round(bigSize)}`, x: xExpr, shadow: true },
            delay + 0.6,
            0.4,
            typeIt,
            `lt(t,${cut.toFixed(2)})`,
          ),
        );
      }
    }

    layers.push(
      // A real round dot: the bullet glyph is safe now that text goes through
      // textfile=, and borderw gives it the white ring so it reads on any map.
      await drawText(
        '●',
        { font: 'assets/fonts/arialbd.ttf', size: pin * 2, color: pinColor, x: `${Math.round(cx)}-text_w/2`, y: `${Math.round(cy)}-text_h/2`, borderw: 3 },
        `gte(t,${pinAt.toFixed(2)})`,
      ),
      await typewriter(
        str(c.text, str(c.place, place.name).split(',')[0]).toUpperCase(),
        { font, size: bigSize, color, y: `${yPos}`, x: xExpr, shadow: true },
        pinAt + 0.15,
        0.5,
        typeIt,
      ),
    );
    const dateLine = str(c.dateLine, '');
    if (dateLine && !wideLabel) {
      layers.push(
        await typewriter(
          dateLine.toUpperCase(),
          { font, size: Math.round(bigSize * 0.5), color: str(c.dateColor, '0xF2C744'), y: `${yPos + Math.round(bigSize * 0.95)}`, x: xExpr, shadow: true },
          pinAt + 0.5,
          0.4,
          typeIt,
        ),
      );
    }
    // OSM data requires visible attribution.
    layers.push(
      await drawText(
        '© OpenStreetMap contributors',
        { font: 'assets/fonts/bahnschrift.ttf', size: 14, color: 'white@0.75', y: `${CANVAS.h - 26}`, x: `${CANVAS.w - 14}-text_w`, borderw: 1 },
        'gte(t,0)',
      ),
    );
    chains.push(`[base]${layers.join(',')}[out]`);
  } else if (kind === 'pair' || kind === 'trio' || kind === 'compare') {
    // Side-by-side cells, each entering on its own beat.
    const n = kind === 'trio' ? 3 : 2;
    const pics = Array.from({ length: n }, (_, i) => subjects[i] ?? subjects[subjects.length - 1]);
    const gutter = kind === 'compare' ? 0 : num(c.gutter, 14);
    const b = num(c.border, 0);
    const cellW = even((CANVAS.w - gutter * (n + 1)) / n);
    const cellH = even(CANVAS.h - gutter * 2);
    const captions = text.split('|').map((s) => s.trim());

    if (bgIdx >= 0) chains.push(`[${bgIdx}:v]${cover}[bed]`);
    else chains.push(`color=c=black:s=${CANVAS.w}x${CANVAS.h}:d=${D}:r=30[bed]`);

    let stage = 'bed';
    for (let i = 0; i < n; i += 1) {
      inputs.push(...feed(pics[i]));
      const si = idx++;
      subIdx.push(si);
      const inner = b > 0 ? [even(cellW - b * 2), even(cellH - b * 2)] : [cellW, cellH];
      chains.push(
        `[${si}:v]${coverTo(inner[0], inner[1])}` +
          (b > 0 ? `,pad=${cellW}:${cellH}:${b}:${b}:${str(c.borderColor, 'white')}` : '') +
          `[cell${i}]`,
      );
      const restX = gutter + i * (cellW + gutter);
      const at = delay + i * stagger;
      const x =
        str(c.entry, 'slide') === 'slide'
          ? `${restX}+${slideExpr(i % 2 === 0 ? -CANVAS.w : CANVAS.w, 0.5, at)}`
          : `${restX}`;
      chains.push(`[${stage}][cell${i}]overlay=x='${x}':y=${gutter}:enable='gte(t,${at.toFixed(2)})'[st${i}]`);
      stage = `st${i}`;
    }

    const layers: string[] = [];
    if (kind === 'compare' && num(c.divider, 4) > 0) {
      const dw = num(c.divider, 4);
      layers.push(
        `drawbox=x=${Math.round(CANVAS.w / 2 - dw / 2)}:y=0:w=${dw}:h=${CANVAS.h}:color=${str(c.dividerColor, 'white')}:t=fill`,
      );
    }
    for (let i = 0; i < n; i += 1) {
      if (!captions[i]) continue;
      const centre = gutter + i * (cellW + gutter) + cellW / 2;
      layers.push(
        await drawText(
          captions[i],
          {
            font: str(c.captionFont, 'assets/fonts/impact.ttf'),
            size: num(c.captionSize, 28),
            color: str(c.captionColor, 'white'),
            y: `${CANVAS.h - gutter - 52}`,
            x: `${Math.round(centre)}-text_w/2`,
            borderw: 3,
          },
          `gte(t,${(delay + i * stagger + 0.35).toFixed(2)})`,
        ),
      );
    }
    chains.push(layers.length ? `[${stage}]${layers.join(',')}[out]` : `[${stage}]null[out]`);
  } else if (kind === 'scatter') {
    // Tilted bordered photos popping in over a blurred bed.
    const pics = subjects.slice(0, 3);
    while (pics.length < 1) pics.push(subjects[0]);
    const spread = num(c.spread, 26) / 100;
    const tilt = num(c.rotate, 7);
    const b = num(c.border, 12);
    const picW = even(CANVAS.w * (pics.length > 2 ? 0.36 : 0.42));
    const picH = even(picW * 0.72);
    const captions = text.split('|').map((s) => s.trim());

    if (bgIdx >= 0) chains.push(`[${bgIdx}:v]${cover},gblur=sigma=22,eq=brightness=-0.18[bed]`);
    else {
      inputs.push(...feed(pics[0]));
      const bi = idx++;
      chains.push(`[${bi}:v]${cover},gblur=sigma=26,eq=brightness=-0.22:saturation=0.85[bed]`);
    }

    let stage = 'bed';
    for (let i = 0; i < pics.length; i += 1) {
      inputs.push(...feed(pics[i]));
      const si = idx++;
      const ang = (((i % 2 === 0 ? -1 : 1) * tilt * (1 - i * 0.25)) * Math.PI) / 180;
      // rgba + rotate with a transparent fill keeps the tilt clean over the bed.
      chains.push(
        `[${si}:v]${coverTo(even(picW - b * 2), even(picH - b * 2))},pad=${picW}:${picH}:${b}:${b}:${str(c.borderColor, '0xF2EFE6')},format=rgba,rotate=${ang.toFixed(4)}:c=none:ow=rotw(${ang.toFixed(4)}):oh=roth(${ang.toFixed(4)})[pic${i}]`,
      );
      const at = delay + i * stagger;
      const off = (i - (pics.length - 1) / 2) * spread * CANVAS.w;
      const x = `(W-w)/2+${Math.round(off)}`;
      const y = `(H-h)/2+${Math.round((i % 2 === 0 ? 1 : -1) * CANVAS.h * 0.05)}+${slideExpr(60, 0.5, at)}`;
      const drift = num(c.drift, 0) / 100;
      const dx = drift > 0 ? `+${Math.round(drift * CANVAS.w)}*sin(0.4*t+${i})` : '';
      chains.push(
        `[${stage}][pic${i}]overlay=x='${x}${dx}':y='${y}':enable='gte(t,${at.toFixed(2)})'[sc${i}]`,
      );
      stage = `sc${i}`;
    }
    const layers: string[] = [];
    if (captions[0]) {
      layers.push(
        await typewriter(
          captions[0],
          {
            font: str(c.captionFont, 'assets/fonts/impact.ttf'),
            size: num(c.captionSize, 30),
            color: str(c.captionColor, 'white'),
            y: `${CANVAS.h - 84}`,
            borderw: 3,
          },
          delay + pics.length * stagger,
          0.4,
          typeIt,
        ),
      );
    }
    chains.push(layers.length ? `[${stage}]${layers.join(',')}[out]` : `[${stage}]null[out]`);
  } else if (kind === 'terminal') {
    // Green-on-black console: a framed screen with a header bar and lines
    // that type in one after another.
    const framePct = num(c.framePct, 78);
    const fw = even((CANVAS.w * framePct) / 100);
    const fh = even(fw * 0.5);
    const fx = Math.round((CANVAS.w - fw) / 2);
    const fy = Math.round((CANVAS.h - fh) / 2);
    const screen = str(c.screenColor, '0x030A05');
    const tcol = str(c.textColor, '0x35FF7A');
    const frameCol = str(c.frameColor, '0x35FF7A');
    const tFont = str(c.textFont, 'assets/fonts/courier.ttf');
    const tSize = num(c.textSize, 18);
    const lineH = Math.round(tSize * 1.7);
    const prompt = str(c.prompt, '> ');

    if (subjects[0]) {
      inputs.push(...feed(subjects[0]));
      const si = idx++;
      chains.push(`[${si}:v]${cover},eq=brightness=-0.35:saturation=0.5[base]`);
    } else {
      chains.push(`color=c=black:s=${CANVAS.w}x${CANVAS.h}:d=${D}:r=30[base]`);
    }

    const layers: string[] = [
      `drawbox=x=${fx}:y=${fy}:w=${fw}:h=${fh}:color=${screen}:t=fill:enable='gte(t,${delay.toFixed(2)})'`,
      `drawbox=x=${fx}:y=${fy}:w=${fw}:h=${fh}:color=${frameCol}:t=2:enable='gte(t,${delay.toFixed(2)})'`,
    ];
    const header = str(c.header, '');
    if (header) {
      layers.push(
        `drawbox=x=${fx}:y=${fy}:w=${fw}:h=${tSize + 14}:color=${frameCol}:t=fill:enable='gte(t,${delay.toFixed(2)})'`,
        await drawText(
          header,
          { font: tFont, size: tSize, color: screen, y: `${fy + 7}`, x: `${fx + 12}`, borderw: 0 },
          `gte(t,${(delay + 0.05).toFixed(2)})`,
        ),
      );
    }
    const rows = text.split('\n').map((x) => x.trim()).filter(Boolean);
    const top = fy + (header ? tSize + 26 : 18);
    for (let i = 0; i < rows.length; i += 1) {
      const at = delay + 0.2 + i * Math.max(0.15, stagger);
      layers.push(
        await typewriter(
          `${prompt}${rows[i]}`,
          { font: tFont, size: tSize, color: tcol, y: `${top + i * lineH}`, x: `${fx + 16}`, borderw: 0 },
          at,
          0.35,
          typeIt,
        ),
      );
    }
    // Gentle CRT banding, appended to the same chain so the graph still ends
    // on [out] — a stray [out2] would leave nothing mapped.
    const scan = bool(c.scanlines, true)
      ? `,geq=lum='lum(X\\,Y)*(0.93+0.07*sin(Y*3.14159/2))':cb='cb(X\\,Y)':cr='cr(X\\,Y)'`
      : '';
    chains.push(`[base]${layers.join(',')}${scan}[out]`);
  } else if (kind === 'bullets') {
    // Points that land one at a time, each on its own marker strip.
    inputs.push(...feed(subjects[0]));
    const si = idx++;
    const dimPct = num(c.dim, 45) / 100;
    chains.push(`[${si}:v]${cover},eq=brightness=-${dimPct.toFixed(2)}:saturation=${(1 - dimPct * 0.4).toFixed(2)}[base]`);

    const rows = text.split('\n').map((x) => x.trim()).filter(Boolean);
    const tSize = num(c.textSize, 26);
    const lineH = Math.round(tSize * 2.05);
    const centred = str(c.align, 'left') === 'centre';
    const xPos = Math.round((CANVAS.w * num(c.textXPct, centred ? 50 : 12)) / 100);
    const x = centred ? `${xPos}-text_w/2` : `${xPos}`;
    const top = Math.round((CANVAS.h * num(c.textYPct, 32)) / 100);
    const marker = str(c.markerColor, '0x2BD46A@0.92');
    const layers: string[] = [];
    const heading = str(c.title, '');
    if (heading) {
      layers.push(
        await typewriter(
          heading,
          { font, size: Math.round(tSize * 1.3), color: str(c.textColor, 'white'), y: `${top - Math.round(lineH * 1.2)}`, x, shadow: true },
          delay,
          0.35,
          typeIt,
        ),
      );
    }
    for (let i = 0; i < rows.length; i += 1) {
      const at = delay + 0.25 + i * Math.max(0.2, stagger);
      layers.push(
        await typewriter(
          rows[i],
          { font, size: tSize, color: str(c.textColor, '0x0B0B0B'), y: `${top + i * lineH}`, x, box: { color: marker, pad: 8 } },
          at,
          0.3,
          typeIt,
        ),
      );
    }
    chains.push(`[base]${layers.join(',')}[out]`);
  } else if (kind === 'news') {
    // Channel banner + headline + body: the news-card lower third.
    inputs.push(...feed(subjects[0]));
    const si = idx++;
    chains.push(`[${si}:v]${cover}[base]`);

    const pw = Math.round((CANVAS.w * num(c.panelWidthPct, 62)) / 100);
    const px = Math.round((CANVAS.w - pw) / 2);
    const headSize = num(c.textSize, 24);
    const bodySize = num(c.bodySize, 16);
    const bodyFont = str(c.bodyFont, 'assets/fonts/bahnschrift.ttf');
    const headFont = str(c.textFont, 'assets/fonts/arialbd.ttf');
    const bodyLines = wrap(str(c.body, ''), pw - 28, bodySize, bodyFont);
    const barH = Math.round(headSize * 1.5);
    const panelH = barH + Math.round(headSize * 1.9) + bodyLines.length * Math.round(bodySize * 1.45) + 22;
    const anchor = str(c.anchor, 'bottom');
    const py = anchor === 'top' ? 30 : anchor === 'centre' ? Math.round((CANVAS.h - panelH) / 2) : CANVAS.h - panelH - 26;
    const accent = str(c.accent, '0xC01818');
    const dy = slideExpr(Math.round(CANVAS.h * 0.05), 0.35, delay);

    const layers: string[] = [
      `drawbox=x=${px}:y='${py + barH}+${dy}':w=${pw}:h=${panelH - barH}:color=${str(c.panelColor, 'white@0.96')}:t=fill:enable='gte(t,${delay.toFixed(2)})'`,
      `drawbox=x=${px}:y='${py}+${dy}':w=${pw}:h=${barH}:color=${accent}:t=fill:enable='gte(t,${delay.toFixed(2)})'`,
    ];
    const channel = str(c.channel, '');
    if (channel) {
      layers.push(
        await drawText(
          channel,
          { font: headFont, size: Math.round(headSize * 0.8), color: 'white', y: `${py + Math.round(barH * 0.22)}+${dy}`, x: `${px + 14}`, borderw: 0 },
          `gte(t,${(delay + 0.05).toFixed(2)})`,
        ),
      );
    }
    if (text) {
      layers.push(
        await typewriter(
          text,
          { font: headFont, size: headSize, color: str(c.textColor, '0x111111'), y: `${py + barH + 12}+${dy}`, x: `${px + 14}`, borderw: 0 },
          delay + 0.15,
          0.4,
          typeIt,
        ),
      );
    }
    const newsPhrases = String(c.highlight ?? '').split('\n').map((x) => x.trim()).filter(Boolean);
    const newsRanges = highlightRanges(str(c.body, ''), newsPhrases);
    for (let i = 0; i < bodyLines.length; i += 1) {
      const line = bodyLines[i];
      if (!line.text) continue;
      const ly = `${py + barH + Math.round(headSize * 1.9) + i * Math.round(bodySize * 1.45)}+${dy}`;
      layers.push(
        await drawText(
          line.text,
          { font: bodyFont, size: bodySize, color: str(c.textColor, '0x1a1a1a'), y: ly, x: `${px + 14}`, borderw: 0 },
          `gte(t,${(delay + 0.35).toFixed(2)})`,
        ),
      );
      const hit = newsRanges.findIndex(([s, e]) => s < line.end && e > line.start);
      if (hit >= 0) {
        layers.push(
          await drawText(
            line.text,
            { font: bodyFont, size: bodySize, color: '0x111111', y: ly, x: `${px + 14}`, box: { color: str(c.highlightColor, 'yellow@0.95'), pad: 3 } },
            `gte(t,${(delay + 0.9 + hit * 0.5).toFixed(2)})`,
          ),
        );
      }
    }
    chains.push(`[base]${layers.join(',')}[out]`);
  } else if (kind === 'source') {
    // The small "Source: …" citation block the OSINT edits park in a corner.
    inputs.push(...feed(subjects[0]));
    const si = idx++;
    chains.push(`[${si}:v]${cover}[base]`);

    const pw = Math.round((CANVAS.w * num(c.panelWidthPct, 46)) / 100);
    const bodySize = num(c.bodySize, 13);
    const bodyFont = str(c.bodyFont, 'assets/fonts/bahnschrift.ttf');
    const lines = wrap(str(c.body, ''), pw - 20, bodySize, bodyFont);
    const lineH = Math.round(bodySize * 1.5);
    const panelH = lines.length * lineH + Math.round(bodySize * 2.2) + 16;
    const anchor = str(c.anchor, 'bottom-left');
    const px = anchor.endsWith('right') ? CANVAS.w - pw - 26 : 26;
    const py = anchor.startsWith('top') ? 26 : CANVAS.h - panelH - 26;
    const dy = slideExpr(30, 0.3, delay);

    const layers: string[] = [
      `drawbox=x=${px}:y='${py}+${dy}':w=${pw}:h=${panelH}:color=${str(c.panelColor, 'black@0.72')}:t=fill:enable='gte(t,${delay.toFixed(2)})'`,
      await drawText(
        text || 'Source',
        { font: bodyFont, size: bodySize + 1, color: str(c.accent, '0x6FB7FF'), y: `${py + 8}+${dy}`, x: `${px + 10}`, borderw: 0 },
        `gte(t,${(delay + 0.05).toFixed(2)})`,
      ),
    ];
    const srcRanges = highlightRanges(
      str(c.body, ''),
      String(c.highlight ?? '').split('\n').map((x) => x.trim()).filter(Boolean),
    );
    for (let i = 0; i < lines.length; i += 1) {
      if (!lines[i].text) continue;
      const ly = `${py + Math.round(bodySize * 2.2) + i * lineH}+${dy}`;
      layers.push(
        await drawText(
          lines[i].text,
          { font: bodyFont, size: bodySize, color: str(c.textColor, '0xEDEDED'), y: ly, x: `${px + 10}`, borderw: 0 },
          `gte(t,${(delay + 0.15).toFixed(2)})`,
        ),
      );
      const hit = srcRanges.findIndex(([s, e]) => s < lines[i].end && e > lines[i].start);
      if (hit >= 0) {
        layers.push(
          await drawText(
            lines[i].text,
            { font: bodyFont, size: bodySize, color: '0x111111', y: ly, x: `${px + 10}`, box: { color: str(c.highlightColor, 'yellow@0.9'), pad: 2 } },
            `gte(t,${(delay + 0.8 + hit * 0.45).toFixed(2)})`,
          ),
        );
      }
    }
    chains.push(`[base]${layers.join(',')}[out]`);
  } else if (kind === 'target') {
    // Satellite-style call-out boxes: outlines that appear on their own beat
    // with a label chip above each.
    inputs.push(...feed(subjects[0]));
    const si = idx++;
    const dimPct = num(c.dim, 0) / 100;
    let base = `[${si}:v]${cover}`;
    if (dimPct > 0) base += `,eq=brightness=-${dimPct.toFixed(2)}`;
    if (bool(c.push, true)) {
      base += `,crop=w='iw/(1+0.10*min(t/${D},1))':h='ih/(1+0.10*min(t/${D},1))':x='(iw-out_w)/2':y='(ih-out_h)/2',scale=${CANVAS.w}:${CANVAS.h}`;
    }
    chains.push(`${base}[base]`);

    const th = num(c.thickness, 3);
    const accent = str(c.accent, '0xE01B1B');
    // holds both plain drawbox strings and pending drawText promises
    const layers: Array<string | Promise<string>> = [];
    const specs = str(c.boxes, '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    specs.forEach((line, i) => {
      const [label = '', geo = '', at = ''] = line.split('@').map((x) => x.trim());
      const [bx = 35, by = 35, bw = 30, bh = 25] = geo.split(',').map((n) => Number(n));
      const t0 = at !== '' && Number.isFinite(Number(at)) ? Number(at) : delay + i * Math.max(0.2, stagger);
      const X = Math.round((CANVAS.w * bx) / 100);
      const Y = Math.round((CANVAS.h * by) / 100);
      const W = Math.round((CANVAS.w * bw) / 100);
      const H = Math.round((CANVAS.h * bh) / 100);
      const on = `gte(t,${t0.toFixed(2)})`;
      if (bool(c.corner, false)) {
        // four corner ticks instead of a full rectangle
        const tick = Math.round(Math.min(W, H) * 0.22);
        for (const [cx, cy, dx2, dy2] of [
          [X, Y, 1, 1],
          [X + W - tick, Y, 1, 1],
          [X, Y + H - th, 1, 1],
          [X + W - tick, Y + H - th, 1, 1],
        ] as number[][]) {
          layers.push(`drawbox=x=${cx}:y=${cy}:w=${tick}:h=${th}:color=${accent}:t=fill:enable='${on}'`);
        }
        for (const [cx, cy] of [
          [X, Y],
          [X + W - th, Y],
          [X, Y + H - tick],
          [X + W - th, Y + H - tick],
        ] as number[][]) {
          layers.push(`drawbox=x=${cx}:y=${cy}:w=${th}:h=${tick}:color=${accent}:t=fill:enable='${on}'`);
        }
      } else {
        layers.push(`drawbox=x=${X}:y=${Y}:w=${W}:h=${H}:color=${accent}:t=${th}:enable='${on}'`);
      }
      if (label) {
        layers.push(
          drawText(
            label,
            {
              font,
              size: num(c.textSize, 22),
              color: str(c.textColor, 'white'),
              y: `${Math.max(4, Y - num(c.textSize, 22) - 14)}`,
              x: `${X}`,
              ...(bool(c.labelBox, true) ? { box: { color: `${accent}@0.9`, pad: 6 } } : { shadow: true }),
            },
            `gte(t,${(t0 + 0.15).toFixed(2)})`,
          ),
        );
      }
    });
    // the label helper is async; resolve them all before joining
    const resolved = await Promise.all(layers);
    chains.push(`[base]${resolved.join(',')}[out]`);
  } else if (kind === 'route') {
    // Two places on one map with a dashed path drawn between them.
    const from = await geocode(str(c.place, 'Muzaffarabad, Pakistan'));
    const to = await geocode(str(c.placeTo, 'Pahalgam, India'));
    const style = str(c.mapStyle, 'navy') as MapStyle;
    const padPct = num(c.zoomPad, 25) / 100;
    const mapW = 1920;
    const mapH = 1080;
    const midLat = (from.lat + to.lat) / 2;
    const midLon = (from.lon + to.lon) / 2;
    // Largest zoom that still frames both ends with padding.
    let z = 12;
    let a = { x: 0, y: 0 };
    let b = { x: 0, y: 0 };
    for (; z >= 2; z -= 1) {
      a = projectPx(from.lat, from.lon, z);
      b = projectPx(to.lat, to.lon, z);
      if (Math.abs(a.x - b.x) < mapW * (1 - padPct) && Math.abs(a.y - b.y) < mapH * (1 - padPct)) break;
    }
    const mapPath = await staticMap(midLat, midLon, z, mapW, mapH, style);
    inputs.push(...feedArgs(mapPath, D));
    const mi = idx++;
    chains.push(`[${mi}:v]scale=${CANVAS.w}:${CANVAS.h},setsar=1,fps=30[base]`);

    // map pixels → canvas pixels
    const centre = projectPx(midLat, midLon, z);
    const toCanvas = (p: { x: number; y: number }) => ({
      x: Math.round(((p.x - (centre.x - mapW / 2)) * CANVAS.w) / mapW),
      y: Math.round(((p.y - (centre.y - mapH / 2)) * CANVAS.h) / mapH),
    });
    const A = toCanvas(a);
    const B = toCanvas(b);

    const dashes = Math.round(num(c.dashes, 22));
    const accent = str(c.accent, '0xE01B1B');
    const pinColor = str(c.pinColor, '0xE01B1B');
    const layers: string[] = [];
    for (let i = 0; i < dashes; i += 1) {
      if (i % 2 === 1) continue; // gaps
      const p = i / (dashes - 1);
      const dx = Math.round(A.x + (B.x - A.x) * p);
      const dy2 = Math.round(A.y + (B.y - A.y) * p);
      const at = delay + 0.3 + (i / dashes) * Math.max(0.6, D * 0.45);
      layers.push(`drawbox=x=${dx - 3}:y=${dy2 - 3}:w=7:h=7:color=${accent}:t=fill:enable='gte(t,${at.toFixed(2)})'`);
    }
    for (const [pt, name, at] of [
      [A, str(c.place, ''), delay],
      [B, str(c.placeTo, ''), delay + 0.3 + Math.max(0.6, D * 0.45)],
    ] as Array<[{ x: number; y: number }, string, number]>) {
      layers.push(
        await drawText(
          '●',
          { font: 'assets/fonts/arialbd.ttf', size: 30, color: pinColor, x: `${pt.x}-text_w/2`, y: `${pt.y}-text_h/2`, borderw: 3 },
          `gte(t,${at.toFixed(2)})`,
        ),
      );
      if (bool(c.labelPlaces, true) && name) {
        layers.push(
          await drawText(
            name.split(',')[0].toUpperCase(),
            { font, size: Math.round(num(c.textSize, 34) * 0.8), color, x: `${pt.x}-text_w/2`, y: `${pt.y + 18}`, shadow: true },
            `gte(t,${(at + 0.2).toFixed(2)})`,
          ),
        );
      }
    }
    if (text) {
      layers.push(
        await typewriter(
          text,
          { font, size: num(c.textSize, 44), color, y: `${Math.round((CANVAS.h * num(c.textYPct, 12)) / 100)}`, x: '(w-text_w)/2', shadow: true },
          delay + 0.1,
          0.4,
          typeIt,
        ),
      );
    }
    layers.push(
      await drawText(
        '© OpenStreetMap contributors',
        { font: 'assets/fonts/bahnschrift.ttf', size: 14, color: 'white@0.75', y: `${CANVAS.h - 26}`, x: `${CANVAS.w - 14}-text_w`, borderw: 1 },
        'gte(t,0)',
      ),
    );
    chains.push(`[base]${layers.join(',')}[out]`);
  } else if (kind === 'tree') {
    // Family tree: a row of framed portraits under an optional head-of-family
    // node, joined by drawn connectors. Nodes land one after another.
    const pics = subjects.slice(0, 4).filter(Boolean);
    const names = text.split('|').map((x) => x.trim());
    const nodeW = even((CANVAS.w * num(c.nodeWidthPct, 14)) / 100);
    const nodeH = even(nodeW * 1.25);
    const b = num(c.border, 3);
    const lineColor = str(c.lineColor, '0x8A8A94');
    const rowY = Math.round(CANVAS.h * 0.52);
    const parentImg = Array.isArray(c.parentImage)
      ? ((c.parentImage as string[])[0] ?? '')
      : str(c.parentImage, '');
    const parentName = str(c.parentText, '');
    const hasParent = Boolean(parentImg || parentName);
    const parentY = Math.round(CANVAS.h * 0.14);

    if (bgIdx >= 0) chains.push(`[${bgIdx}:v]${cover}[bed]`);
    else chains.push(`color=c=${str(c.paperColor, '0x101014')}:s=${CANVAS.w}x${CANVAS.h}:d=${D}:r=30[bed]`);

    const gap = pics.length > 1 ? Math.round((CANVAS.w * 0.74) / pics.length) : 0;
    const firstX = Math.round(CANVAS.w / 2 - (gap * (pics.length - 1)) / 2);
    const lines: string[] = [];
    if (hasParent && pics.length) {
      // trunk down from the parent, one rail across, a drop into each child
      lines.push(
        `drawbox=x=${Math.round(CANVAS.w / 2 - 1)}:y=${parentY + nodeH}:w=2:h=${Math.max(2, rowY - parentY - nodeH - 24)}:color=${lineColor}:t=fill`,
        `drawbox=x=${firstX}:y=${rowY - 24}:w=${Math.max(2, gap * (pics.length - 1))}:h=2:color=${lineColor}:t=fill`,
      );
      for (let i = 0; i < pics.length; i += 1) {
        lines.push(`drawbox=x=${firstX + i * gap - 1}:y=${rowY - 24}:w=2:h=24:color=${lineColor}:t=fill`);
      }
    }

    let stage = 'bed';
    if (parentImg) {
      inputs.push(...feed(parentImg));
      const pi = idx++;
      chains.push(
        `[${pi}:v]${coverTo(even(nodeW - b * 2), even(nodeH - b * 2))},pad=${nodeW}:${nodeH}:${b}:${b}:${str(c.borderColor, '0xE8E4D8')}[pnode]`,
      );
      chains.push(`[bed][pnode]overlay=x='(W-w)/2':y=${parentY}:enable='gte(t,${delay.toFixed(2)})'[pstage]`);
      stage = 'pstage';
    }

    for (let i = 0; i < pics.length; i += 1) {
      inputs.push(...feed(pics[i]));
      const si = idx++;
      chains.push(
        `[${si}:v]${coverTo(even(nodeW - b * 2), even(nodeH - b * 2))},pad=${nodeW}:${nodeH}:${b}:${b}:${str(c.borderColor, '0xE8E4D8')}[node${i}]`,
      );
      const at = delay + (hasParent ? 0.3 : 0) + i * stagger;
      chains.push(
        `[${stage}][node${i}]overlay=x=${Math.round(firstX + i * gap - nodeW / 2)}:y=${rowY}:enable='gte(t,${at.toFixed(2)})'[tn${i}]`,
      );
      stage = `tn${i}`;
    }

    const capFont = str(c.captionFont, 'assets/fonts/georgiai.ttf');
    const capSize = num(c.captionSize, 18);
    const capColor = str(c.captionColor, '0xE8E4D8');
    const labels: string[] = [...lines];
    if (parentName) {
      labels.push(
        await drawText(
          parentName,
          { font: capFont, size: capSize + 2, color: capColor, y: `${parentY + nodeH + 8}` },
          `gte(t,${delay.toFixed(2)})`,
        ),
      );
    }
    for (let i = 0; i < pics.length; i += 1) {
      if (!names[i]) continue;
      labels.push(
        await drawText(
          names[i],
          { font: capFont, size: capSize, color: capColor, y: `${rowY + nodeH + 8}`, x: `${firstX + i * gap}-text_w/2` },
          `gte(t,${(delay + (hasParent ? 0.3 : 0) + i * stagger + 0.2).toFixed(2)})`,
        ),
      );
    }
    chains.push(labels.length ? `[${stage}]${labels.join(',')}[out]` : `[${stage}]null[out]`);
  } else if (kind === 'callout') {
    // A still with a heading + paragraph panel beside it, gold rule under the
    // heading — the "Strict Restrictions" / "A Fixed Routine" cards.
    inputs.push(...feed(subjects[0]));
    const si = idx++;
    const dim = num(c.dim, 40) / 100;
    chains.push(`[${si}:v]${cover},eq=brightness=-${dim.toFixed(2)}:saturation=${(1 - dim * 0.4).toFixed(2)}[base]`);

    const pw = Math.round((CANVAS.w * num(c.panelWidthPct, 42)) / 100);
    const onLeft = str(c.side, 'right') === 'left';
    const px = onLeft ? Math.round(CANVAS.w * 0.07) : CANVAS.w - pw - Math.round(CANVAS.w * 0.07);
    const headSize = num(c.textSize, 30);
    const bodySize = num(c.bodySize, 17);
    const bodyFont = str(c.bodyFont, 'assets/fonts/georgiai.ttf');
    const headFont = str(c.textFont, 'assets/fonts/georgiab.ttf');
    const bodyLines = wrap(str(c.body, ''), pw, bodySize, bodyFont);
    const panelH = Math.round(headSize * 2.4 + bodyLines.length * bodySize * 1.5 + 24);
    const py = Math.round((CANVAS.h - panelH) / 2);
    const dy = slideExpr(Math.round(CANVAS.h * 0.04), 0.4, delay);
    const accent = str(c.accent, '0xE0B43C');

    const layers: string[] = [];
    const panelColor = str(c.panelColor, '');
    if (panelColor) {
      layers.push(
        `drawbox=x=${px - 18}:y='${py - 14}+${dy}':w=${pw + 36}:h=${panelH + 28}:color=${panelColor}:t=fill:enable='gte(t,${delay.toFixed(2)})'`,
      );
    }
    if (bool(c.marker, true)) {
      layers.push(
        await drawText(
          // ► is U+25BA, which arial bold and impact carry; the prettier
          // U+25B6 is missing from every font here and renders as tofu.
          '►',
          { font: 'assets/fonts/arialbd.ttf', size: Math.round(headSize * 0.55), color: accent, y: `${Math.round(py + headSize * 0.28)}+${dy}`, x: `${px - 26}` },
          `gte(t,${(delay + 0.1).toFixed(2)})`,
        ),
      );
    }
    layers.push(
      await typewriter(
        text,
        { font: headFont, size: headSize, color: accent, y: `${py}+${dy}`, x: `${px}`, shadow: true },
        delay + 0.15,
        0.4,
        typeIt,
      ),
      `drawbox=x=${px}:y='${py + headSize + 8}+${dy}':w=${Math.round(pw * 0.5)}:h=2:color=${accent}:t=fill:enable='gte(t,${(delay + 0.35).toFixed(2)})'`,
    );
    for (let i = 0; i < bodyLines.length; i += 1) {
      if (!bodyLines[i].text) continue;
      layers.push(
        await drawText(
          bodyLines[i].text,
          {
            font: bodyFont,
            size: bodySize,
            color: str(c.textColor, '0xE6E2D8'),
            y: `${Math.round(py + headSize * 1.9 + i * bodySize * 1.5)}+${dy}`,
            x: `${px}`,
            borderw: 1,
          },
          `gte(t,${(delay + 0.5).toFixed(2)})`,
        ),
      );
    }
    chains.push(`[base]${layers.join(',')}[out]`);
  } else if (kind === 'cctv') {
    // Security-camera plate: tinted and grainy, red timestamp chip, caption
    // bar along the bottom, optional face thumbnails with names.
    inputs.push(...feed(subjects[0]));
    const si = idx++;
    const tint = num(c.tint, 55) / 100;
    const grain = num(c.grain, 22);
    chains.push(
      `[${si}:v]${cover},hue=s=${(1 - tint).toFixed(2)},colorbalance=gm=${(0.35 * tint).toFixed(2)}:gs=${(0.25 * tint).toFixed(2)}:bm=-${(0.12 * tint).toFixed(2)},eq=contrast=1.12:brightness=-0.05,noise=alls=${grain}:allf=t,vignette=PI/4.5[base]`,
    );

    const faces = (Array.isArray(c.faces) ? (c.faces as string[]) : []).filter(Boolean).slice(0, 2);
    const faceNames = str(c.faceNames, '')
      .split('|')
      .map((x) => x.trim());
    const faceW = even(CANVAS.w * 0.09);
    const faceH = even(faceW * 1.15);
    const onLeftSide = str(c.faceSide, 'left') === 'left';
    const facePos = (i: number) => ({
      x: onLeftSide ? 22 + i * 26 : CANVAS.w - faceW - 22 - i * 26,
      y: 22 + i * Math.round(faceH * 0.85),
    });

    let stage = 'base';
    for (let i = 0; i < faces.length; i += 1) {
      inputs.push(...feed(faces[i]));
      const fi = idx++;
      chains.push(`[${fi}:v]${coverTo(even(faceW - 4), even(faceH - 4))},pad=${faceW}:${faceH}:2:2:white[face${i}]`);
      const { x, y } = facePos(i);
      chains.push(`[${stage}][face${i}]overlay=x=${x}:y=${y}:enable='gte(t,${(delay + i * stagger).toFixed(2)})'[cc${i}]`);
      stage = `cc${i}`;
    }

    const capFont = str(c.textFont, 'assets/fonts/arialbd.ttf');
    const capSize = num(c.textSize, 20);
    const layers: string[] = [];
    for (let i = 0; i < faces.length; i += 1) {
      if (!faceNames[i]) continue;
      const { x, y } = facePos(i);
      layers.push(
        await drawText(
          faceNames[i],
          { font: 'assets/fonts/georgiai.ttf', size: 15, color: 'white', y: `${y + faceH + 3}`, x: `${x}`, box: { color: 'black@0.55', pad: 4 } },
          `gte(t,${(delay + i * stagger + 0.15).toFixed(2)})`,
        ),
      );
    }
    const stamp = str(c.timestamp, '');
    if (stamp) {
      layers.push(
        await drawText(
          stamp,
          { font: capFont, size: capSize, color: 'white', y: `${CANVAS.h - 78}`, x: '(w-text_w)/2', box: { color: str(c.timestampColor, '0xC01818'), pad: 8 } },
          `gte(t,${delay.toFixed(2)})`,
        ),
      );
    }
    if (text) {
      layers.push(
        `drawbox=x=0:y=${CANVAS.h - 44}:w=${CANVAS.w}:h=44:color=black@0.85:t=fill:enable='gte(t,${delay.toFixed(2)})'`,
        await drawText(
          text,
          { font: capFont, size: capSize, color: str(c.textColor, 'white'), y: `${CANVAS.h - 34}`, x: '(w-text_w)/2', borderw: 0 },
          `gte(t,${(delay + 0.1).toFixed(2)})`,
        ),
      );
    }
    chains.push(layers.length ? `[${stage}]${layers.join(',')}[out]` : `[${stage}]null[out]`);
  } else if (kind === 'transcript') {
    // Typed page: text over paper (an image, or a flat colour), scrolling.
    const marginPct = num(c.marginPct, 12);
    const mx = Math.round((CANVAS.w * marginPct) / 100);
    const fSize = num(c.textSize, 20);
    const lineH = Math.round(fSize * 1.6);
    const dimPct = num(c.dim, 0) / 100;
    if (subjects[0]) {
      inputs.push(...feed(subjects[0]));
      const si = idx++;
      chains.push(`[${si}:v]${cover}${dimPct > 0 ? `,eq=brightness=-${dimPct.toFixed(2)}` : ''}[base]`);
    } else {
      chains.push(`color=c=${str(c.paperColor, '0xE8E0CC')}:s=${CANVAS.w}x${CANVAS.h}:d=${D}:r=30[base]`);
    }
    const lines = wrap(text, CANVAS.w - mx * 2, fSize, str(c.textFont, 'assets/fonts/courier.ttf'));
    // Scroll only as far as the text actually overflows, so a short note stays
    // put instead of sliding out of frame. 100% = scroll exactly to the end.
    const topY = Math.round(CANVAS.h * 0.16);
    const overflow = Math.max(0, topY + lines.length * lineH + 40 - CANVAS.h);
    const scrollPx = Math.round((overflow * num(c.scrollPct, 100)) / 100);
    const scroll = scrollPx > 0 ? `-${scrollPx}*min(1,max(0,(t-${delay})/${Math.max(0.1, D - delay).toFixed(2)}))` : '';
    const layers: string[] = [];
    for (let i = 0; i < lines.length; i += 1) {
      if (!lines[i].text) continue;
      layers.push(
        await drawText(
          lines[i].text,
          {
            font: str(c.textFont, 'assets/fonts/courier.ttf'),
            size: fSize,
            color: str(c.textColor, '0x2A2418'),
            y: `${topY + i * lineH}${scroll}`,
            x: `${mx}`,
            borderw: 0,
          },
          `gte(t,${delay.toFixed(2)})`,
        ),
      );
    }
    chains.push(layers.length ? `[base]${layers.join(',')}[out]` : '[base]null[out]');
  } else if (kind === 'tag') {
    // Corner location/name tag with an optional second line and rule.
    inputs.push(...feed(subjects[0]));
    const si = idx++;
    chains.push(`[${si}:v]${cover}[base]`);
    const anchor = str(c.anchor, 'bottom-left');
    const pad = 34;
    const right = anchor.endsWith('right');
    const topSide = anchor.startsWith('top');
    const sub = str(c.subtitle, '');
    const subSize = num(c.subtitleSize, 16);
    const ty = topSide ? pad : CANVAS.h - pad - size - (sub ? subSize + 10 : 0);
    const tx = right ? `w-text_w-${pad}` : `${pad}`;
    const layers: string[] = [
      await typewriter(text, { font, size, color, y: `${ty}`, x: tx, shadow: true }, delay + 0.1, 0.4, typeIt),
    ];
    const ruleW = Math.round((CANVAS.w * num(c.accentWidthPct, 0)) / 100);
    if (ruleW > 0) {
      layers.push(
        `drawbox=x=${right ? CANVAS.w - pad - ruleW : pad}:y=${ty + size + 4}:w=${ruleW}:h=3:color=${str(c.accent, '0xC01818')}:t=fill:enable='gte(t,${(delay + 0.3).toFixed(2)})'`,
      );
    }
    if (sub) {
      layers.push(
        await drawText(
          sub,
          { font: str(c.captionFont, 'assets/fonts/bahnschrift.ttf'), size: subSize, color, y: `${ty + size + (ruleW > 0 ? 12 : 6)}`, x: tx, shadow: true },
          `gte(t,${(delay + 0.35).toFixed(2)})`,
        ),
      );
    }
    chains.push(`[base]${layers.join(',')}[out]`);
  } else if (kind === 'annotate') {
    // One shot, several labels, each at its own spot and its own moment.
    inputs.push(...feed(subjects[0]));
    const si = idx++;
    chains.push(`[${si}:v]${cover}[base]`);
    const notes = parseAnnotations(str(c.annotations, text), stagger, delay || 0.4);
    const layers: string[] = [];
    for (const a of notes) {
      const x = `${Math.round((CANVAS.w * a.xPct) / 100)}-text_w/2`;
      const y = `${Math.round((CANVAS.h * a.yPct) / 100)}`;
      layers.push(
        await typewriter(
          a.text,
          {
            font,
            size: num(c.textSize, 34),
            color,
            x,
            y,
            borderw: 3,
            ...(bool(c.chip, false) ? { box: { color: str(c.chipColor, 'black@0.75'), pad: 10 } } : {}),
          },
          a.at,
          0.35,
          typeIt,
        ),
      );
    }
    chains.push(layers.length ? `[base]${layers.join(',')}[out]` : '[base]null[out]');
  } else if (kind === 'stat' || kind === 'label' || kind === 'year' || kind === 'vhs' || kind === 'chip') {
    inputs.push(...feed(subjects[0]));
    const si = idx++;
    let base = `[${si}:v]${cover}`;
    if (kind === 'stat' && bool(c.punch, false)) {
      base += `,crop=w='iw/(1+0.12*min(t/${D},1))':h='ih/(1+0.12*min(t/${D},1))':x='(iw-out_w)/2':y='(ih-out_h)/2',scale=${CANVAS.w}:${CANVAS.h}`;
    }
    if (kind === 'vhs') {
      const grain = num(c.grain, 18);
      base += `,noise=alls=${grain}:allf=t,rgbashift=rh=2:bh=-2,eq=saturation=1.15:contrast=1.05,vignette=PI/5`;
    }
    chains.push(`${base}[base]`);

    const layers: string[] = [];
    if (kind === 'label') {
      const barW = Math.round((CANVAS.w * num(c.accentWidthPct, 34)) / 100);
      layers.push(
        `drawbox=x=${Math.round((CANVAS.w - barW) / 2)}:y=${yPos + size + 12}:w=${barW}:h=6:color=${str(c.accent, '0xC01818')}:t=fill:enable='gte(t,${(delay + POP_SEC).toFixed(2)})'`,
      );
    }
    if (kind === 'vhs') {
      layers.push(
        await drawText('SP', { font: str(c.textFont, 'assets/fonts/bahnschrift.ttf'), size: 26, color: 'white', y: 28, x: '40' }, 'gte(t,0)'),
        await drawText(text || 'PLAY', { font: str(c.textFont, 'assets/fonts/bahnschrift.ttf'), size: 26, color: 'white', y: 28, x: '110' }, 'gte(t,0)'),
      );
      if (bool(c.timecode, true)) {
        layers.push(
          `drawtext=fontfile=${str(c.textFont, 'assets/fonts/bahnschrift.ttf')}:text='%{pts\\:hms}':fontcolor=white:fontsize=26:x=w-text_w-40:y=28:borderw=2:bordercolor=black@0.55`,
        );
      }
    } else {
      layers.push(
        await typewriter(
          text,
          {
            font,
            size,
            color,
            y: `${yPos}`,
            x: xExpr,
            borderw: 3,
            ...(kind === 'chip' ? { box: { color: str(c.chipColor, '0x2B3A55@0.92'), pad: 14 } } : {}),
          },
          delay + POP_SEC * 0.4,
          0.45,
          typeIt,
        ),
      );
    }
    chains.push(`[base]${layers.join(',')}[out]`);
  } else if (kind === 'article') {
    const dim = num(c.dim, 45) / 100;
    const panelStyle = str(c.panel, 'sheet');
    const panelColor = str(c.panelColor, 'white@0.97');
    const hlColor = str(c.highlightColor, 'yellow@0.95');
    const fSize = num(c.textSize, 22);
    const fFont = str(c.textFont, 'assets/fonts/bahnschrift.ttf');
    const fColor = str(c.textColor, '0x1a1a1a');
    const pw = Math.round((CANVAS.w * num(c.panelWidthPct, panelStyle === 'strip' ? 96 : 62)) / 100);
    const px = Math.round((CANVAS.w - pw) / 2);
    const pad = Math.round(fSize * 1.4);
    const lineH = Math.round(fSize * 1.55);
    const lines = wrap(text, pw - pad * 2, fSize, fFont);
    const badge = str(c.badge, '');
    const bodyTop = badge ? pad + 34 : pad;
    const ph = Math.min(CANVAS.h - 40, bodyTop + lines.length * lineH + pad);
    const py = panelStyle === 'strip' ? CANVAS.h - ph - 18 : Math.round((CANVAS.h - ph) / 2);

    if (subjects[0]) {
      inputs.push(...feed(subjects[0]));
      const si = idx++;
      chains.push(`[${si}:v]${cover},eq=brightness=-${dim.toFixed(2)}:saturation=${(1 - dim * 0.5).toFixed(2)}[base]`);
    } else {
      chains.push(`[${bgIdx}:v]${cover}[base]`);
    }

    // Panel and every line share one slide-in offset so they move together.
    const dy = slideExpr(Math.round(CANVAS.h * 0.06), 0.35, delay);
    const layers: string[] = [
      `drawbox=x=${px}:y='${py}+${dy}':w=${pw}:h=${ph}:color=${panelColor}:t=fill:enable='gte(t,${delay.toFixed(2)})'`,
    ];
    if (badge) {
      layers.push(
        await drawText(
          badge,
          { font: 'assets/fonts/arialbd.ttf', size: 16, color: 'white', y: `${py + 12}+${dy}`, box: { color: 'black@0.9', pad: 7 } },
          `gte(t,${(delay + 0.05).toFixed(2)})`,
        ),
      );
    }

    const phrases = String(c.highlight ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
    const ranges = highlightRanges(text, phrases);
    const redactRanges = highlightRanges(
      text,
      String(c.redact ?? '').split('\n').map((x) => x.trim()).filter(Boolean),
    );
    const every = num(c.highlightEvery, 0.55);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (!line.text) continue;
      const y = `${py + bodyTop + i * lineH}+${dy}`;
      const x = `${px + pad}`;
      layers.push(await drawText(line.text, { font: fFont, size: fSize, color: fColor, y, x }, `gte(t,${(delay + 0.05).toFixed(2)})`));
      // A line lights up if any highlighted phrase overlaps its character
      // range — phrases usually straddle a line break.
      const hit = ranges.findIndex(([s, e]) => s < line.end && e > line.start);
      if (hit >= 0) {
        const at = (delay + 0.9 + hit * every).toFixed(2);
        layers.push(
          await drawText(line.text, { font: fFont, size: fSize, color: '0x111111', y, x, box: { color: hlColor, pad: 4 } }, `gte(t,${at})`),
        );
      }
      // Redaction: same text drawn in the bar's own colour, so the bar is
      // exactly as wide as the words it hides.
      const hid = redactRanges.findIndex(([s, e]) => s < line.end && e > line.start);
      if (hid >= 0) {
        const rc = str(c.redactColor, 'black');
        layers.push(
          await drawText(line.text, { font: fFont, size: fSize, color: rc, y, x, box: { color: rc, pad: 3 } }, `gte(t,${(delay + 0.05).toFixed(2)})`),
        );
      }
    }
    chains.push(`[base]${layers.join(',')}[out]`);
  } else if (kind === 'title') {
    const src = bgIdx >= 0 ? bgIdx : (() => { inputs.push(...feed(subjects[0])); return idx++; })();
    chains.push(`[${src}:v]${cover}[base]`);
    chains.push(
      `[base]${await typewriter(text, { font, size: num(c.textSize, 84), color, y: `${yPos}`, x: xExpr, borderw: 3 }, delay + 0.2, 0.5, typeIt)}[out]`,
    );
  } else {
    // card / photo — one subject sized on a bed, caption underneath.
    const image = subjects[0];
    const info = await probe(resolve(config.root, image));
    const aspect = (info.width || 16) / (info.height || 9);
    const b = num(c.border, 0);
    let cw = (CANVAS.w * num(c.cardWidthPct, 55)) / 100;
    let ch = cw / aspect;
    const maxH = CANVAS.h * 0.58;
    if (ch > maxH) {
      ch = maxH;
      cw = ch * aspect;
    }
    cw = even(cw);
    ch = even(ch);
    const fw = even(cw + b * 2);
    const fh = even(ch + b * 2);
    const centerY = Math.round(CANVAS.h * 0.44);
    const capY = Math.min(CANVAS.h - 52, Math.round(centerY + fh / 2 + 26));

    inputs.push(...feed(image));
    const si = idx++;
    if (selfBg || bgIdx < 0) {
      chains.push(`[${si}:v]split=2[sub][bgsrc]`);
      chains.push(`[bgsrc]${cover},gblur=sigma=28,eq=brightness=-0.10:saturation=0.9[bg]`);
    } else {
      chains.push(`[${bgIdx}:v]${cover}[bg]`);
      chains.push(`[${si}:v]null[sub]`);
    }

    const rot = (num(c.rotate, 0) * Math.PI) / 180;
    chains.push(
      `[sub]scale=${cw}:${ch}` +
        (b > 0 ? `,pad=${fw}:${fh}:${b}:${b}:${str(c.borderColor, 'white')}` : '') +
        (rot !== 0 ? `,format=rgba,rotate=${rot.toFixed(4)}:c=none:ow=rotw(${rot.toFixed(4)}):oh=roth(${rot.toFixed(4)})` : '') +
        ',setsar=1[cardbase]',
    );

    const drift = num(c.drift, 0);
    if (kind === 'photo' && drift > 0) {
      const amp = Math.round((CANVAS.w * drift) / 100 / 2);
      chains.push(
        `[bg][cardbase]overlay=x='(W-w)/2+${amp}*sin(0.5*t)':y='${centerY}-h/2+${Math.round(amp * 0.6)}*cos(0.4*t)'[stage]`,
      );
    } else if (str(c.entry, 'pop') === 'slide') {
      chains.push(
        `[bg][cardbase]overlay=x='(W-w)/2':y='${centerY - fh / 2}+${slideExpr(Math.round(CANVAS.h * 0.35), 0.45, delay)}':enable='gte(t,${delay.toFixed(2)})'[stage]`,
      );
    } else {
      const p = popExpr(POP_SEC, delay);
      chains.push(
        `[cardbase]scale=w='max(2,trunc((${fw}*(${p}))/2)*2)':h='max(2,trunc((${fh}*(${p}))/2)*2)':eval=frame[card]`,
      );
      chains.push(`[bg][card]overlay=x='(W-w)/2':y='${centerY}-h/2':enable='gte(t,${delay.toFixed(2)})'[stage]`);
    }

    const caption = text
      ? await typewriter(
          text,
          {
            font: str(c.captionFont, 'assets/fonts/impact.ttf'),
            size: num(c.captionSize, 26),
            color: str(c.captionColor, 'white'),
            y: capY,
          },
          delay + POP_SEC + 0.07,
          0.5,
          typeIt,
        )
      : 'null';
    chains.push(`[stage]${caption}[out]`);
  }

  // ---- audio: entry sfx aligned to the landing, optional music bed ----
  const sfx = str(c.sfx, '');
  const music = str(c.music, '');
  let sfxIdx = -1;
  let musIdx = -1;
  if (sfx) {
    inputs.push('-i', sfx);
    sfxIdx = idx++;
  }
  if (music) {
    inputs.push('-stream_loop', '-1', '-i', music);
    musIdx = idx++;
  }
  if (sfxIdx >= 0) {
    // Trim the sfx file's silent head, then push it back so its transient hits
    // when the graphic lands. The lead-in is concatenated silence, not adelay:
    // adelay does nothing downstream of silenceremove, and a simple -af is
    // ignored next to a -filter_complex.
    const sfxVol = num(c.sfxVolume, 100) / 100;
    chains.push(
      `anullsrc=channel_layout=stereo:sample_rate=48000:d=${(delay + POP_SEC).toFixed(2)}[sil]`,
      `[${sfxIdx}:a]silenceremove=start_periods=1:start_threshold=-45dB,aresample=48000,aformat=channel_layouts=stereo,volume=${sfxVol.toFixed(2)}[sfxa]`,
      `[sil][sfxa]concat=n=2:v=0:a=1,apad[sfxbed]`,
    );
  }
  if (musIdx >= 0) {
    const vol = num(c.musicVolume, 45) / 100;
    chains.push(
      `[${musIdx}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${vol.toFixed(2)},afade=t=in:st=0:d=0.4,afade=t=out:st=${Math.max(0, D - 0.8).toFixed(2)}:d=0.8[mus]`,
    );
  }
  const hasAudio = sfxIdx >= 0 || musIdx >= 0;
  if (sfxIdx >= 0 && musIdx >= 0) {
    chains.push('[sfxbed][mus]amix=inputs=2:duration=longest:normalize=0[aout]');
  } else if (sfxIdx >= 0) {
    chains.push('[sfxbed]anull[aout]');
  } else if (musIdx >= 0) {
    chains.push('[mus]apad[aout]');
  }

  const args = ['-y', ...inputs, '-filter_complex', chains.join(';'), '-map', '[out]'];
  args.push(...(hasAudio ? ['-map', '[aout]', '-c:a', 'aac', '-b:a', '160k'] : ['-an']));
  args.push(
    '-t', String(D),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', outPath,
  );
  return args;
}
