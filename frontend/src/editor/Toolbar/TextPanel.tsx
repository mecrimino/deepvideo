/**
 * Captions panel: generate captions from the speech in your footage, pick the
 * burn-in style, then add/edit/delete individual cues by hand.
 */

import { Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { CAPTION_STYLES } from '@deep-vision/shared';
import { generateCaptions } from '../../services/transcribe';
import { useEditorStore } from '../../stores/useEditorStore';
import { colors, fontMono } from '../../styles/theme';
import { formatDuration } from '../../utils/format';

/** Preset defaults, kept in step with caption_styles.py. */
const SIZE_PCT: Record<string, number> = {
  classic: 4.2, outline: 5, pop: 6.3, banner: 3.8, minimal: 3.3, top: 3.8, live: 4.5, karaoke: 9.1,
};
function defaultSizePct(id: string): number {
  return SIZE_PCT[id] ?? 4.2;
}
function defaultColor(id: string): string {
  return id === 'pop' || id === 'karaoke' ? '#FFE14D' : '#FFFFFF';
}
function defaultPlace(id: string): 'top' | 'middle' | 'bottom' {
  if (id === 'top') return 'top';
  if (id === 'karaoke') return 'middle';
  return 'bottom';
}

/** Miniature of each burn-in style, mirroring caption_styles.py. */
function captionSwatch(id: string): React.CSSProperties {
  const base: React.CSSProperties = {
    fontWeight: 800,
    lineHeight: 1,
    color: '#fff',
    fontSize: 10,
    padding: '1px 4px',
    borderRadius: 2,
    whiteSpace: 'nowrap',
  };
  switch (id) {
    case 'outline':
      return { ...base, fontSize: 12, background: 'transparent', textShadow: '0 0 2px #000, 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000' };
    case 'pop':
      return { ...base, fontSize: 13, color: '#FFE14D', background: 'transparent', letterSpacing: '.02em', textShadow: '1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000' };
    case 'banner':
      return { ...base, fontSize: 9, background: 'rgba(0,0,0,.85)', padding: '2px 14px', borderRadius: 0 };
    case 'minimal':
      return { ...base, fontSize: 8.5, background: 'transparent', textShadow: '1px 1px 2px rgba(0,0,0,.9)' };
    case 'top':
      return { ...base, fontSize: 9, background: 'rgba(0,0,0,.55)' };
    case 'live':
      return { ...base, fontSize: 11, background: 'transparent', textShadow: '1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000' };
    case 'karaoke':
      return { ...base, fontSize: 15, color: '#FFE14D', background: 'transparent', textShadow: '1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000' };
    default: // classic
      return { ...base, background: 'rgba(0,0,0,.55)' };
  }
}

export function TextPanel() {
  const timeline = useEditorStore((s) => s.timeline);
  const assets = useEditorStore((s) => s.assets);
  const selectedCueId = useEditorStore((s) => s.selectedCueId);
  const selectCue = useEditorStore((s) => s.selectCue);
  const setPlayhead = useEditorStore((s) => s.setPlayhead);
  const addCaptionAtPlayhead = useEditorStore((s) => s.addCaptionAtPlayhead);
  const updateCaption = useEditorStore((s) => s.updateCaption);
  const deleteCaption = useEditorStore((s) => s.deleteCaption);
  const replaceCaptions = useEditorStore((s) => s.replaceCaptions);
  const setCaptionStyle = useEditorStore((s) => s.setCaptionStyle);
  const setCaptionOptions = useEditorStore((s) => s.setCaptionOptions);
  const setNotice = useEditorStore((s) => s.setNotice);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const cues = timeline?.captions ?? [];
  const selected = cues.find((c) => c.id === selectedCueId) ?? null;
  const style = timeline?.captionStyle ?? 'classic';
  const opts = timeline?.captionOptions ?? {};

  /**
   * What to caption: the narration bed if there is one, otherwise the longest
   * video clip's own audio — i.e. the video the user just dropped in.
   */
  const captionSource = (): { path: string; what: string } | null => {
    if (!timeline) return null;
    if (timeline.audioPath) return { path: timeline.audioPath, what: 'narration' };
    const clips = timeline.tracks
      .filter((t) => t.kind === 'video' || t.kind === 'overlay')
      .flatMap((t) => t.clips)
      .filter((c) => c.source.kind === 'asset');
    let best: { path: string; dur: number } | null = null;
    for (const c of clips) {
      if (c.source.kind !== 'asset') continue;
      const a = assets[c.source.assetId];
      const dur = c.range.endSec - c.range.startSec;
      if (a && (!best || dur > best.dur)) best = { path: a.path, dur };
    }
    return best ? { path: best.path, what: 'your video' } : null;
  };

  const runGenerate = async () => {
    const src = captionSource();
    if (!src || busy) {
      if (!src) setNotice('add a video or narration audio first', true);
      return;
    }
    setBusy(true);
    setNotice(`transcribing ${src.what}…`);
    try {
      const res = await generateCaptions(src.path);
      if (!res.cues.length) {
        setNotice('no speech found in that media', true);
      } else {
        replaceCaptions(res.cues);
        setNotice(`added ${res.cues.length} captions from ${src.what}`);
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err), true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        width: 232,
        flexShrink: 0,
        borderRight: `1px solid ${colors.border7}`,
        background: colors.bgBar,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <div style={{ padding: '12px 12px 8px', fontSize: 13, fontWeight: 600 }}>Captions</div>

      {/* generate from the speech in the footage */}
      <div style={{ padding: '0 12px 10px' }}>
        <button
          onClick={() => void runGenerate()}
          disabled={busy}
          className="hv-blue"
          title="Transcribe the speech in your video (or narration) into timed captions"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
            padding: '9px 10px',
            borderRadius: 8,
            background: colors.accent,
            border: 'none',
            color: '#00120c',
            fontSize: 12,
            fontWeight: 700,
            cursor: busy ? 'wait' : 'pointer',
            opacity: busy ? 0.75 : 1,
          }}
        >
          {busy ? (
            <>
              <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
              Transcribing…
            </>
          ) : (
            <>
              <Sparkles size={13} />
              Generate captions
            </>
          )}
        </button>
        {cues.length > 0 && (
          <div style={{ fontSize: 10, color: colors.textGhost, marginTop: 5, lineHeight: 1.45 }}>
            {cues.length} cues · regenerating replaces them (Ctrl+Z undoes it)
          </div>
        )}
      </div>

      {/* burn-in style */}
      <div style={{ padding: '0 12px 12px' }}>
        <div
          style={{
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: '.07em',
            textTransform: 'uppercase',
            color: colors.textGhost,
            marginBottom: 7,
          }}
        >
          Style
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {CAPTION_STYLES.map((s) => {
            const active = s.id === style;
            return (
              <button
                key={s.id}
                onClick={() => setCaptionStyle(s.id)}
                title={s.hint}
                className={active ? undefined : 'hv-dark'}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  gap: 4,
                  padding: 5,
                  borderRadius: 7,
                  background: active ? 'rgba(12,176,142,.16)' : colors.card,
                  border: `1px solid ${active ? colors.accent : colors.border8}`,
                  cursor: 'pointer',
                }}
              >
                {/* a real miniature of what the burn looks like */}
                <span
                  style={{
                    height: 26,
                    borderRadius: 4,
                    background: '#05141d',
                    display: 'grid',
                    placeItems: s.id === 'top' ? 'start center' : 'end center',
                    padding: '3px 2px',
                    overflow: 'hidden',
                  }}
                >
                  <span style={captionSwatch(s.id)}>Aa</span>
                </span>
                <span
                  style={{
                    fontSize: 9.5,
                    color: active ? colors.accentHi : colors.textDim,
                    textAlign: 'center',
                  }}
                >
                  {s.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* customise the chosen style */}
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10.5, color: colors.textFaint }}>
            Size
            <input
              type="range"
              min={2}
              max={18}
              step={0.5}
              value={opts.sizePct ?? defaultSizePct(style)}
              onChange={(e) => setCaptionOptions({ sizePct: Number(e.target.value) })}
              style={{ flex: 1, accentColor: colors.accent }}
            />
            <span style={{ width: 26, textAlign: 'right', color: colors.textDim }}>
              {(opts.sizePct ?? defaultSizePct(style)).toFixed(1)}
            </span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10.5, color: colors.textFaint }}>
            Colour
            <input
              type="color"
              value={opts.color ?? defaultColor(style)}
              onChange={(e) => setCaptionOptions({ color: e.target.value })}
              style={{ width: 34, height: 22, background: 'transparent', border: `1px solid ${colors.border8}`, borderRadius: 5, padding: 0, cursor: 'pointer' }}
            />
            <span style={{ flex: 1 }} />
            <button
              onClick={() => setCaptionOptions({ upper: !(opts.upper ?? false) })}
              className="hv-dark"
              title="Force UPPERCASE"
              style={{
                fontSize: 10,
                padding: '3px 8px',
                borderRadius: 5,
                background: opts.upper ? 'rgba(12,176,142,.18)' : colors.card,
                border: `1px solid ${opts.upper ? colors.accent : colors.border8}`,
                color: opts.upper ? colors.accentHi : colors.textDim,
                cursor: 'pointer',
              }}
            >
              AA
            </button>
          </label>

          <div style={{ display: 'flex', gap: 5 }}>
            {(['top', 'middle', 'bottom'] as const).map((pl) => {
              const on = (opts.place ?? defaultPlace(style)) === pl;
              return (
                <button
                  key={pl}
                  onClick={() => setCaptionOptions({ place: pl })}
                  className={on ? undefined : 'hv-dark'}
                  style={{
                    flex: 1,
                    fontSize: 10,
                    padding: '4px 0',
                    borderRadius: 5,
                    textTransform: 'capitalize',
                    background: on ? 'rgba(12,176,142,.18)' : colors.card,
                    border: `1px solid ${on ? colors.accent : colors.border8}`,
                    color: on ? colors.accentHi : colors.textDim,
                    cursor: 'pointer',
                  }}
                >
                  {pl}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ padding: '0 12px 10px', display: 'flex', gap: 6 }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && draft.trim()) {
              addCaptionAtPlayhead(draft.trim());
              setDraft('');
            }
          }}
          placeholder="New caption text…"
          style={{
            flex: 1,
            background: colors.card,
            border: `1px solid ${colors.border8}`,
            borderRadius: 8,
            color: colors.text,
            fontSize: 12,
            padding: '7px 9px',
          }}
        />
        <button
          className="hv-blue"
          onClick={() => {
            if (draft.trim()) {
              addCaptionAtPlayhead(draft.trim());
              setDraft('');
            }
          }}
          title="Add at playhead"
          style={{
            width: 32,
            borderRadius: 8,
            background: colors.accent,
            border: 'none',
            color: '#fff',
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
          }}
        >
          <Plus size={14} />
        </button>
      </div>

      {selected && (
        <div style={{ padding: '0 12px 10px' }}>
          <div style={{ fontSize: 10.5, color: colors.textGhost, marginBottom: 4 }}>Edit selected</div>
          <textarea
            value={selected.text}
            onChange={(e) => updateCaption(selected.id, e.target.value)}
            rows={2}
            style={{
              width: '100%',
              background: colors.card,
              border: `1px solid ${colors.accent}`,
              borderRadius: 8,
              color: colors.text,
              fontSize: 12,
              padding: '7px 9px',
              resize: 'vertical',
            }}
          />
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px', minHeight: 0 }}>
        {cues.length === 0 && (
          <div style={{ fontSize: 11.5, color: colors.textGhost, lineHeight: 1.5 }}>
            No captions yet. Type above and press Enter to add one at the playhead.
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {cues.map((cue) => (
            <div
              key={cue.id}
              onClick={() => {
                selectCue(cue.id);
                setPlayhead(cue.range.startSec);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                background: cue.id === selectedCueId ? 'rgba(12,176,142,.16)' : colors.card,
                border: `1px solid ${cue.id === selectedCueId ? colors.accent : colors.border8}`,
                borderRadius: 8,
                padding: '6px 8px',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontFamily: fontMono, fontSize: 9.5, color: colors.textMono, flexShrink: 0 }}>
                {formatDuration(cue.range.startSec)}
              </span>
              <span
                style={{
                  flex: 1,
                  fontSize: 11,
                  color: colors.textDim,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {cue.text}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteCaption(cue.id);
                }}
                title="Delete caption"
                style={{ background: 'transparent', border: 'none', color: colors.textGhost, cursor: 'pointer', padding: 2 }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
