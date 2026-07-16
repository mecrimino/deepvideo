/**
 * Screen routing. The app is a single-window state machine (matching the
 * design file) rather than URL routes; the store holds the current screen.
 */

export type Screen = 'home' | 'theme' | 'setup' | 'processing' | 'editor';

/** Forward flow order, for reference/progress UIs. */
export const SCREEN_FLOW: Screen[] = ['home', 'theme', 'setup', 'processing', 'editor'];
