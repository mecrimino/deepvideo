/**
 * OverlaySpec — the data contract of the Motion Graphics Engine.
 * The Python MotionGraphicsAgent (GLM 5.2) emits this JSON; the Remotion
 * composition renders it. Everything is data-driven: new looks come from new
 * spec values, not new code.
 */

export type TemplateId =
  | 'title_card'   // chapter / exercise intro, full-frame
  | 'lower_third'  // name/label band
  | 'stat'         // big number + caption ("after 60", "10 times")
  | 'quote'        // quoted phrase ("second heart")
  | 'callout'      // tip / warning / CTA
  | 'badge'        // small number badge ("Exercise 1")
  | 'end_screen';  // like/subscribe close

export type PresetId =
  | 'fade' | 'slide_left' | 'slide_right' | 'slide_up' | 'slide_down'
  | 'zoom' | 'scale_pop' | 'blur_reveal' | 'kinetic_text' | 'bounce'
  | 'underline_draw' | 'wipe';

export type ThemeId =
  | 'dark' | 'light' | 'minimal' | 'modern' | 'tech' | 'health' | 'documentary';

export type TypographyToken =
  | 'hero' | 'title' | 'subtitle' | 'heading' | 'body' | 'caption' | 'label' | 'badge';

export type PositionId = 'center' | 'lower_third' | 'top' | 'left' | 'right';

/** Background style — varied per clip (seeded) so cards differ but stay themed. */
export type BackgroundId = 'orbs' | 'aurora' | 'beams' | 'grid' | 'rings';

export interface OverlaySpec extends Record<string, unknown> {
  template: TemplateId;
  /** Main text (kept short — it's a graphic, not a paragraph). */
  text: string;
  /** Optional secondary line (subtitle / caption / attribution). */
  secondary?: string;
  /** Words inside `text` to render in the accent color. */
  highlight?: string[];
  /** Optional emoji used as the icon. */
  icon?: string;
  theme: ThemeId;
  /** Omit to auto-pick a variant seeded by the text (varied but consistent). */
  background?: BackgroundId;
  typography?: TypographyToken;
  position?: PositionId;
  preset: PresetId;
  exitPreset?: PresetId;
  /** Optional accent override (hex). */
  accentColor?: string;
  durationSec: number;
  fps?: number;
  width?: number;
  height?: number;
}

export const defaultsFor = (spec: OverlaySpec) => ({
  fps: spec.fps ?? 30,
  width: spec.width ?? 1920,
  height: spec.height ?? 1080,
  typography: spec.typography ?? 'title',
  position: spec.position ?? 'center',
  exitPreset: spec.exitPreset ?? 'fade',
  highlight: spec.highlight ?? [],
});
