/**
 * Offline transcription with whisper.cpp via `nodejs-whisper`.
 *
 * TODO(implement): add dep `nodejs-whisper` (downloads/builds whisper.cpp and
 * fetches the WHISPER_MODEL weights on first run). Request word-level
 * timestamps and map the output into the shared Transcript shape. Convert
 * non-wav inputs to 16 kHz mono wav with ffmpeg first.
 */

import type { Transcript } from '@deep-video/shared';

export interface TranscribeOptions {
  /** whisper.cpp model name, e.g. 'base.en' (env WHISPER_MODEL). */
  model?: string;
  language?: string;
}

export async function transcribeAudio(
  _audioPath: string,
  _opts?: TranscribeOptions,
): Promise<Transcript> {
  throw new Error('TODO(server/transcribe.transcribeAudio): not implemented — see server/CLAUDE.md');
}
