/**
 * App state (Zustand) — screen routing, prompt/script input and the live
 * pipeline run handoff into the editor. The editor document itself lives in
 * useEditorStore.
 */

import { create, type StoreApi } from 'zustand';
import type {
  AssetSource,
  DirectorPlan,
  PipelineRun,
  PipelineStage,
  PlanMessage,
} from '@deep-vision/shared';
import type { Screen } from '../router';
import { models } from '../data/models';
import { sampleScripts } from '../data/sample-scripts';
import { estimateCostCredits, estimateLengthSec, spendCredits } from '../utils/credits';
import { cancelRun, getRun, listRuns, startRun } from '../services/pipelineRun';
import { planConversation } from '../services/director';
import { loadProject, saveProject } from '../services/project';
import { brandOf, getActiveChannel } from '../utils/channel';
import { themes } from '../data/themes';
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
  /** Selected narration voice (Kokoro TTS name, e.g. 'af_heart'). */
  voice: string;
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

  /** Pre-production planning chat with the Director (talk it through first). */
  planMessages: PlanMessage[];
  /** The Director's current structured plan (refined across the chat). */
  plan: DirectorPlan | null;
  /** True once the user approved production — enables the Generate button. */
  planReady: boolean;
  /** A Director reply is in flight. */
  planBusy: boolean;
  planError: string | null;
  /** The locked script handed off from the Director chat to the setup screen. */
  plannedScript: string | null;
  plannedTitle: string;
  /** Footage source chosen on the setup screen. */
  assetSource: AssetSource;
  /** Setup-screen background override (null = use the brand's background). */
  backgroundOverride: string | null;

  go: (screen: Screen) => void;
  setPrompt: (prompt: string) => void;
  setScript: (script: string) => void;
  setAudio: (audio: NarrationAudio | null) => void;
  selectModel: (i: number) => void;
  selectVoice: (voice: string) => void;
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
  /** Enter the Director planning chat, seeding it with the current idea. */
  startPlanning: () => void;
  /** Send a follow-up message to the Director in the planning chat. */
  sendPlanMessage: (text: string) => void;
  /** Hand the locked script to the setup screen (voice/theme/footage) — no direct generate. */
  generateFromPlan: () => void;
  /** Leave the planning chat and clear it. */
  cancelPlanning: () => void;
  selectAssetSource: (a: AssetSource) => void;
  setBackgroundOverride: (path: string | null) => void;
  /** Cancel the background generation (server stops at its next checkpoint). */
  cancelGeneration: () => Promise<void>;
  /** Home card click: reopen processing, or the editor when already finished. */
  openGeneration: () => Promise<void>;
  /** After a reload: rediscover a run still processing server-side. */
  rehydrateGen: () => Promise<void>;
}

/** The narration script the pipeline will use for this generation. */
export function effectiveScript(state: Pick<AppState, 'prompt' | 'script'>): string {
  if (state.script.trim().length > 0) return state.script.trim();
  if (state.prompt.trim().length > 0) return state.prompt.trim();
  return sampleScripts[0].text;
}

type SetFn = StoreApi<AppState>['setState'];
type GetFn = StoreApi<AppState>['getState'];

interface LaunchOpts {
  script?: string;
  audioPath?: string;
  audioDurationSec?: number;
  model: 'mini' | 'pro' | 'agent';
  voice?: string;
  /** Use the script verbatim — skip the idea-expansion front-half. */
  skipExpand?: boolean;
  title: string;
  modelIdx: number;
  assetSource?: AssetSource;
}

/**
 * Start a REAL pipeline run and poll it to completion, updating the processing
 * screen and the background-generation card. Shared by the setup "Generate" path
 * (approve) and the Director-plan "Generate" hand-off (generateFromPlan).
 */
function launchRun(set: SetFn, get: GetFn, opts: LaunchOpts): void {
  const { script, audioPath, audioDurationSec, model, skipExpand, title, modelIdx } = opts;
  // No connected channel → no niche → we can't pick footage. Block the run.
  const channel = getActiveChannel();
  if (!channel?.niche?.trim()) {
    set({
      screen: 'home',
      gen: null,
      runError: 'Connect a channel first — its niche tells the agents what footage to find.',
    });
    return;
  }
  const niche = channel.niche.trim();
  // The channel's BRAND PROFILE drives production: voice, theme, footage source
  // and compliance rules — explicit opts (e.g. setup-screen picks) win.
  const brand = brandOf(channel);
  const voice = opts.voice ?? brand.voice;
  const assetSource = opts.assetSource ?? brand.assetSource;
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
      const { run } = await startRun({
        script,
        audioPath,
        model,
        voice,
        niche,
        skipExpand,
        settings: {
          assetSource,
          theme: themes[brand.themeIdx]?.name ?? '',
          background: get().backgroundOverride ?? brand.background,
          language: brand.language,
          disableAnimations: brand.disableAnimations,
          disableOverlays: brand.disableOverlays,
          disableEffects: brand.disableEffects,
          blockedTemplates: brand.blockedTemplates,
        },
      });
      spendCredits(
        estimateCostCredits(
          models[modelIdx].rateCreditsPerMin,
          estimateLengthSec({ script, audioDurationSec }),
        ),
      );
      set({ run, gen: { runId: run.id, title, status: 'running', stage: run.stage } });
      pollRun(set, get, run.id, title);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      set({ runError: error, gen: { runId: '', title, status: 'failed', error } });
    }
  })();
}

/** Poll a run to completion — shared by launchRun and reload rehydration. */
function pollRun(set: SetFn, get: GetFn, runId: string, title: string): void {
  const poll = async (): Promise<void> => {
    const g = get().gen;
    if (!g || g.runId !== runId) return; // cancelled or replaced
    let current: PipelineRun;
    try {
      current = await getRun(runId);
    } catch {
      window.setTimeout(() => void poll(), 1500);
      return;
    }
    if (get().gen?.runId !== runId) return;
    set({ run: current, gen: { ...g, status: 'running', stage: current.stage } });

    if (current.status === 'done') {
      if (get().screen === 'processing') {
        useEditorStore.getState().openFromRun(current, title);
        set({ screen: 'editor', gen: null, run: null, runError: null });
      } else {
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
              runId,
            },
          });
        } catch {
          projectId = undefined;
        }
        set({ gen: { runId, title, status: 'done', projectId } });
      }
    } else if (current.status === 'failed') {
      const failed = current.stages.find((s) => s.status === 'failed');
      const error = failed?.error ?? 'Pipeline failed';
      set({ runError: error, gen: { runId, title, status: 'failed', error } });
    } else {
      window.setTimeout(() => void poll(), 500);
    }
  };
  window.setTimeout(() => void poll(), 400);
}

/** One Director planning turn: send the transcript, fold in the reply + plan. */
async function directorTurn(set: SetFn, get: GetFn): Promise<void> {
  try {
    // One production model — the Deep Video Agent.
    const res = await planConversation({ messages: get().planMessages, model: 'agent' });
    set({
      planMessages: [...get().planMessages, { role: 'assistant', content: res.reply }],
      plan: res.plan ?? get().plan, // keep the last good plan if this turn had none
      planReady: res.ready,
      planBusy: false,
    });
  } catch (err) {
    set({ planBusy: false, planError: err instanceof Error ? err.message : String(err) });
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  screen: 'home',
  prompt: '',
  script: '',
  audio: null,
  modelIdx: 0,
  voice: 'af_heart',
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

  planMessages: [],
  plan: null,
  planReady: false,
  planBusy: false,
  planError: null,
  plannedScript: null,
  plannedTitle: 'Generated video',
  assetSource: 'mixed',
  backgroundOverride: null,

  go: (screen) => set({ screen, showModel: false, showPlus: false }),
  selectAssetSource: (assetSource) => set({ assetSource }),
  setBackgroundOverride: (backgroundOverride) => set({ backgroundOverride }),
  setPrompt: (prompt) => set({ prompt }),
  setScript: (script) => set({ script }),
  setAudio: (audio) => set({ audio }),
  selectModel: (modelIdx) => set({ modelIdx }),
  selectVoice: (voice) => set({ voice }),
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
    const { audio, modelIdx, voice, plannedScript, plannedTitle, assetSource } = get();
    // A script locked in the Director chat is used verbatim (skipExpand).
    const usingPlan = !!plannedScript;
    const script = usingPlan ? plannedScript! : audio ? undefined : effectiveScript(get());
    const title = usingPlan
      ? plannedTitle
      : get().prompt.trim().slice(0, 80) ||
        audio?.name.replace(/\.[a-z0-9]+$/i, '') ||
        script?.split(/[.!?]/)[0]?.slice(0, 80) ||
        'Generated video';
    launchRun(set, get, {
      script,
      audioPath: audio?.path,
      audioDurationSec: audio?.durationSec,
      model: 'agent',
      voice: audio ? undefined : voice,
      skipExpand: usingPlan,
      title,
      modelIdx,
      assetSource,
    });
    set({ plannedScript: null });
  },

  startPlanning: () => {
    const idea = get().prompt.trim();
    if (!idea) return;
    set({
      screen: 'plan',
      showModel: false,
      showPlus: false,
      planMessages: [{ role: 'user', content: idea }],
      plan: null,
      planReady: false,
      planBusy: true,
      planError: null,
    });
    void directorTurn(set, get);
  },

  sendPlanMessage: (text) => {
    const t = text.trim();
    if (!t || get().planBusy) return;
    set({
      planMessages: [...get().planMessages, { role: 'user', content: t }],
      planBusy: true,
      planError: null,
    });
    void directorTurn(set, get);
  },

  generateFromPlan: () => {
    const { plan, planMessages } = get();
    const script = (plan?.script ?? '').trim();
    if (!script) return; // no locked script yet
    const title = (plan?.title || plan?.angle || planMessages[0]?.content || 'Generated video')
      .toString()
      .slice(0, 80);
    // Don't generate yet — hand the locked script to the setup screen so the
    // user picks voice, theme and footage type, then confirms there.
    set({
      screen: 'setup',
      plannedScript: script,
      plannedTitle: title,
      planMessages: [],
      plan: null,
      planReady: false,
      planBusy: false,
      planError: null,
    });
  },

  cancelPlanning: () =>
    set({
      screen: 'home',
      planMessages: [],
      plan: null,
      planReady: false,
      planBusy: false,
      planError: null,
    }),

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

  rehydrateGen: async () => {
    if (get().gen) return; // this session already tracks a generation
    try {
      const { runs } = await listRuns();
      const active = runs.find((r) => r.status === 'running' || r.status === 'pending');
      if (!active) return;
      const title = active.script.split(/[.!?]/)[0]?.slice(0, 80) || 'Generating…';
      set({ gen: { runId: active.id, title, status: 'running', stage: (active.stage ?? undefined) as PipelineStage | undefined } });
      pollRun(set, get, active.id, title);
    } catch {
      // server unreachable — nothing to rehydrate
    }
  },

  openGeneration: async () => {
    const g = get().gen;
    if (!g) return;
    if (g.status === 'done') {
      // Finished in the background — open the saved project (or the run).
      if (g.projectId) {
        try {
          const { project } = await loadProject(g.projectId);
          useEditorStore.getState().openTimeline(project.timeline, {
            title: project.title,
            projectId: project.id,
            runId: project.runId,
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
