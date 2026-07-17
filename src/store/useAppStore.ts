/**
 * App state (Zustand) — screen routing, prompt/script input and the live
 * pipeline run handoff into the editor. The editor document itself lives in
 * useEditorStore.
 */

import { create } from 'zustand';
import type { PipelineRun, PipelineStage } from '@deep-video/shared';
import type { Screen } from '../router';
import { models } from '../data/models';
import { sampleScripts } from '../data/sample-scripts';
import { estimateCostCredits, estimateLengthSec, spendCredits } from '../lib/credits';
import { cancelRun, getRun, startRun } from '../agents/pipelineRun';
import { saveProject } from '../services/project';
import { useEditorStore } from './useEditorStore';

/** Narration audio the user attached via Plus → Custom Audio. */
export interface NarrationAudio {
  /** DATA_DIR-relative server path (already uploaded). */
  path: string;
  name: string;
  durationSec: number;
}

/**
 * A generation that keeps working in the background: leaving the processing
 * screen does NOT stop it. Home shows it as a live card in Recent Generations
 * (with cancel); clicking the card returns to the processing view — or, once
 * finished in the background, opens the saved project in the editor.
 */
export interface ActiveGeneration {
  runId: string;
  title: string;
  status: 'starting' | 'running' | 'done' | 'failed';
  /** Current pipeline stage, for the Home card's progress label. */
  stage?: PipelineStage;
  /** Set when a background-finished run was persisted as a project. */
  projectId?: string;
  error?: string;
}

function localId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 14)}`;
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
  /** The generation working in the background (null when none). */
  gen: ActiveGeneration | null;

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
  /** Cancel the background generation (server stops at its next checkpoint). */
  cancelGeneration: () => Promise<void>;
  /** Home card click: reopen processing, or the editor when already finished. */
  openGeneration: () => Promise<void>;
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
  gen: null,

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
    const title =
      get().prompt.trim().slice(0, 80) ||
      audio?.name.replace(/\.[a-z0-9]+$/i, '') ||
      script?.split(/[.!?]/)[0]?.slice(0, 80) ||
      'Generated video';
    set({
      screen: 'processing',
      showModel: false,
      showPlus: false,
      run: null,
      runError: null,
      gen: { runId: '', title, status: 'starting' },
    });

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
        set({ run, gen: { runId: run.id, title, status: 'running', stage: run.stage } });

        // Poll until the run finishes — REGARDLESS of which screen is open.
        // The generation only stops when it completes, fails, or the user
        // cancels it from the Home card or the processing screen.
        const poll = async (): Promise<void> => {
          const g = get().gen;
          if (!g || g.runId !== run.id) return; // cancelled or replaced
          let current: PipelineRun;
          try {
            current = await getRun(run.id);
          } catch {
            window.setTimeout(() => void poll(), 1500);
            return;
          }
          if (get().gen?.runId !== run.id) return;
          set({ run: current, gen: { ...g, status: 'running', stage: current.stage } });

          if (current.status === 'done') {
            if (get().screen === 'processing') {
              // Still watching: open the editor right away (this also saves).
              useEditorStore.getState().openFromRun(current, title);
              set({ screen: 'editor', gen: null, run: null, runError: null });
            } else {
              // Finished in the background: persist it as a project so the
              // Home card flips to "Ready" and clicking opens the editor.
              let projectId: string | undefined = localId('proj');
              try {
                const now = new Date().toISOString();
                await saveProject({
                  project: {
                    id: projectId,
                    title,
                    createdAt: now,
                    updatedAt: now,
                    timeline: current.timeline!,
                  },
                });
              } catch {
                projectId = undefined; // fall back to opening from the run
              }
              set({ gen: { runId: run.id, title, status: 'done', projectId } });
            }
          } else if (current.status === 'failed') {
            const failed = current.stages.find((s) => s.status === 'failed');
            const error = failed?.error ?? 'Pipeline failed';
            set({ runError: error, gen: { runId: run.id, title, status: 'failed', error } });
          } else {
            window.setTimeout(() => void poll(), 500);
          }
        };
        window.setTimeout(() => void poll(), 400);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        set({ runError: error, gen: { runId: '', title, status: 'failed', error } });
      }
    })();
  },

  cancelGeneration: async () => {
    const g = get().gen;
    if (!g) return;
    if (g.runId && (g.status === 'running' || g.status === 'starting')) {
      try {
        await cancelRun(g.runId);
      } catch {
        // server unreachable — drop it locally anyway
      }
    }
    set({ gen: null, run: null, runError: null });
    if (get().screen === 'processing') set({ screen: 'home' });
  },

  openGeneration: async () => {
    const g = get().gen;
    if (!g) return;
    if (g.status === 'done') {
      // Finished in the background — open the saved project (or the run).
      if (g.projectId) {
        try {
          const { loadProject } = await import('../services/project');
          const { project } = await loadProject(g.projectId);
          useEditorStore.getState().openTimeline(project.timeline, {
            title: project.title,
            projectId: project.id,
          });
          set({ screen: 'editor', gen: null, run: null, runError: null });
          return;
        } catch {
          // fall through to the run copy below
        }
      }
      const run = get().run;
      if (run?.timeline) {
        useEditorStore.getState().openFromRun(run, g.title);
        set({ screen: 'editor', gen: null, run: null, runError: null });
      }
    } else {
      // Running (or failed): return to the live processing view.
      set({ screen: 'processing' });
    }
  },
}));
