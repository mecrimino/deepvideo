/**
 * Narration voice picker — shown on the Creative Setup screen so the user
 * chooses (and auditions) a voice BEFORE the video is generated. Voices come
 * from the local Kokoro TTS engine via GET /api/voices; the play button streams
 * a real sample from /api/voice/preview/:voice. Selection is stored in
 * useAppStore.voice and sent with the pipeline run.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Mic, Pause, Play, TriangleAlert } from 'lucide-react';
import type { Voice } from '@deep-vision/shared';
import { listVoices, voicePreviewUrl } from '../services/voices';
import { useAppStore } from '../stores/useAppStore';
import { colors } from '../styles/theme';

export function VoicePicker({
  value,
  onSelect,
}: {
  /** Controlled voice name — defaults to useAppStore.voice. */
  value?: string;
  onSelect?: (voice: string) => void;
} = {}) {
  const storeVoice = useAppStore((s) => s.voice);
  const storeSelect = useAppStore((s) => s.selectVoice);
  const voice = value ?? storeVoice;
  const selectVoice = onSelect ?? storeSelect;

  const [voices, setVoices] = useState<Voice[] | null>(null);
  const [available, setAvailable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState<string>('');
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let alive = true;
    listVoices()
      .then((r) => {
        if (!alive) return;
        setVoices(r.voices);
        setAvailable(r.available);
        const cur = r.voices.find((v) => v.name === voice);
        setLang(cur?.language ?? r.voices[0]?.language ?? '');
        // If the stored voice isn't offered, fall back to the server default.
        if (r.voices.length && !cur) selectVoice(r.default || r.voices[0].name);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
      audioRef.current?.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const languages = useMemo(
    () => Array.from(new Set((voices ?? []).map((v) => v.language))),
    [voices],
  );
  const inLang = useMemo(
    () => (voices ?? []).filter((v) => v.language === lang),
    [voices, lang],
  );
  const selected = useMemo(() => (voices ?? []).find((v) => v.name === voice), [voices, voice]);

  const preview = (name: string) => {
    const el = audioRef.current;
    if (!el) return;
    if (playing === name) {
      el.pause();
      setPlaying(null);
      return;
    }
    el.src = voicePreviewUrl(name);
    el.play().then(() => setPlaying(name)).catch(() => setPlaying(null));
  };

  const card: React.CSSProperties = {
    background: colors.panel,
    border: `1px solid ${colors.border8}`,
    borderRadius: 16,
    padding: 20,
    marginBottom: 18,
  };

  return (
    <div style={card}>
      <audio ref={audioRef} onEnded={() => setPlaying(null)} style={{ display: 'none' }} />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          fontSize: 14.5,
          fontWeight: 600,
          marginBottom: 6,
        }}
      >
        <Mic size={17} color={colors.textFaint} />
        Narration Voice
      </div>
      <div style={{ fontSize: 12.5, color: colors.textFaint, marginBottom: 16 }}>
        The agent speaks your script in this voice. Press play to preview.
      </div>

      {error && (
        <div style={{ fontSize: 13, color: colors.textDim }}>Couldn't load voices: {error}</div>
      )}

      {!error && voices === null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: colors.textFaint }}>
          <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Loading voices…
        </div>
      )}

      {!error && voices && !available && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            background: 'rgba(220,160,40,.10)',
            border: '1px solid rgba(220,160,40,.30)',
            borderRadius: 10,
            padding: '10px 12px',
            fontSize: 12.5,
            color: colors.textDim,
          }}
        >
          <TriangleAlert size={15} color="#d9a445" />
          The local TTS engine isn't running, so narration won't be synthesized.
          Start it (port 8001) to enable voice-over.
        </div>
      )}

      {!error && voices && voices.length > 0 && (
        <>
          {/* language tabs */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 14 }}>
            {languages.map((l) => {
              const on = l === lang;
              return (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className="hv-row"
                  style={{
                    fontSize: 12.5,
                    padding: '5px 11px',
                    borderRadius: 999,
                    border: `1px solid ${on ? colors.accent : colors.border8}`,
                    background: on ? 'rgba(90,130,255,.12)' : colors.chip,
                    color: on ? colors.textBright : colors.textSoft,
                    fontWeight: on ? 600 : 500,
                  }}
                >
                  {l}
                </button>
              );
            })}
          </div>

          {/* voice list for the selected language */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
              maxHeight: 232,
              overflowY: 'auto',
            }}
          >
            {inLang.map((v) => {
              const on = v.name === voice;
              return (
                <div
                  key={v.name}
                  onClick={() => selectVoice(v.name)}
                  className="hv-row"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    padding: '9px 11px',
                    borderRadius: 10,
                    cursor: 'pointer',
                    background: on ? 'rgba(90,130,255,.12)' : colors.card,
                    border: `1px solid ${on ? colors.accent : colors.border6}`,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: on ? 600 : 500,
                        color: colors.textBright,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {prettyName(v.name)}
                    </div>
                    <div style={{ fontSize: 11, color: colors.textFaint }}>{v.gender_label}</div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      preview(v.name);
                    }}
                    className="hv-dark"
                    title={`Preview ${prettyName(v.name)}`}
                    style={{
                      flexShrink: 0,
                      width: 30,
                      height: 30,
                      borderRadius: '50%',
                      display: 'grid',
                      placeItems: 'center',
                      background: colors.raised,
                      border: `1px solid ${colors.border9}`,
                      color: colors.textSoft,
                    }}
                  >
                    {playing === v.name ? <Pause size={14} /> : <Play size={14} />}
                  </button>
                </div>
              );
            })}
          </div>

          {selected && (
            <div style={{ marginTop: 14, fontSize: 12.5, color: colors.textFaint }}>
              Selected:{' '}
              <span style={{ color: colors.textBright, fontWeight: 600 }}>
                {prettyName(selected.name)}
              </span>{' '}
              · {selected.gender_label} · {selected.language}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** 'am_michael' → 'Michael', 'af_heart' → 'Heart'. */
function prettyName(name: string): string {
  const base = name.includes('_') ? name.slice(name.indexOf('_') + 1) : name;
  return base.charAt(0).toUpperCase() + base.slice(1);
}
