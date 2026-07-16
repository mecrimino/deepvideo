/**
 * Screen routing — every feature has its OWN URL:
 *
 *   /            Home (prompt, model picker, recent generations)
 *   /theme       Theme selection
 *   /setup       Creative setup + cost estimate
 *   /processing  Live pipeline monitor
 *   /editor      The timeline editor
 *
 * The Zustand store stays the source of truth for `screen`; this module keeps
 * the browser URL and the store in sync both ways (pushState on screen change,
 * popstate/deep-link → store), so back/forward and direct links all work.
 */

import { useAppStore } from './store/useAppStore';

export type Screen = 'home' | 'theme' | 'setup' | 'processing' | 'editor';

/** Forward flow order, for reference/progress UIs. */
export const SCREEN_FLOW: Screen[] = ['home', 'theme', 'setup', 'processing', 'editor'];

export const SCREEN_PATHS: Record<Screen, string> = {
  home: '/',
  theme: '/theme',
  setup: '/setup',
  processing: '/processing',
  editor: '/editor',
};

export function pathToScreen(pathname: string): Screen {
  const clean = pathname.replace(/\/+$/, '') || '/';
  const match = (Object.entries(SCREEN_PATHS) as [Screen, string][]).find(([, p]) => p === clean);
  return match?.[0] ?? 'home';
}

/**
 * Deep-link guard: /processing without a live generation has nothing to show —
 * fall back to home. /editor is always fine (it opens a blank document).
 */
function guardScreen(screen: Screen): Screen {
  if (screen === 'processing' && !useAppStore.getState().gen) return 'home';
  return screen;
}

let initialized = false;

/** Call once (before render). Wires URL ⇄ store in both directions. */
export function initRouter(): void {
  if (initialized) return;
  initialized = true;

  // Deep link / refresh: adopt the URL's screen.
  const initial = guardScreen(pathToScreen(window.location.pathname));
  if (useAppStore.getState().screen !== initial) {
    useAppStore.setState({ screen: initial });
  }
  window.history.replaceState({}, '', SCREEN_PATHS[initial] + window.location.search);

  // Back/forward buttons → store.
  window.addEventListener('popstate', () => {
    const screen = guardScreen(pathToScreen(window.location.pathname));
    useAppStore.setState({ screen, showModel: false, showPlus: false });
  });

  // Store → URL (covers go(), approve(), openGeneration(), everything).
  let prev = useAppStore.getState().screen;
  useAppStore.subscribe((state) => {
    if (state.screen === prev) return;
    prev = state.screen;
    const path = SCREEN_PATHS[state.screen];
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
  });
}
