/**
 * Screen routing — every feature AND every project gets its OWN unique URL:
 *
 *   /                     Home (prompt, model picker, recent generations)
 *   /theme                Theme selection
 *   /setup                Creative setup + cost estimate
 *   /processing/:runId    Live pipeline monitor for one generation run
 *   /editor/:projectId    The timeline editor for one specific project
 *   /test                 Editing Lab — preview editing presets on a real clip
 *
 * Two Zustand stores are the source of truth: `useAppStore.screen` (which page)
 * and `useEditorStore.projectId` / `useAppStore.gen.runId` (which document).
 * This module keeps the browser URL and those stores in sync both ways, so
 * back/forward, refresh and direct links to a specific project all work.
 */

import { useAppStore } from './stores/useAppStore';
import { useEditorStore } from './stores/useEditorStore';
import { loadProject } from './services/project';

export type Screen = 'home' | 'plan' | 'brand' | 'theme' | 'setup' | 'processing' | 'editor' | 'test';

/** Forward flow order, for reference/progress UIs. */
export const SCREEN_FLOW: Screen[] = ['home', 'plan', 'theme', 'setup', 'processing', 'editor'];

/** Base path segment for each screen (ids are appended for editor/processing). */
export const SCREEN_BASE: Record<Screen, string> = {
  home: '/',
  plan: '/plan',
  brand: '/brand',
  theme: '/theme',
  setup: '/setup',
  processing: '/processing',
  editor: '/editor',
  test: '/test',
};

interface ParsedPath {
  screen: Screen;
  /** The id segment after the base, if present (projectId or runId). */
  id?: string;
}

export function parsePath(pathname: string): ParsedPath {
  const parts = pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  const [head, id] = parts;
  switch (head) {
    case 'plan':
      return { screen: 'plan' };
    case 'brand':
      return { screen: 'brand' };
    case 'theme':
      return { screen: 'theme' };
    case 'setup':
      return { screen: 'setup' };
    case 'test':
      return { screen: 'test' };
    case 'processing':
      return { screen: 'processing', id };
    case 'editor':
      return { screen: 'editor', id };
    default:
      return { screen: 'home' };
  }
}

/** Back-compat helper used elsewhere: just the screen for a path. */
export function pathToScreen(pathname: string): Screen {
  return parsePath(pathname).screen;
}

/** The full URL path the current app state should live at (includes ids). */
export function currentPath(): string {
  const screen = useAppStore.getState().screen;
  if (screen === 'editor') {
    const pid = useEditorStore.getState().projectId;
    return pid ? `/editor/${encodeURIComponent(pid)}` : '/editor';
  }
  if (screen === 'processing') {
    const runId = useAppStore.getState().gen?.runId;
    return runId ? `/processing/${encodeURIComponent(runId)}` : '/processing';
  }
  return SCREEN_BASE[screen];
}

let initialized = false;
/** Set while we apply a URL → store change, to suppress the store → URL echo. */
let applyingUrl = false;

/**
 * Adopt a URL into the stores. For a deep-linked /editor/:projectId that isn't
 * the open document, load that project from the server first.
 */
async function applyUrl(pathname: string, isInitial: boolean): Promise<void> {
  const { screen, id } = parsePath(pathname);
  applyingUrl = true;
  try {
    if (screen === 'editor') {
      const ed = useEditorStore.getState();
      if (id && id !== ed.projectId) {
        // Deep link to a specific project — load it, unless the editor already
        // holds an unsaved fresh doc the user just started (no id in URL match).
        try {
          const { project } = await loadProject(id);
          ed.openTimeline(project.timeline, { title: project.title, projectId: project.id });
        } catch {
          // Unknown/failed project id: on a deep link, bounce home; otherwise
          // keep whatever document is already open.
          if (isInitial) {
            useAppStore.setState({ screen: 'home' });
            return;
          }
        }
      }
      useAppStore.setState({ screen: 'editor', showModel: false, showPlus: false });
      return;
    }

    if (screen === 'processing') {
      // A run monitor only makes sense while a generation is live.
      if (!useAppStore.getState().gen) {
        useAppStore.setState({ screen: 'home' });
        return;
      }
      useAppStore.setState({ screen: 'processing', showModel: false, showPlus: false });
      return;
    }

    useAppStore.setState({ screen, showModel: false, showPlus: false });
  } finally {
    applyingUrl = false;
  }
}

/** Call once (before render). Wires URL ⇄ stores in both directions. */
export function initRouter(): void {
  if (initialized) return;
  initialized = true;

  // Deep link / refresh: adopt the URL. Replace with the normalized path once
  // any async project load settles.
  void applyUrl(window.location.pathname, true).then(() => {
    window.history.replaceState({}, '', currentPath() + window.location.search);
  });

  // Back/forward buttons → stores. Normalize the URL afterwards so a guarded
  // redirect (e.g. /processing with no live run → home) reflects in the bar.
  window.addEventListener('popstate', () => {
    void applyUrl(window.location.pathname, false).then(() => {
      const path = currentPath();
      if (window.location.pathname !== path) {
        window.history.replaceState({}, '', path + window.location.search);
      }
    });
  });

  // Store → URL. Fires on BOTH screen changes and project/run id changes, so
  // switching projects updates the URL even without a screen change.
  const sync = () => {
    if (applyingUrl) return;
    const path = currentPath();
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path + window.location.search);
    }
  };
  useAppStore.subscribe(sync);
  useEditorStore.subscribe(sync);
}
