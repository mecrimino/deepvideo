/**
 * Offline transcription — Whisper running locally via @xenova/transformers
 * (onnxruntime, CPU). No cloud call: the quantized model downloads once into
 * DATA_DIR/models and runs offline afterwards.
 *
 * Audio of any container/codec is first decoded to 16 kHz mono float32 PCM
 * with ffmpeg (already a hard dependency), then fed to the ASR pipeline with
 * word-level timestamps — exactly what the segmenter (Deep Video v1 Mini
 * step 1) needs for clause-boundary segments.
 */

import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import type { Transcript, Word } from '@deep-video/shared';
import { DATA_DIR } from './paths.js';

const run = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg';
const SAMPLE_RATE = 16_000;

export interface TranscribeOptions {
  /** whisper model name, e.g. 'base.en' (env WHISPER_MODEL) or a full HF id. */
  model?: string;
  language?: string;
}

function modelId(name: string): string {
  return name.includes('/') ? name : `Xenova/whisper-${name}`;
}

type AsrPipeline = (
  audio: Float32Array,
  opts: Record<string, unknown>,
) => Promise<{ text: string; chunks?: { text: string; timestamp: [number, number | null] }[] }>;

let asrPromise: Promise<AsrPipeline> | null = null;

async function loadAsr(model: string): Promise<AsrPipeline> {
  if (!asrPromise) {
    asrPromise = (async () => {
      const tf = await import('@xenova/transformers');
      tf.env.cacheDir = path.join(DATA_DIR, 'models');
      tf.env.allowLocalModels = false;
      const pipe = await tf.pipeline('automatic-speech-recognition', modelId(model));
      return pipe as unknown as AsrPipeline;
    })();
    asrPromise.catch(() => {
      asrPromise = null; // allow retry after a failed model download
    });
  }
  return asrPromise;
}

/** True once the whisper weights are loadable (downloads on first call). */
export async function whisperAvailable(): Promise<boolean> {
  try {
    await loadAsr(process.env.WHISPER_MODEL ?? 'base.en');
    return true;
  } catch {
    return false;
  }
}

/** Decode any audio/video file to 16 kHz mono float32 PCM via ffmpeg. */
async function decodePcm(audioPath: string): Promise<Float32Array> {
  const { stdout } = await run(
    FFMPEG,
    ['-v', 'error', '-i', audioPath, '-vn', '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 'f32le', 'pipe:1'],
    { encoding: 'buffer', maxBuffer: 1024 * 1024 * 512 },
  );
  const buf = stdout as unknown as Buffer;
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
}

export async function transcribeAudio(
  audioPath: string,
  opts?: TranscribeOptions,
): Promise<Transcript> {
  const model = opts?.model ?? process.env.WHISPER_MODEL ?? 'base.en';
  const [asr, pcm] = await Promise.all([loadAsr(model), decodePcm(audioPath)]);
  if (pcm.length < SAMPLE_RATE / 4) throw new Error('audio too short to transcribe');
  const durationSec = pcm.length / SAMPLE_RATE;

  const result = await asr(pcm, {
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: 'word',
    ...(opts?.language && !model.endsWith('.en') ? { language: opts.language } : {}),
  });

  const words: Word[] = [];
  let cursor = 0;
  for (const chunk of result.chunks ?? []) {
    const text = chunk.text.trim();
    if (!text) continue;
    const startSec = chunk.timestamp?.[0] ?? cursor;
    const endSec = chunk.timestamp?.[1] ?? startSec + 0.25;
    cursor = endSec;
    words.push({ text, startSec, endSec });
  }

  return {
    text: result.text.trim(),
    words,
    language: model.endsWith('.en') ? 'en' : (opts?.language ?? 'auto'),
    durationSec: Math.round(durationSec * 100) / 100,
  };
}
