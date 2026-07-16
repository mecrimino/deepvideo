/**
 * Deep Video Agent — the editor's chat agent. Takes the user's message plus
 * the current timeline and returns a reply and (when the agent edited
 * something) an updated timeline.
 *
 * Brains, in priority order:
 *  1. OpenRouter (model from OPENROUTER_MODEL, default tencent/hy3:free, keys
 *     rotate via mini/llm.ts) — plans edits as a JSON action list.
 *  2. Ollama tool-calling loop when a local model is running.
 *  3. A deterministic command parser, so the agent always works offline.
 *
 * Powers: split, delete, trim, move captions, replace footage (local library
 * first, Pexels/Pixabay stock download as fallback), cut a time range, and
 * regenerate every clip inside a time range ("regenerate 8:00 to 10:00").
 */

import type { CaptionCue, ClipAsset, Timeline, TimelineClip } from '@deep-video/shared';
import {
  OllamaClient,
  insertClip,
  removeClip,
  recomputeDuration,
  runToolLoop,
  trimClip,
  uid,
  type ToolDefinition,
} from '@deep-video/model';
import type { ClipDb } from './db.js';
import type { ClipEmbedder } from './clip.js';
import { registerMediaFile, saveUpload } from './library.js';
import { createOpenRouterMiniLLM } from './mini/llm.js';
import { createStockSearch } from './mini/stock.js';

export interface AgentResult {
  reply: string;
  timeline: Timeline;
  /** Human-readable log of edits the agent performed. */
  actions: string[];
  /** Which brain answered: 'openrouter' | 'ollama' | 'commands'. */
  backend: string;
}

interface AgentContext {
  timeline: Timeline;
  actions: string[];
  db: ClipDb;
  embedder: ClipEmbedder;
}

const stockSearch = createStockSearch();
const openRouter = createOpenRouterMiniLLM();

function hasOpenRouterKeys(): boolean {
  return (process.env.OPENROUTER_API_KEYS ?? '').trim().length > 0;
}

/* ------------------------------ edit helpers ------------------------------ */

function videoClips(t: Timeline): TimelineClip[] {
  return (t.tracks.find((tr) => tr.kind === 'video')?.clips ?? [])
    .slice()
    .sort((a, b) => a.range.startSec - b.range.startSec);
}

function clipAt(t: Timeline, sec: number): TimelineClip | undefined {
  return videoClips(t).find((c) => c.range.startSec <= sec && sec < c.range.endSec);
}

function clipByRef(t: Timeline, ref: string | number): TimelineClip | undefined {
  const clips = videoClips(t);
  if (typeof ref === 'number') return clips[ref - 1] ?? clipAt(t, ref);
  const byId = clips.find((c) => c.id === ref);
  if (byId) return byId;
  const n = Number(ref);
  return Number.isFinite(n) ? clips[n - 1] ?? clipAt(t, n) : undefined;
}

function splitClipAt(t: Timeline, clip: TimelineClip, atSec: number): Timeline {
  if (atSec <= clip.range.startSec + 0.1 || atSec >= clip.range.endSec - 0.1) {
    throw new Error('split point must fall inside the clip');
  }
  const secondHalf: TimelineClip = {
    ...structuredClone(clip),
    id: uid('clip'),
    range: { startSec: atSec, endSec: clip.range.endSec },
  };
  if (secondHalf.source.kind === 'asset' && clip.source.kind === 'asset') {
    secondHalf.source.inSec = clip.source.inSec + (atSec - clip.range.startSec);
  }
  const trackId = t.tracks.find((tr) => tr.clips.some((c) => c.id === clip.id))?.id;
  if (!trackId) throw new Error('clip track not found');
  let next = trimClip(t, clip.id, { endSec: atSec });
  next = insertClip(next, trackId, secondHalf);
  return next;
}

function addCaption(t: Timeline, text: string, startSec: number, endSec: number): Timeline {
  const next = structuredClone(t);
  const cue: CaptionCue = { id: uid('cue'), text, range: { startSec, endSec } };
  next.captions = [...next.captions, cue].sort((a, b) => a.range.startSec - b.range.startSec);
  return recomputeDuration(next);
}

/** Swap the media behind one clip (keeps its position on the project clock). */
function swapSource(t: Timeline, clipId: string, asset: ClipAsset, inSec: number): Timeline {
  const next = structuredClone(t);
  for (const track of next.tracks) {
    const target = track.clips.find((c) => c.id === clipId);
    if (target) {
      const dur = target.range.endSec - target.range.startSec;
      const safeIn = Math.max(
        0,
        Math.min(inSec, asset.durationSec > dur ? asset.durationSec - dur : 0),
      );
      target.source = { kind: 'asset', assetId: asset.id, inSec: safeIn, outSec: safeIn + dur };
      delete (target as { review?: boolean }).review;
    }
  }
  return next;
}

/** The text that best describes what a clip SHOULD show (for re-retrieval). */
function clipQuery(clip: TimelineClip): string {
  if (clip.source.kind === 'generate') return clip.source.slot.prompt;
  return clip.label ?? '';
}

/**
 * Find replacement footage for a query: local library first; when nothing
 * different/decent is found and stock keys are configured, download the best
 * Pexels/Pixabay hit into the library and use that.
 */
async function findReplacement(
  ctx: AgentContext,
  query: string,
  excludeAssetId?: string,
): Promise<{ asset: ClipAsset; inSec: number; via: 'library' | 'stock' } | null> {
  const vec = await ctx.embedder.embedText(query);
  const hits = await ctx.db.search(vec, 8);
  const local = hits.find((h) => h.clipId !== excludeAssetId);
  if (local && local.score >= 0.25) {
    const [asset] = await ctx.db.getAssets([local.clipId]);
    if (asset) return { asset, inSec: local.inSec ?? 0, via: 'library' };
  }

  // Stock fallback — real Pexels/Pixabay search + download + index.
  try {
    const candidates = await stockSearch.search(query.split(/\s+/).slice(0, 5).join(' '), 4);
    for (const cand of candidates) {
      try {
        const res = await fetch(cand.videoUrl, { signal: AbortSignal.timeout(60_000) });
        if (!res.ok) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        const dest = await saveUpload(`${query.split(/\s+/).slice(0, 6).join('_')}_${cand.id}.mp4`, buf);
        const asset = await registerMediaFile(dest, ctx.db, ctx.embedder, {
          source: 'stock',
          tags: query.split(/\s+/),
          license: cand.source === 'pexels' ? 'Pexels' : 'Pixabay',
        });
        return { asset, inSec: 0, via: 'stock' };
      } catch {
        // try the next candidate
      }
    }
  } catch {
    // no stock keys / network down — fall through
  }

  if (local) {
    const [asset] = await ctx.db.getAssets([local.clipId]);
    if (asset) return { asset, inSec: local.inSec ?? 0, via: 'library' };
  }
  return null;
}

/** Remove/trim everything on the video track inside [startSec, endSec). */
function cutRange(ctx: AgentContext, startSec: number, endSec: number): number {
  if (endSec <= startSec) throw new Error('cut range must be positive');
  let touched = 0;
  for (const clip of videoClips(ctx.timeline)) {
    const { startSec: a, endSec: b } = clip.range;
    if (b <= startSec || a >= endSec) continue;
    touched++;
    if (a >= startSec && b <= endSec) {
      ctx.timeline = removeClip(ctx.timeline, clip.id);
    } else if (a < startSec && b > endSec) {
      // Range strictly inside the clip: split, then trim the second half.
      ctx.timeline = splitClipAt(ctx.timeline, clip, startSec);
      const second = clipAt(ctx.timeline, startSec + (endSec - startSec) / 2) ?? clipAt(ctx.timeline, startSec);
      if (second) ctx.timeline = trimClip(ctx.timeline, second.id, { startSec: endSec });
    } else if (a < startSec) {
      ctx.timeline = trimClip(ctx.timeline, clip.id, { endSec: startSec });
    } else {
      ctx.timeline = trimClip(ctx.timeline, clip.id, { startSec: endSec });
    }
  }
  return touched;
}

/** Re-retrieve footage for every clip that intersects [startSec, endSec). */
async function regenerateRange(
  ctx: AgentContext,
  startSec: number,
  endSec: number,
): Promise<{ replaced: number; skipped: number }> {
  if (endSec <= startSec) throw new Error('regenerate range must be positive');
  let replaced = 0;
  let skipped = 0;
  for (const clip of videoClips(ctx.timeline)) {
    if (clip.range.endSec <= startSec || clip.range.startSec >= endSec) continue;
    const query = clipQuery(clip);
    if (!query.trim()) {
      skipped++;
      continue;
    }
    const current = clip.source.kind === 'asset' ? clip.source.assetId : undefined;
    const found = await findReplacement(ctx, query, current);
    if (!found || found.asset.id === current) {
      skipped++;
      continue;
    }
    ctx.timeline = swapSource(ctx.timeline, clip.id, found.asset, found.inSec);
    ctx.actions.push(
      `Regenerated [${fmt(clip.range.startSec)}–${fmt(clip.range.endSec)}] from ${found.via}: "${found.asset.tags.slice(0, 5).join(' ')}".`,
    );
    replaced++;
  }
  return { replaced, skipped };
}

/* ------------------------------ operation set ----------------------------- */

const TOOLS: ToolDefinition[] = [
  {
    name: 'list_timeline',
    description: 'List the video clips (index, label, start/end seconds) and caption count.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'split_clip',
    description: 'Split the clip covering atSec into two clips at that time.',
    parameters: {
      type: 'object',
      properties: { atSec: { type: 'number', description: 'project time in seconds' } },
      required: ['atSec'],
    },
  },
  {
    name: 'delete_clip',
    description: 'Delete a video clip by 1-based index or by a second it covers.',
    parameters: {
      type: 'object',
      properties: { ref: { type: 'string', description: 'clip index (1-based) or a time in seconds' } },
      required: ['ref'],
    },
  },
  {
    name: 'trim_clip',
    description: 'Change a clip boundary. Provide the clip ref plus new startSec and/or endSec.',
    parameters: {
      type: 'object',
      properties: {
        ref: { type: 'string' },
        startSec: { type: 'number' },
        endSec: { type: 'number' },
      },
      required: ['ref'],
    },
  },
  {
    name: 'replace_clip',
    description:
      'Replace the footage behind a clip with the best match for a text query — searches the local library, then downloads free stock (Pexels/Pixabay) when needed.',
    parameters: {
      type: 'object',
      properties: { ref: { type: 'string' }, query: { type: 'string' } },
      required: ['ref', 'query'],
    },
  },
  {
    name: 'add_caption',
    description: 'Add a caption cue with text between startSec and endSec.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        startSec: { type: 'number' },
        endSec: { type: 'number' },
      },
      required: ['text', 'startSec', 'endSec'],
    },
  },
  {
    name: 'cut_range',
    description: 'Cut (remove) everything on the video track between startSec and endSec.',
    parameters: {
      type: 'object',
      properties: { startSec: { type: 'number' }, endSec: { type: 'number' } },
      required: ['startSec', 'endSec'],
    },
  },
  {
    name: 'regenerate_range',
    description:
      'Re-source every clip between startSec and endSec: fresh retrieval per clip from the library and free stock, swapping in different footage.',
    parameters: {
      type: 'object',
      properties: { startSec: { type: 'number' }, endSec: { type: 'number' } },
      required: ['startSec', 'endSec'],
    },
  },
];

function makeHandlers(ctx: AgentContext): Record<string, (args: unknown) => Promise<unknown>> {
  return {
    list_timeline: async () => ({
      durationSec: ctx.timeline.durationSec,
      clips: videoClips(ctx.timeline).map((c, i) => ({
        index: i + 1,
        label: c.label ?? '',
        startSec: c.range.startSec,
        endSec: c.range.endSec,
        kind: c.source.kind,
      })),
      captions: ctx.timeline.captions.length,
    }),
    split_clip: async (args) => {
      const { atSec } = args as { atSec: number };
      const clip = clipAt(ctx.timeline, atSec);
      if (!clip) return { error: `no clip at ${atSec}s` };
      ctx.timeline = splitClipAt(ctx.timeline, clip, atSec);
      ctx.actions.push(`Split the clip at ${fmt(atSec)}.`);
      return { ok: true };
    },
    delete_clip: async (args) => {
      const { ref } = args as { ref: string };
      const clip = clipByRef(ctx.timeline, ref);
      if (!clip) return { error: `clip not found: ${ref}` };
      ctx.timeline = removeClip(ctx.timeline, clip.id);
      ctx.actions.push(`Deleted clip "${clip.label ?? clip.id}".`);
      return { ok: true };
    },
    trim_clip: async (args) => {
      const { ref, startSec, endSec } = args as { ref: string; startSec?: number; endSec?: number };
      const clip = clipByRef(ctx.timeline, ref);
      if (!clip) return { error: `clip not found: ${ref}` };
      ctx.timeline = trimClip(ctx.timeline, clip.id, { startSec, endSec });
      ctx.actions.push(`Trimmed clip "${clip.label ?? clip.id}".`);
      return { ok: true };
    },
    replace_clip: async (args) => {
      const { ref, query } = args as { ref: string; query: string };
      const clip = clipByRef(ctx.timeline, ref);
      if (!clip) return { error: `clip not found: ${ref}` };
      const current = clip.source.kind === 'asset' ? clip.source.assetId : undefined;
      const found = await findReplacement(ctx, query, current);
      if (!found) return { error: 'no library or stock match found' };
      ctx.timeline = swapSource(ctx.timeline, clip.id, found.asset, found.inSec);
      const name = found.asset.tags.slice(0, 6).join(' ') || found.asset.path;
      ctx.actions.push(`Replaced footage with "${name}" (${found.via}).`);
      return { ok: true, found: name, via: found.via };
    },
    add_caption: async (args) => {
      const { text, startSec, endSec } = args as { text: string; startSec: number; endSec: number };
      ctx.timeline = addCaption(ctx.timeline, text, startSec, endSec);
      ctx.actions.push(`Added caption "${text}" at ${fmt(startSec)}.`);
      return { ok: true };
    },
    cut_range: async (args) => {
      const { startSec, endSec } = args as { startSec: number; endSec: number };
      const touched = cutRange(ctx, startSec, endSec);
      if (touched === 0) return { error: 'nothing on the video track in that range' };
      ctx.actions.push(`Cut ${fmt(startSec)}–${fmt(endSec)} (${touched} clip${touched > 1 ? 's' : ''}).`);
      return { ok: true, touched };
    },
    regenerate_range: async (args) => {
      const { startSec, endSec } = args as { startSec: number; endSec: number };
      const { replaced, skipped } = await regenerateRange(ctx, startSec, endSec);
      if (replaced === 0 && skipped === 0) return { error: 'no clips in that range' };
      return { ok: true, replaced, skipped };
    },
  };
}

/* ----------------------- OpenRouter JSON-plan backend ---------------------- */

interface PlannedAction {
  op: string;
  [key: string]: unknown;
}

function timelineBrief(t: Timeline): string {
  const clips = videoClips(t)
    .map(
      (c, i) =>
        `${i + 1}. [${c.range.startSec.toFixed(1)}-${c.range.endSec.toFixed(1)}s] ${
          c.source.kind === 'generate' ? '(slot) ' : ''
        }${(c.label ?? '').slice(0, 60)}`,
    )
    .join('\n');
  return `duration: ${t.durationSec.toFixed(1)}s\nclips:\n${clips || '(none)'}\ncaptions: ${t.captions.length}`;
}

const PLAN_OPS = `Operations you may plan (times are SECONDS on the project clock):
- {"op":"split_clip","atSec":N}
- {"op":"delete_clip","ref":"<clip index>"}
- {"op":"trim_clip","ref":"<clip index>","startSec":N?,"endSec":N?}
- {"op":"replace_clip","ref":"<clip index>","query":"<what the footage should show>"}
- {"op":"add_caption","text":"...","startSec":N,"endSec":N}
- {"op":"cut_range","startSec":N,"endSec":N}          // remove a whole section
- {"op":"regenerate_range","startSec":N,"endSec":N}   // re-source all clips in a section (library + free stock)`;

/**
 * Ask OpenRouter to plan the edit as JSON, then execute the plan with the
 * same handlers the tool loop uses. Returns null when the model is
 * unreachable or answers with something unusable (caller falls back).
 */
async function openRouterPlan(ctx: AgentContext, message: string): Promise<string | null> {
  const prompt =
    `You are Deep Video Agent, the editing agent inside the Deep Video editor. ` +
    `You edit the user's timeline by planning operations.\n\n` +
    `CURRENT TIMELINE\n${timelineBrief(ctx.timeline)}\n\n${PLAN_OPS}\n\n` +
    `USER REQUEST\n${message}\n\n` +
    `Reply with ONLY a JSON object, no markdown fences:\n` +
    `{"reply":"<short confirmation or answer for the user>","actions":[{...},...]}\n` +
    `Use an empty actions array for questions/informational requests. ` +
    `When the user references minutes (e.g. "8 min to 10 min") convert to seconds. ` +
    `Never invent clip indexes that are not listed.`;

  let raw: string;
  try {
    raw = await openRouter.complete(prompt, { temperature: 0, timeoutMs: 45_000 });
  } catch {
    return null;
  }

  let plan: { reply?: unknown; actions?: unknown };
  try {
    const jsonText = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/, '');
    const start = jsonText.indexOf('{');
    const end = jsonText.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    plan = JSON.parse(jsonText.slice(start, end + 1)) as { reply?: unknown; actions?: unknown };
  } catch {
    return null;
  }

  const actions = Array.isArray(plan.actions) ? (plan.actions as PlannedAction[]) : [];
  const handlers = makeHandlers(ctx);
  const problems: string[] = [];

  for (const action of actions.slice(0, 20)) {
    if (!action || typeof action.op !== 'string') continue;
    const handler = handlers[action.op];
    if (!handler) {
      problems.push(`unknown op ${action.op}`);
      continue;
    }
    try {
      const result = (await handler(action)) as { error?: string } | undefined;
      if (result?.error) problems.push(result.error);
    } catch (err) {
      problems.push(err instanceof Error ? err.message : String(err));
    }
  }

  let reply = typeof plan.reply === 'string' && plan.reply.trim() ? plan.reply.trim() : 'Done.';
  if (problems.length > 0) reply += `\n(Note: ${problems.join('; ')})`;
  return reply;
}

/* --------------------------- deterministic parser -------------------------- */

function parseTime(s: string): number | null {
  const mmss = s.match(/^(\d+):(\d{1,2})(?:\.(\d+))?$/);
  if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2]) + Number(`0.${mmss[3] ?? '0'}`);
  const withUnit = s.match(/^(\d+(?:\.\d+)?)\s*(min|minutes?|m)$/i);
  if (withUnit) return Number(withUnit[1]) * 60;
  const plain = s.match(/^(\d+(?:\.\d+)?)s?$/);
  return plain ? Number(plain[1]) : null;
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1).replace(/\.0$/, '');
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

const HELP =
  'I can edit the timeline. Try:\n' +
  '• split at 1:23\n' +
  '• delete clip 4  (or: delete clip at 0:30)\n' +
  '• trim clip 2 end 45s  /  trim clip 2 start 40s\n' +
  '• replace clip 3 with <what it should show>\n' +
  '• regenerate 8:00 to 10:00  (re-source clips from library + free stock)\n' +
  '• cut 0:10 to 0:25\n' +
  '• caption "Hello world" 5s 8s\n' +
  '• list clips';

async function parseCommand(ctx: AgentContext, message: string): Promise<string> {
  const msg = message.trim().toLowerCase();
  const original = message.trim();
  const handlers = makeHandlers(ctx);

  const t = (re: RegExp) => original.match(re);
  const TIME = String.raw`(\d+(?:[:.]\d+)?(?:\s*(?:min|minutes?|m|s))?)`;

  let m = t(/^(?:list|show)\b/i);
  if (m) {
    const data = (await handlers.list_timeline({})) as {
      clips: { index: number; label: string; startSec: number; endSec: number; kind: string }[];
      captions: number;
      durationSec: number;
    };
    if (data.clips.length === 0) return 'The timeline is empty.';
    const lines = data.clips.map(
      (c) =>
        `${c.index}. [${fmt(c.startSec)}–${fmt(c.endSec)}] ${c.kind === 'generate' ? '⬩slot ' : ''}${c.label || '(unlabeled)'}`,
    );
    return `${lines.join('\n')}\n${data.captions} captions · total ${fmt(data.durationSec)}`;
  }

  m = t(new RegExp(String.raw`regen(?:erate)?(?:\s+clips?)?\s+(?:from\s+)?${TIME}\s+(?:to|-|until)\s+${TIME}`, 'i'));
  if (m) {
    const a = parseTime(m[1].replace(/\s+/g, ''));
    const b = parseTime(m[2].replace(/\s+/g, ''));
    if (a === null || b === null || b <= a) return 'Give me a valid range, e.g. "regenerate 8:00 to 10:00".';
    const res = (await handlers.regenerate_range({ startSec: a, endSec: b })) as {
      error?: string;
      replaced?: number;
      skipped?: number;
    };
    if (res.error) return res.error;
    return `Done — regenerated ${res.replaced} clip${res.replaced === 1 ? '' : 's'} between ${fmt(a)} and ${fmt(b)}${
      res.skipped ? ` (${res.skipped} kept — no better footage found)` : ''
    }.`;
  }

  m = t(new RegExp(String.raw`cut\s+(?:from\s+)?${TIME}\s+(?:to|-|until)\s+${TIME}`, 'i'));
  if (m) {
    const a = parseTime(m[1].replace(/\s+/g, ''));
    const b = parseTime(m[2].replace(/\s+/g, ''));
    if (a === null || b === null || b <= a) return 'Give me a valid range, e.g. "cut 0:10 to 0:25".';
    const res = (await handlers.cut_range({ startSec: a, endSec: b })) as { error?: string; touched?: number };
    return res.error ?? `Done — cut ${fmt(a)}–${fmt(b)}.`;
  }

  m = t(/split(?:\s+clip)?\s+(?:at\s+)?([\d:.]+s?)/i);
  if (m) {
    const at = parseTime(m[1]);
    if (at === null) return `I couldn't read the time "${m[1]}".`;
    const res = (await handlers.split_clip({ atSec: at })) as { error?: string };
    return res.error ?? `Done — split the clip at ${fmt(at)}.`;
  }

  m = t(/(?:delete|remove)\s+clip\s+(?:at\s+)?([\d:.]+s?)/i);
  if (m) {
    const res = (await handlers.delete_clip({ ref: m[1].replace(/s$/, '') })) as { error?: string };
    return res.error ?? 'Done — clip deleted.';
  }

  m = t(/trim\s+clip\s+(\S+)\s+(start|end)\s+([\d:.]+s?)/i);
  if (m) {
    const val = parseTime(m[3]);
    if (val === null) return `I couldn't read the time "${m[3]}".`;
    const edit = m[2].toLowerCase() === 'start' ? { startSec: val } : { endSec: val };
    const res = (await handlers.trim_clip({ ref: m[1], ...edit })) as { error?: string };
    return res.error ?? `Done — clip ${m[1]} trimmed.`;
  }

  m = t(/replace\s+clip\s+(\S+)\s+with\s+(.+)/i);
  if (m) {
    const res = (await handlers.replace_clip({ ref: m[1], query: m[2] })) as {
      error?: string;
      found?: string;
      via?: string;
    };
    return res.error ?? `Done — swapped in "${res.found}" (${res.via}).`;
  }

  m = t(/caption\s+"([^"]+)"\s+([\d:.]+s?)\s+([\d:.]+s?)/i) ?? t(/caption\s+'([^']+)'\s+([\d:.]+s?)\s+([\d:.]+s?)/i);
  if (m) {
    const start = parseTime(m[2]);
    const end = parseTime(m[3]);
    if (start === null || end === null || end <= start) return 'Give me a valid start and end time.';
    await handlers.add_caption({ text: m[1], startSec: start, endSec: end });
    return `Done — caption added at ${fmt(start)}.`;
  }

  if (/^(help|\?|hi|hello)\b/.test(msg)) return HELP;
  return `I didn't recognize that command.\n${HELP}`;
}

/* --------------------------------- entry ---------------------------------- */

export async function agentChat(input: {
  message: string;
  timeline: Timeline;
  db: ClipDb;
  embedder: ClipEmbedder;
  ollama?: OllamaClient;
}): Promise<AgentResult> {
  const ctx: AgentContext = {
    timeline: structuredClone(input.timeline),
    actions: [],
    db: input.db,
    embedder: input.embedder,
  };

  // 1. OpenRouter (tencent/hy3:free) — the primary brain.
  if (hasOpenRouterKeys()) {
    const reply = await openRouterPlan(ctx, input.message);
    if (reply !== null) {
      return { reply, timeline: ctx.timeline, actions: ctx.actions, backend: 'openrouter' };
    }
    // Model unreachable/unusable — reset any partial state and fall through.
    ctx.timeline = structuredClone(input.timeline);
    ctx.actions = [];
  }

  // 2. Local Ollama tool loop.
  const ollama = input.ollama ?? new OllamaClient();
  if (await ollama.isAvailable()) {
    try {
      const reply = await runToolLoop(
        ollama,
        [
          {
            role: 'system',
            content:
              'You are Deep Video Agent, a video-editing assistant inside the Deep Video editor. ' +
              'Use the tools to inspect and edit the timeline the user is working on. ' +
              'Times are seconds on the project clock. Confirm what you changed, briefly.',
          },
          { role: 'user', content: input.message },
        ],
        TOOLS,
        makeHandlers(ctx),
      );
      return {
        reply: reply.content || 'Done.',
        timeline: ctx.timeline,
        actions: ctx.actions,
        backend: 'ollama',
      };
    } catch {
      ctx.timeline = structuredClone(input.timeline);
      ctx.actions = [];
    }
  }

  // 3. Deterministic commands — always available.
  const reply = await parseCommand(ctx, input.message);
  return { reply, timeline: ctx.timeline, actions: ctx.actions, backend: 'commands' };
}
