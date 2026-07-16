/**
 * App state (Zustand) — screen routing, prompt/script input and the live
 * pipeline run handoff into the editor. The editor document itself lives in
 * useEditorStore.
 */

import { create } from 'zustand';
import type { PipelineRun } from '@deep-video/shared';
import type { Screen } from '../router';
import { models } from '../data/models';
import { sampleScripts } from '../data/sample-scripts';
import { estimateCostCredits, estimateLengthSec, spendCredits } from '../lib/credits';
import { getRun, startRun } from '../agents/pipelineRun';
import { useEditorStore } from './useEditorStore';

/** Narration audio the user attached via Plus → Custom Audio. */
export interface NarrationAudio {
  /** DATA_DIR-relative server path (already uploaded). */
  path: string;
  name: string;
  durationSec: number;
}

export type AnimTab = 'Enter' | 'Exit';

interface AppState {
  screen: Screen;
  prompt: string;
  /** Optional pasted narration script (Plus menu → Custom Script). */
  script: string;
  /** Optional uploaded narration audio (Plus menu → Custom Audio). */
  audio: NarrationAudio | null;
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
  /** Editor: Deep Video Agent chat column visibility. */
  showChat: boolean;

  /** The pipeline run currently shown on the processing screen. */
  run: PipelineRun | null;
  runError: string | null;

  go: (screen: Screen) => void;
  setPrompt: (prompt: string) => void;
  setScript: (script: string) => void;
  setAudio: (audio: NarrationAudio | null) => void;
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
  /** Setup approved: start the REAL pipeline run and show live progress. */
  approve: () => void;
}

/** The narration script the pipeline will use for this generation. */
export function effectiveScript(state: Pick<AppState, 'prompt' | 'script'>): string {
  if (state.script.trim().length > 0) return state.script.trim();
  if (state.prompt.trim().length > 0) return state.prompt.trim();
  return sampleScripts[0].text;
}

export const useAppStore = create<AppState>((set, get) => ({
  screen: 'home',
  prompt: '',
  script: '',
  audio: null,
  modelIdx: 1,
  themeIdx: 1,
  animIdx: 0,
  animTab: 'Enter',
  showModel: false,
  showPlus: false,
  showSettings: false,
  showChat: true,

  run: null,
  runError: null,

  go: (screen) => set({ screen, showModel: false, showPlus: false }),
  setPrompt: (prompt) => set({ prompt }),
  setScript: (script) => set({ script }),
  setAudio: (audio) => set({ audio }),
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
    const { audio, modelIdx } = get();
    const script = audio ? undefined : effectiveScript(get());
    set({ screen: 'processing', showModel: false, showPlus: false, run: null, runError: null });

    void (async () => {
      try {
        // Model picker: index 0 = Deep Video v1 Mini (stock B-roll matching
        // engine), index 1 = Pro (local-library pipeline).
        const model = modelIdx === 0 ? 'mini' : 'pro';
        const { run } = await startRun({ script, audioPath: audio?.path, model });
        // Deduct the real estimated cost from the local credits ledger.
        spendCredits(
          estimateCostCredits(
            models[modelIdx].rateCreditsPerMin,
            estimateLengthSec({ script, audioDurationSec: audio?.durationSec }),
          ),
        );
        set({ run });

        // Poll until the run finishes, then open the editor with its timeline.
        const poll = async (): Promise<void> => {
          if (get().screen !== 'processing') return; // user navigated away
          let current: PipelineRun;
          try {
            current = await getRun(run.id);
          } catch {
            window.setTimeout(() => void poll(), 1200);
            return;
          }
          set({ run: current });
          if (current.status === 'done') {
            const title =
              get().prompt.trim().slice(0, 80) ||
              current.input.script?.split(/[.!?]/)[0]?.slice(0, 80) ||
              'Generated video';
            useEditorStore.getState().openFromRun(current, title);
            set({ screen: 'editor' });
          } else if (current.status === 'failed') {
            const failed = current.stages.find((s) => s.status === 'failed');
            set({ runError: failed?.error ?? 'Pipeline failed' });
          } else {
            window.setTimeout(() => void poll(), 500);
          }
        };
        window.setTimeout(() => void poll(), 400);
      } catch (err) {
        set({ runError: err instanceof Error ? err.message : String(err) });
      }
    })();
  },
}));
