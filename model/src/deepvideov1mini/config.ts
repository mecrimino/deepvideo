/**
 * Deep Video v1 Mini — configuration and prompts.
 *
 * Numbers and prompt texts follow the "Deep Video v1 — Clip-Matching Pipeline
 * Spec" (7 stages: transcribe → niche → keyword → retrieve → CLIP re-rank →
 * threshold → anti-repetition).
 *
 * CALIBRATION NOTE — the spec quotes a 0.75 cosine threshold / 0.15 repeat
 * penalty for open_clip ViT-B/32 scores. Real text↔image cosine similarity
 * from CLIP ViT-B/32 (the Xenova/clip-vit-base-patch32 weights the server
 * embedder runs) lives on a much smaller scale: strong matches ≈ 0.28-0.33,
 * weak ones ≈ 0.18-0.22. The spec itself says to tune the threshold against
 * your own examples rather than trust the number blindly, so the defaults
 * below are that same rule mapped onto the real scale (~ratio preserved:
 * penalty ≈ 20% of threshold). Override via MiniSettings when tuning.
 */

/** Clause-boundary conjunctions from the spec's segmenter. */
export const CONJUNCTIONS = new Set(['while', 'but', 'and', 'so', 'because', 'then', 'as']);

/** Hard cap on one clip's span (seconds). */
export const MAX_SEG_SEC = 8.0;

/** Silence longer than this starts a new segment (seconds). */
export const PAUSE_GAP_SEC = 0.4;

/** Niche detection reads only the first N chars of the transcript. */
export const NICHE_INPUT_CHARS = 500;

export interface MiniSettings {
  /** Minimum CLIP cosine for an auto pick (spec: 0.75 on open_clip scale). */
  matchThreshold: number;
  /** Soft score penalty for clips already used in this project (spec: 0.15). */
  repeatPenalty: number;
  /** Results requested per stock source per query (spec: top 10-15 each). */
  perSourceCount: number;
  /** Max candidates CLIP-scored per segment (thumbnail downloads are the cost). */
  maxCandidatesPerSegment: number;
}

export const DEFAULT_MINI_SETTINGS: MiniSettings = {
  matchThreshold: 0.26,
  repeatPenalty: 0.05,
  perSourceCount: 15,
  maxCandidatesPerSegment: 24,
};

/** LLM route names (see api.md for keys/limits). */
export const MINI_NICHE_MODEL = 'openai/gpt-oss-120b'; // via Groq
export const MINI_KEYWORD_MODEL = 'tencent/hy3:free'; // via OpenRouter

/* ----------------------------- Prompt 1 — niche ---------------------------- */

export const NICHE_PROMPT = `You are an expert content classification AI.
Your task is to identify the primary niche of a video script.
Analyze the entire script and determine the single most appropriate content niche.

Rules:
- Choose ONLY ONE primary niche.
- Ignore writing style, tone, and marketing language.
- Focus on the actual subject matter.
- Return the niche that best represents the majority of the script.
- Use broad, industry-standard categories.
- Output ONLY the niche name.
- No explanation.
- No punctuation.
- Maximum 3 words.

Possible niches include (but are not limited to):
Health, Senior Health, Fitness, Nutrition, Medical, Mental Health, Psychology,
Education, Science, Technology, Artificial Intelligence, Programming, Finance,
Investing, Business, Marketing, History, Documentary, True Crime, Law, Politics,
Military, Biography, Space, Nature, Wildlife, Travel, Food, Cooking, DIY,
Real Estate, Parenting, Relationships, Motivation, Self Improvement,
Productivity, Sports, Gaming, Cars, Luxury, Fashion, Beauty, Pets,
Entertainment, News

Script:
{{SCRIPT}}`;

/* ---------------------------- Prompt 2 — keyword --------------------------- */

export const KEYWORD_PROMPT = `You are an expert stock footage keyword extractor for an AI video editor.

You are given:
1. The video's niche.
2. A single script segment.

Your task is to extract ONLY ONE highly searchable stock footage keyword or
short phrase that best represents what should appear on screen for that
specific script segment.

Rules:
- Use the niche as context when choosing the keyword.
- Focus on what can be visually shown, not what is being implied.
- Prioritize people and actions over objects.
- If the niche suggests a specific type of person, include it in the keyword.
  Examples:
  - Senior Health -> senior
  - Fitness -> athlete
  - Medical -> doctor or patient
  - Education -> teacher or student
  - Business -> business people
- Ignore narration, opinions, metaphors, and abstract concepts.
- Return the most common stock footage search phrase.
- Prefer 2-4 words.
- Output ONLY the keyword.
- No punctuation.
- No explanation.

Video Niche:
{{NICHE}}

Script Segment:
{{SCRIPT_SEGMENT}}`;

/* ------------------------- Prompt 0 — script writer ------------------------ */

/**
 * Not in the clip-matching spec: when the user typed a short IDEA instead of a
 * narration script, Mini first writes the script it will then match footage to
 * (this is what makes Mini a full "prompt -> finished video" model).
 */
export const SCRIPT_PROMPT = `You are a professional YouTube narration writer for faceless videos.
Write a short, engaging narration script for the video idea below.

Rules:
- 130 to 180 words total.
- Short, concrete, visual sentences — every line should be filmable with stock footage.
- Hook in the first sentence. No headings, no scene directions, no cue tags,
  no "Narrator:" labels — output ONLY the spoken words.
- Plain language, second person where natural.

Video idea:
{{IDEA}}`;

/** Drop the most specific word (usually the last) for a wider retry. */
export function broadenKeyword(keyword: string): string {
  const words = keyword.split(/\s+/).filter(Boolean);
  return words.length > 2 ? words.slice(0, -1).join(' ') : keyword;
}
