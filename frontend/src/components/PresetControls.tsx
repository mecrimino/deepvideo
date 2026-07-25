/**
 * The preset control surface, shared by the Editing Lab (/test) and the
 * editor's Presets panel. The backend declares which knobs each shot kind has
 * (services/compose.ts); this renders one field per knob, so a new control
 * appears in both places without a change here.
 */

import { useCallback, useEffect, useState } from 'react';
import type { ClipAsset } from '@deep-vision/shared';
import { uploadMedia } from '../services/clips';
import { fetchJson } from '../utils/fetchJson';
import { colors } from '../styles/theme';

export interface EditPreset {
  id: string;
  name: string;
  group: string;
  note?: string;
  filter: string;
}

export interface Control {
  key: string;
  label: string;
  type:
    | 'text' | 'textarea' | 'number' | 'color' | 'bool' | 'select'
    | 'background' | 'sfx' | 'music' | 'font' | 'images';
  options?: string[];
  min?: number;
  max?: number;
  /** images: how many slots this kind takes. */
  count?: number;
}

export interface Composition extends Record<string, unknown> {
  id: string;
  name: string;
  kind: string;
  note?: string;
}

export type PresetValue = string | number | boolean | string[];
export type PresetValues = Record<string, PresetValue>;

export interface ComposeResponse {
  url: string;
  composition: Composition;
  cached: boolean;
  ms: number;
  filter?: string;
  /** Present when the shot was registered in the clip library. */
  asset?: ClipAsset;
}

export interface PresetLibrary {
  presets: EditPreset[];
  compositions: Composition[];
  controls: Record<string, Control[]>;
  backgrounds: string[];
  sfx: string[];
  music: string[];
  fonts: string[];
  error: string;
  reload: () => Promise<void>;
}

/** Loads presets + asset lists once, for whichever surface needs them. */
export function usePresetLibrary(): PresetLibrary {
  const [presets, setPresets] = useState<EditPreset[]>([]);
  const [compositions, setCompositions] = useState<Composition[]>([]);
  const [controls, setControls] = useState<Record<string, Control[]>>({});
  const [backgrounds, setBackgrounds] = useState<string[]>([]);
  const [sfx, setSfx] = useState<string[]>([]);
  const [music, setMusic] = useState<string[]>([]);
  const [fonts, setFonts] = useState<string[]>([]);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    try {
      const data = await fetchJson<{
        presets: EditPreset[];
        compositions: Composition[];
        controls: Record<string, Control[]>;
      }>('/api/editinglab/presets');
      setPresets(data.presets ?? []);
      setCompositions(data.compositions ?? []);
      setControls(data.controls ?? {});
      setError('');
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void reload();
    void fetchJson<{ backgrounds: string[] }>('/api/backgrounds')
      .then((d) => setBackgrounds(d.backgrounds ?? []))
      .catch(() => undefined);
    void fetchJson<{ sfx: string[]; music: string[]; fonts: string[] }>('/api/editinglab/assets')
      .then((d) => {
        setSfx(d.sfx ?? []);
        setMusic(d.music ?? []);
        setFonts(d.fonts ?? []);
      })
      .catch(() => undefined);
  }, [reload]);

  return { presets, compositions, controls, backgrounds, sfx, music, fonts, error, reload };
}

/** Seed a shot's control values from its preset defaults + the chosen source. */
export function seedValues(
  comp: Composition,
  controls: Control[],
  src: string,
  sample = true,
): PresetValues {
  const seeded: PresetValues = {};
  for (const ctl of controls) {
    const v = comp[ctl.key];
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') seeded[ctl.key] = v;
  }
  const slots = controls.find((c) => c.type === 'images')?.count;
  if (slots && src) seeded.images = Array.from({ length: slots }, () => src);
  if (sample && seeded.text === undefined) {
    seeded.text =
      comp.kind === 'article'
        ? 'Type the article text here. Any phrase listed below gets the highlighter, one after another.'
        : comp.kind === 'year'
          ? '1957'
          : comp.kind === 'stat'
            ? '2 KG'
            : 'YOUR CAPTION';
  }
  if (comp.kind === 'article' && seeded.highlight === undefined) seeded.highlight = '';
  return seeded;
}

/**
 * One image slot: pick something already in the library, or upload a file
 * right here. Uploading probes + thumbnails it server-side and hands back an
 * asset, which is reported upward so the picker list stays current.
 */
function ImageSlot({
  index,
  only,
  value,
  clips,
  onChange,
  onAssetAdded,
}: {
  index: number;
  only: boolean;
  value: string;
  clips: ClipAsset[];
  onChange: (path: string) => void;
  onAssetAdded?: (asset: ClipAsset) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const upload = async (file: File) => {
    setBusy(true);
    setErr('');
    try {
      const { asset } = await uploadMedia(file);
      onAssetAdded?.(asset);
      onChange(asset.path);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 0 }}>
          <option value="">{only ? 'pick an image or clip' : `slot ${index + 1} — pick a clip`}</option>
          {clips.map((c) => (
            <option key={c.id} value={c.path}>
              {c.path.split('/').pop()}
            </option>
          ))}
        </select>
        <label
          title="Upload an image or clip for this slot"
          style={{
            ...inputStyle,
            cursor: busy ? 'wait' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            whiteSpace: 'nowrap',
          }}
        >
          {busy ? '…' : '⤒ upload'}
          <input
            type="file"
            accept="image/*,video/*"
            hidden
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = '';
            }}
          />
        </label>
      </div>
      {err && <div style={{ fontSize: 10.5, color: '#ffb3b3' }}>{err}</div>}
    </div>
  );
}

export function ControlField({
  ctl,
  value,
  lib,
  clips,
  onChange,
  onAssetAdded,
}: {
  ctl: Control;
  value: PresetValue | undefined;
  lib: Pick<PresetLibrary, 'backgrounds' | 'sfx' | 'music' | 'fonts'>;
  clips: ClipAsset[];
  onChange: (v: PresetValue) => void;
  /** Called when a slot upload adds a new asset to the library. */
  onAssetAdded?: (asset: ClipAsset) => void;
}) {
  const v = value ?? '';
  const options =
    ctl.type === 'background'
      ? ['', 'self', ...lib.backgrounds]
      : ctl.type === 'sfx'
        ? ['', ...lib.sfx]
        : ctl.type === 'music'
          ? ['', ...lib.music]
          : ctl.type === 'font'
            ? lib.fonts
            : ctl.options ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textMono }}>
        {ctl.label}
      </div>

      {ctl.type === 'textarea' && (
        <textarea
          value={String(v)}
          rows={ctl.key === 'highlight' ? 3 : 6}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.45 }}
        />
      )}
      {ctl.type === 'text' && <input value={String(v)} onChange={(e) => onChange(e.target.value)} style={inputStyle} />}
      {ctl.type === 'number' && (
        <input
          type="number"
          value={typeof v === 'number' ? v : ''}
          min={ctl.min}
          max={ctl.max}
          onChange={(e) => onChange(Number(e.target.value))}
          style={inputStyle}
        />
      )}
      {ctl.type === 'bool' && (
        <input
          type="checkbox"
          checked={Boolean(v)}
          onChange={(e) => onChange(e.target.checked)}
          style={{ width: 16, height: 16, accentColor: colors.accent }}
        />
      )}
      {ctl.type === 'color' && (
        // ffmpeg takes names ("white"), 0xRRGGBB and @alpha, so the text field
        // stays authoritative; the swatch is a shortcut that writes 0xRRGGBB.
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={String(v)} onChange={(e) => onChange(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
          <input
            type="color"
            value={/^0x[0-9a-f]{6}/i.test(String(v)) ? `#${String(v).slice(2, 8)}` : '#ffffff'}
            onChange={(e) => onChange(`0x${e.target.value.slice(1)}`)}
            style={{ width: 34, height: 30, background: colors.control, border: `1px solid ${colors.border9}`, borderRadius: 6 }}
          />
        </div>
      )}
      {ctl.type === 'images' && (
        // One row per slot — this is what makes the 2-up / 3-up shots work.
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {Array.from({ length: ctl.count ?? 2 }, (_, i) => {
            const arr = Array.isArray(value) ? value : [];
            return (
              <ImageSlot
                key={i}
                index={i}
                only={(ctl.count ?? 2) === 1}
                value={arr[i] ?? ''}
                clips={clips}
                onAssetAdded={onAssetAdded}
                onChange={(path) => {
                  const next = [...arr];
                  next[i] = path;
                  onChange(next);
                }}
              />
            );
          })}
        </div>
      )}
      {(ctl.type === 'select' ||
        ctl.type === 'background' ||
        ctl.type === 'sfx' ||
        ctl.type === 'music' ||
        ctl.type === 'font') && (
        <select value={String(v)} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
          {options.map((o) => (
            <option key={o || 'default'} value={o}>
              {o === '' ? 'preset default' : o.includes('/') ? o.split('/').pop() : o}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

export const inputStyle: React.CSSProperties = {
  background: colors.control,
  border: `1px solid ${colors.border9}`,
  color: colors.text,
  borderRadius: 8,
  padding: '6px 8px',
  fontSize: 12,
  fontFamily: 'inherit',
};
