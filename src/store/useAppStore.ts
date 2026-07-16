/**
 * App state (Zustand) — mirrors the design file's component state machine:
 * { screen, showModel, showPlus, prompt, modelIdx, themeIdx, animIdx, animTab }.
 */

import { create } from 'zustand';
import type { Screen } from '../router';

export type AnimTab = 'Enter' | 'Exit';

interface AppState {
  screen: Screen;
  prompt: string;
  /** Selected production model (index into data/models). Pro by default. */
  modelIdx: number;
  /** Selected theme (index into data/themes). History by default. */
  themeIdx: number;
  /** Selected animation in the editor settings panel. */
  animIdx: number;
  animTab: AnimTab;
  showModel: boolean;
  showPlus: boolean;
  /** Editor: floating settings card visibility (closed by default). */
  showSettings: boolean;
  /** Editor: Rush Agent chat column visibility. */
  showChat: boolean;

  go: (screen: Screen) => void;
  setPrompt: (prompt: string) => void;
  selectModel: (i: number) => void;
  selectTheme: (i: number) => void;
  selectAnim: (i: number) => void;
  setAnimTab: (tab: AnimTab) => void;
  togglePlus: () => void;
  openModel: () => void;
  closeModel: () => void;
  toggleSettings: () => void;
  closeSettings: () => void;
  toggleChat: () => void;
  /** Setup approved: show processing, then enter the editor (design: 2.8 s). */
  approve: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  screen: 'home',
  prompt: '',
  modelIdx: 1,
  themeIdx: 1,
  animIdx: 0,
  animTab: 'Enter',
  showModel: false,
  showPlus: false,
  showSettings: false,
  showChat: true,

  go: (screen) => set({ screen, showModel: false, showPlus: false }),
  setPrompt: (prompt) => set({ prompt }),
  selectModel: (modelIdx) => set({ modelIdx }),
  selectTheme: (themeIdx) => set({ themeIdx }),
  selectAnim: (animIdx) => set({ animIdx }),
  setAnimTab: (animTab) => set({ animTab }),
  togglePlus: () => set((s) => ({ showPlus: !s.showPlus })),
  openModel: () => set({ showModel: true, showPlus: false }),
  closeModel: () => set({ showModel: false }),
  toggleSettings: () => set((s) => ({ showSettings: !s.showSettings })),
  closeSettings: () => set({ showSettings: false }),
  toggleChat: () => set((s) => ({ showChat: !s.showChat })),
  approve: () => {
    set({ screen: 'processing', showModel: false, showPlus: false });
    window.setTimeout(() => {
      set((s) => (s.screen === 'processing' ? { screen: 'editor' } : {}));
    }, 2800);
  },
}));
