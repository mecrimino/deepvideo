/**
 * Animation presets — pure functions of progress (0→1) returning CSS.
 * Enter presets run over the first ENTER_SEC, exit presets over the last
 * EXIT_SEC, both driven by a spring for natural motion. Configurable via the
 * spec (a preset is just an id; tune constants here once for all templates).
 */

import { interpolate, spring } from 'remotion';
import type { PresetId } from './spec';

export const ENTER_SEC = 0.6;
export const EXIT_SEC = 0.4;

export interface Motion {
  opacity: number;
  transform: string;
  filter?: string;
  clipPath?: string;
}

/** progress: 0→1 springed; dir: 1 = entering, -1 = exiting. */
function css(preset: PresetId, p: number, dir: 1 | -1, px: number): Motion {
  const off = (1 - p) * px * dir; // slide distance remaining
  switch (preset) {
    case 'fade':        return { opacity: p, transform: 'none' };
    case 'slide_left':  return { opacity: p, transform: `translateX(${off}px)` };
    case 'slide_right': return { opacity: p, transform: `translateX(${-off}px)` };
    case 'slide_up':    return { opacity: p, transform: `translateY(${off}px)` };
    case 'slide_down':  return { opacity: p, transform: `translateY(${-off}px)` };
    case 'zoom':        return { opacity: p, transform: `scale(${0.85 + 0.15 * p})` };
    case 'scale_pop':   return { opacity: Math.min(1, p * 1.4), transform: `scale(${p})` };
    case 'bounce':      return { opacity: Math.min(1, p * 2), transform: `scale(${p})` };
    case 'blur_reveal': return { opacity: p, transform: 'none', filter: `blur(${(1 - p) * 14}px)` };
    case 'wipe':        return { opacity: 1, transform: 'none',
                                 clipPath: `inset(0 ${(1 - p) * 100}% 0 0)` };
    // kinetic_text / underline_draw are handled inside templates (word-level);
    // container just fades.
    default:            return { opacity: p, transform: 'none' };
  }
}

export function useMotion(
  frame: number, fps: number, durationFrames: number,
  enter: PresetId, exit: PresetId, height: number,
): Motion {
  const enterF = ENTER_SEC * fps;
  const exitF = EXIT_SEC * fps;
  const px = height * 0.08;
  if (frame < durationFrames - exitF) {
    const p = spring({ frame, fps, config: { damping: 200, stiffness: 120 }, durationInFrames: enterF });
    return css(enter, p, 1, px);
  }
  const p = interpolate(frame, [durationFrames - exitF, durationFrames], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const m = css(exit, p, -1, px);
  return { ...m, opacity: Math.min(m.opacity, p) };
}

/** Per-word reveal progress for kinetic_text (word i of n). */
export function wordProgress(frame: number, fps: number, i: number, n: number): number {
  const staggger = (0.5 * fps) / Math.max(1, n); // all words within 0.5s
  return spring({ frame: frame - i * staggger, fps, config: { damping: 200 }, durationInFrames: 0.35 * fps });
}
