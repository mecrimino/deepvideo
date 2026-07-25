/**
 * Editing Lab (/test) — two benches over the same clip library:
 *   Looks  — a filter preset applied to a clip, shown next to the original.
 *   Shots  — a built graphic (article panel, photo float, name plate, VHS…)
 *            from your image + text + background + entry sfx.
 *
 * Presets live in Editinglab/presets.json; the controls each shot exposes come
 * from the backend (services/compose.ts) and are rendered generically here, so
 * a new knob appears in this UI without touching this file. Everything is
 * rendered by ffmpeg for real — no CSS approximations.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClipAsset } from '@deep-vision/shared';
import { listClips, uploadMedia } from '../services/clips';
import { ControlField, seedValues, usePresetLibrary } from '../components/PresetControls';
import type { Composition, Control, EditPreset, PresetValues } from '../components/PresetControls';
import { fetchJson } from '../utils/fetchJson';
import { colors, fontMono } from '../styles/theme';

interface PreviewResponse {
  url: string;
  preset: EditPreset;
  cached: boolean;
  ms: number;
  filter?: string;
}

interface ComposeResponse {
  url: string;
  composition: Composition;
  cached: boolean;
  ms: number;
}

type Values = PresetValues;

const DURATION = 4;

export function EditingLabScreen() {
  const [mode, setMode] = useState<'looks' | 'shots'>('looks');
  const lib = usePresetLibrary();
  const { presets, compositions: comps, controls } = lib;
  const [clips, setClips] = useState<ClipAsset[]>([]);
  const [src, setSrc] = useState('');
  const [startSec, setStartSec] = useState(0);
  const [active, setActive] = useState<EditPreset | null>(null);
  const [activeComp, setActiveComp] = useState<Composition | null>(null);
  const [values, setValues] = useState<Values>({});
  const [result, setResult] = useState<PreviewResponse | null>(null);
  const [shot, setShot] = useState<ComposeResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const originalRef = useRef<HTMLVideoElement>(null);

  const loadPresets = lib.reload;

  useEffect(() => {
    void listClips()
      .then(({ assets }) => {
        const usable = assets.filter((a) => /\.(mp4|mov|webm|mkv|png|jpe?g|webp)$/i.test(a.path));
        setClips(usable);
        if (usable[0]) setSrc(usable[0].path);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  const run = useCallback(
    async (preset: EditPreset) => {
      if (!src) return;
      setActive(preset);
      setBusy(true);
      setError('');
      try {
        const res = await fetchJson<PreviewResponse>('/api/editinglab/preview', {
          body: { presetId: preset.id, src, startSec, durationSec: DURATION },
        });
        setResult(res);
        originalRef.current?.play().catch(() => undefined);
      } catch (err) {
        setResult(null);
        setError((err as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [src, startSec],
  );

  const compose = useCallback(
    async (comp: Composition, vals: Values) => {
      setBusy(true);
      setError('');
      try {
        const res = await fetchJson<ComposeResponse>('/api/editinglab/compose', {
          body: { presetId: comp.id, image: src || undefined, ...vals },
        });
        setShot(res);
      } catch (err) {
        setShot(null);
        setError((err as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [src],
  );

  /** Selecting a shot seeds the control values from that preset's defaults. */
  const pickComp = useCallback(
    (comp: Composition) => {
      const seeded = seedValues(comp, controls[comp.kind] ?? [], src);
      setActiveComp(comp);
      setValues(seeded);
      void compose(comp, seeded);
    },
    [controls, compose],
  );

  /** The source clip changed — re-render whatever is on screen against it. */
  useEffect(() => {
    if (mode === 'looks' && active && src) void run(active);
    if (mode === 'shots' && activeComp && src) void compose(activeComp, values);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, startSec, mode]);

  const onUpload = useCallback(async (file: File) => {
    setBusy(true);
    setError('');
    try {
      const { asset } = await uploadMedia(file);
      setClips((prev) => [asset, ...prev]);
      setSrc(asset.path);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  const groups = [...new Set(presets.map((p) => p.group))];
  const activeControls = activeComp ? controls[activeComp.kind] ?? [] : [];

  const setValue = (key: string, v: string | number | boolean | string[]) =>
    setValues((p) => ({ ...p, [key]: v }));

  return (
    // Full-height shell: the page itself never scrolls, so the header stays put
    // and the players always fit whatever the clip's aspect.
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: colors.bg,
        color: colors.text,
      }}
    >
      <header
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          padding: '12px 20px',
          borderBottom: `1px solid ${colors.border7}`,
          background: colors.bgBar,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 17, letterSpacing: 0.2 }}>Editing Lab</h1>
        <div style={{ display: 'flex', gap: 2, background: colors.control, borderRadius: 8, padding: 2 }}>
          {(['looks', 'shots'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                border: 'none',
                cursor: 'pointer',
                borderRadius: 6,
                padding: '5px 12px',
                fontSize: 12,
                background: mode === m ? colors.accent : 'transparent',
                color: mode === m ? '#fff' : colors.textDim,
              }}
            >
              {m === 'looks' ? `Looks (${presets.length})` : `Shots (${comps.length})`}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <label style={{ ...buttonStyle, display: 'inline-flex', alignItems: 'center' }}>
          upload image
          <input
            type="file"
            accept="image/*,video/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onUpload(f);
              e.target.value = '';
            }}
          />
        </label>
        <select value={src} onChange={(e) => setSrc(e.target.value)} style={{ ...inputStyle, maxWidth: 320 }}>
          {clips.length === 0 && <option value="">no clips in the library</option>}
          {clips.map((c) => (
            <option key={c.id} value={c.path}>
              {c.path.split('/').pop()} · {Math.round(c.durationSec)}s · {c.width}×{c.height}
            </option>
          ))}
        </select>
        {mode === 'looks' && (
          <label style={{ fontSize: 12, color: colors.textDim, display: 'flex', alignItems: 'center', gap: 6 }}>
            in
            <input
              type="number"
              min={0}
              step={1}
              value={startSec}
              onChange={(e) => setStartSec(Math.max(0, Number(e.target.value) || 0))}
              style={{ ...inputStyle, width: 60 }}
            />
            s
          </label>
        )}
        <button onClick={() => void loadPresets()} style={buttonStyle}>
          reload presets
        </button>
      </header>

      {(error || lib.error) && (
        <div
          style={{
            flexShrink: 0,
            background: '#2a1113',
            borderBottom: `1px solid ${colors.border10}`,
            color: '#ffb3b3',
            padding: '8px 20px',
            fontSize: 12,
            fontFamily: fontMono,
            whiteSpace: 'pre-wrap',
          }}
        >
          {error || lib.error}
        </div>
      )}

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: mode === 'shots' ? '220px 1fr 300px' : '240px 1fr',
          gap: 14,
          padding: '14px 20px',
        }}
      >
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', paddingRight: 4 }}>
          {mode === 'shots' &&
            comps.map((c) => (
              <PresetButton
                key={c.id}
                name={c.name}
                note={c.note}
                on={activeComp?.id === c.id}
                disabled={busy}
                onClick={() => pickComp(c)}
              />
            ))}
          {mode === 'looks' &&
            groups.map((group) => (
              <section key={group}>
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: 1.2,
                    textTransform: 'uppercase',
                    color: colors.textMono,
                    marginBottom: 6,
                  }}
                >
                  {group}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {presets
                    .filter((p) => p.group === group)
                    .map((p) => (
                      <PresetButton
                        key={p.id}
                        name={p.name}
                        note={p.note}
                        on={active?.id === p.id}
                        disabled={!src}
                        onClick={() => void run(p)}
                      />
                    ))}
                </div>
              </section>
            ))}
        </aside>

        <main style={{ minHeight: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: 'grid',
              gridTemplateColumns: mode === 'shots' ? '1fr' : '1fr 1fr',
              gap: 12,
            }}
          >
            {mode === 'looks' && (
              <Pane label="original">
                {!src ? (
                  <Empty text="pick or upload something" />
                ) : /\.(png|jpe?g|webp)$/i.test(src) ? (
                  <img src={`/files/${src}`} alt="" style={videoStyle} />
                ) : (
                  <video
                    ref={originalRef}
                    key={`${src}-${startSec}`}
                    src={`/files/${src}#t=${startSec},${startSec + DURATION}`}
                    muted
                    loop
                    autoPlay
                    playsInline
                    style={videoStyle}
                  />
                )}
              </Pane>
            )}

            {mode === 'looks' ? (
              <Pane
                label={
                  active
                    ? `${active.name}${result?.cached ? ' · cached' : result ? ` · ${result.ms}ms` : ''}`
                    : 'preset'
                }
              >
                {busy && <Empty text="rendering with ffmpeg…" />}
                {!busy && result && (
                  <video key={result.url} src={result.url} muted loop autoPlay playsInline style={videoStyle} />
                )}
                {!busy && !result && <Empty text="select a preset" />}
              </Pane>
            ) : (
              <Pane
                label={
                  activeComp
                    ? `${activeComp.name}${shot?.cached ? ' · cached' : shot ? ` · ${shot.ms}ms` : ''} · sound on`
                    : 'shot'
                }
              >
                {busy && <Empty text="composing with ffmpeg…" />}
                {/* not muted: the entry sfx is half the preset */}
                {!busy && shot && (
                  <video key={shot.url} src={shot.url} controls loop autoPlay playsInline style={videoStyle} />
                )}
                {!busy && !shot && <Empty text="select a shot preset" />}
              </Pane>
            )}
          </div>

          {mode === 'looks' && active && (
            <pre
              style={{
                flexShrink: 0,
                maxHeight: 76,
                overflowY: 'auto',
                margin: 0,
                padding: 10,
                background: colors.panel,
                border: `1px solid ${colors.border7}`,
                borderRadius: 10,
                fontFamily: fontMono,
                fontSize: 11,
                color: colors.textDim,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {result?.filter ?? active.filter}
            </pre>
          )}
        </main>

        {mode === 'shots' && (
          <aside
            style={{
              minHeight: 0,
              overflowY: 'auto',
              background: colors.panel,
              border: `1px solid ${colors.border7}`,
              borderRadius: 12,
              padding: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            {!activeComp && <Empty text="pick a shot to see its controls" />}
            {activeComp && (
              <>
                <div style={{ fontSize: 11, color: colors.textFaint }}>
                  {activeComp.kind} · {activeControls.length} controls
                </div>
                {activeControls.map((ctl) => (
                  <ControlField
                    key={ctl.key}
                    ctl={ctl}
                    value={values[ctl.key]}
                    lib={lib}
                    clips={clips}
                    onAssetAdded={(asset) => setClips((prev) => [asset, ...prev])}
                    onChange={(v) => setValue(ctl.key, v)}
                  />
                ))}
                <button
                  onClick={() => void compose(activeComp, values)}
                  disabled={busy}
                  style={{
                    ...buttonStyle,
                    background: colors.accent,
                    borderColor: colors.accent,
                    color: '#fff',
                    padding: '9px 12px',
                    marginTop: 2,
                  }}
                >
                  {busy ? 'rendering…' : 'render'}
                </button>
                {shot && (
                  <a
                    href={shot.url}
                    download
                    style={{ ...buttonStyle, textAlign: 'center', textDecoration: 'none', color: colors.textDim }}
                  >
                    download mp4
                  </a>
                )}
              </>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

function PresetButton({
  name,
  note,
  on,
  disabled,
  onClick,
}: {
  name: string;
  note?: string;
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        textAlign: 'left',
        padding: '8px 10px',
        borderRadius: 8,
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: on ? colors.control : colors.card,
        border: `1px solid ${on ? colors.accent : colors.border7}`,
        color: colors.text,
      }}
    >
      <div style={{ fontSize: 13 }}>{name}</div>
      {note && <div style={{ fontSize: 11, color: colors.textGhost, marginTop: 2 }}>{note}</div>}
    </button>
  );
}

function Pane({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        background: colors.panel,
        border: `1px solid ${colors.border7}`,
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          flexShrink: 0,
          padding: '7px 11px',
          fontSize: 11,
          color: colors.textFaint,
          borderBottom: `1px solid ${colors.border6}`,
        }}
      >
        {label}
      </div>
      {/* flex:1 + minHeight:0 makes the player shrink to the viewport instead
          of pushing the page taller on tall (9:16) sources. */}
      <div style={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'center', background: '#000', padding: 6 }}>
        {children}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <span style={{ fontSize: 12, color: colors.textGhost }}>{text}</span>;
}

const inputStyle: React.CSSProperties = {
  background: colors.control,
  border: `1px solid ${colors.border9}`,
  color: colors.text,
  borderRadius: 8,
  padding: '6px 8px',
  fontSize: 12,
  fontFamily: 'inherit',
};

const buttonStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' };

const videoStyle: React.CSSProperties = {
  maxWidth: '100%',
  maxHeight: '100%',
  width: 'auto',
  height: 'auto',
  minHeight: 0,
  objectFit: 'contain',
  borderRadius: 6,
};
