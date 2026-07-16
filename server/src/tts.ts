/**
 * OPTIONAL local text-to-speech with Piper (script -> narration audio), for
 * users who start from a typed script instead of recorded audio.
 *
 * TODO(implement, optional): shell out to the `piper` binary via child_process
 * with a downloaded voice model; write wav under DATA_DIR. Keep this optional —
 * the pipeline must work with user-provided audio when Piper is absent.
 */

export interface TtsOptions {
  /** Piper voice model name/path. */
  voice?: string;
  speakingRate?: number;
}

/** Synthesize narration; returns the path of the generated wav. */
export async function synthesizeSpeech(_text: string, _opts?: TtsOptions): Promise<string> {
  throw new Error('TODO(server/tts.synthesizeSpeech): not implemented — see server/CLAUDE.md');
}

/** True when a piper binary + voice model are available locally. */
export async function isTtsAvailable(): Promise<boolean> {
  return false;
}
