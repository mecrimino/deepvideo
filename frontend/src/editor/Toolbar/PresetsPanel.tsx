/**
 * Presets panel — the editing library inside the editor.
 *
 *   Looks  — a colour/texture filter stamped on the selected clip. It rides on
 *            the clip (`look`) and the exporter appends it at render time.
 *   Shots  — a built graphic (card, article panel, photo scatter, map…) from
 *            your own images. Renders on the gateway, lands in the clip
 *            library, drops on the timeline at the playhead.
 *
 * Controls come from the backend's schema, so new knobs appear here on their
 * own (see components/PresetControls).
 */

import { Loader2, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ControlField,
  inputStyle,
  seedValues,
  usePresetLibrary,
} from '../../components/PresetControls';
import type { Composition, ComposeResponse, PresetValues } from '../../components/PresetControls';
import { fetchJson } from '../../utils/fetchJson';
import { useEditorStore } from '../../stores/useEditorStore';
import { colors } from '../../styles/theme';
import { dragProps } from '../dnd';

export function PresetsPanel() {
  const lib = usePresetLibrary();
  const assets = useEditorStore((s) => s.assets);
  const refreshAssets = useEditorStore((s) => s.refreshAssets);
  const timeline = useEditorStore((s) => s.timeline);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const setClipLook = useEditorStore((s) => s.setClipLook);
  const addComposedAsset = useEditorStore((s) => s.addComposedAsset);
  const updateClipShot = useEditorStore((s) => s.updateClipShot);

  const [tab, setTab] = useState<'looks' | 'shots'>('looks');
  const [activeComp, setActiveComp] = useState<Composition | null>(null);
  const [values, setValues] = useState<PresetValues>({});
  const [preview, setPreview] = useState<ComposeResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void refreshAssets();
  }, [refreshAssets]);

  const clips = useMemo(
    () => Object.values(assets).filter((a) => /\.(mp4|mov|webm|mkv|png|jpe?g|webp)$/i.test(a.path)),
    [assets],
  );

  /** The clip the look would be stamped on, and the look it already carries. */
  const selected = useMemo(() => {
    for (const track of timeline?.tracks ?? []) {
      const clip = track.clips.find((c) => c.id === selectedClipId);
      if (clip) return clip;
    }
    return null;
  }, [timeline, selectedClipId]);

  /** The selected clip when it IS a built shot — the panel then edits it in place. */
  const editing = selected?.shotSpec ? selected : null;

  const compose = useCallback(
    async (comp: Composition, vals: PresetValues, addToTimeline: boolean) => {
      setBusy(true);
      setError('');
      try {
        const res = await fetchJson<ComposeResponse>('/api/editinglab/compose', {
          body: { presetId: comp.id, ...vals, addToLibrary: addToTimeline },
        });
        setPreview(res);
        if (!addToTimeline) return;
        if (!res.asset) return setError('the shot rendered but could not be added to the library');
        const spec = { presetId: comp.id, values: vals };
        // Re-rendering the shot the user already placed replaces its media
        // instead of stacking another copy on the timeline.
        if (editing && editing.shotSpec?.presetId === comp.id) updateClipShot(editing.id, res.asset, spec);
        else addComposedAsset(res.asset, spec);
      } catch (err) {
        setPreview(null);
        setError((err as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [addComposedAsset, updateClipShot, editing],
  );

  // Selecting a built shot (or double-clicking it on the timeline) opens its
  // own recipe here, so it can be customized again and again.
  useEffect(() => {
    const spec = editing?.shotSpec;
    if (!spec || !lib.compositions.length) return;
    const comp = lib.compositions.find((c) => c.id === spec.presetId);
    if (!comp) return;
    setTab('shots');
    setActiveComp(comp);
    setValues(spec.values as PresetValues);
    setPreview(null);
    // Only re-seed when a DIFFERENT shot clip is selected — not on every tweak.
  }, [editing?.id, editing?.shotSpec?.presetId, lib.compositions]);

  const pick = useCallback(
    (comp: Composition) => {
      const ctls = lib.controls[comp.kind] ?? [];
      const first = clips[0]?.path ?? '';
      const seeded = seedValues(comp, ctls, first);
      if (!seeded.images && first) seeded.image = first;
      setActiveComp(comp);
      setValues(seeded);
      setPreview(null);
      void compose(comp, seeded, false);
    },
    [lib.controls, clips, compose],
  );

  const activeControls = activeComp ? lib.controls[activeComp.kind] ?? [] : [];
  const looksByGroup = useMemo(() => {
    const out = new Map<string, typeof lib.presets>();
    for (const p of lib.presets) out.set(p.group, [...(out.get(p.group) ?? []), p]);
    return [...out];
  }, [lib.presets]);

  return (
    <div
      style={{
        width: 260,
        flexShrink: 0,
        borderRight: `1px solid ${colors.border7}`,
        background: colors.bgBar,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <div style={{ padding: '12px 12px 8px', fontSize: 13, fontWeight: 600 }}>Presets</div>

      <div style={{ display: 'flex', gap: 2, margin: '0 12px 10px', background: colors.control, borderRadius: 8, padding: 2 }}>
        {(['looks', 'shots'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1,
              border: 'none',
              cursor: 'pointer',
              borderRadius: 6,
              padding: '5px 0',
              fontSize: 12,
              background: tab === t ? colors.accent : 'transparent',
              color: tab === t ? '#fff' : colors.textDim,
            }}
          >
            {t === 'looks' ? `Looks ${lib.presets.length}` : `Shots ${lib.compositions.length}`}
          </button>
        ))}
      </div>

      {(error || lib.error) && (
        <div style={{ margin: '0 12px 8px', padding: '6px 8px', borderRadius: 8, background: '#2a1113', color: '#ffb3b3', fontSize: 11 }}>
          {error || lib.error}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 12px 12px' }}>
        {tab === 'looks' && (
          <>
            <div style={{ fontSize: 11, color: colors.textFaint, marginBottom: 8 }}>
              {selected
                ? `applies to the selected clip${selected.lookId ? ` · now: ${selected.lookId}` : ''}`
                : 'select a clip on the timeline first'}
            </div>
            {looksByGroup.map(([group, list]) => (
              <section key={group} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.textMono, marginBottom: 5 }}>
                  {group}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {list.map((p) => {
                    const on = selected?.lookId === p.id;
                    return (
                      <button
                        key={p.id}
                        {...dragProps({ k: 'look', id: p.id, filter: p.filter })}
                        title={`${p.name} — drag onto any clip, or click to apply to the selected one`}
                        disabled={!selected}
                        onClick={() =>
                          setClipLook(selected!.id, p.id === 'original' ? null : p.id, p.id === 'original' ? null : p.filter)
                        }
                        style={{
                          textAlign: 'left',
                          padding: '7px 9px',
                          borderRadius: 8,
                          cursor: selected ? 'pointer' : 'not-allowed',
                          opacity: selected ? 1 : 0.5,
                          background: on ? colors.control : colors.card,
                          border: `1px solid ${on ? colors.accent : colors.border7}`,
                          color: colors.text,
                        }}
                      >
                        <div style={{ fontSize: 12.5 }}>{p.name}</div>
                        {p.note && <div style={{ fontSize: 10.5, color: colors.textGhost, marginTop: 1 }}>{p.note}</div>}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </>
        )}

        {tab === 'shots' && !activeComp && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {lib.compositions.map((c) => (
              <button
                key={c.id}
                {...dragProps({ k: 'shot', id: c.id })}
                title={`${c.name} — drag onto a lane (over a clip to use its picture), or click to customize`}
                onClick={() => pick(c)}
                style={{
                  textAlign: 'left',
                  padding: '8px 9px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  background: colors.card,
                  border: `1px solid ${colors.border7}`,
                  color: colors.text,
                }}
              >
                <div style={{ fontSize: 12.5 }}>{c.name}</div>
                {c.note && <div style={{ fontSize: 10.5, color: colors.textGhost, marginTop: 1 }}>{c.note}</div>}
              </button>
            ))}
          </div>
        )}

        {tab === 'shots' && activeComp && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <button
              onClick={() => {
                setActiveComp(null);
                setPreview(null);
              }}
              style={{ ...inputStyle, cursor: 'pointer', textAlign: 'left' }}
            >
              ← all shots
            </button>
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>{activeComp.name}</div>
            {editing?.shotSpec?.presetId === activeComp.id && (
              <div style={{ fontSize: 10.5, color: colors.textGhost, marginTop: -5 }}>
                editing the selected clip — “update clip” re-renders it in place
              </div>
            )}

            <div style={{ aspectRatio: '16 / 9', background: '#000', borderRadius: 8, display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
              {busy && <Loader2 size={18} color={colors.textGhost} style={{ animation: 'spin 1s linear infinite' }} />}
              {!busy && preview && (
                <video key={preview.url} src={preview.url} controls loop autoPlay playsInline style={{ maxWidth: '100%', maxHeight: '100%' }} />
              )}
              {!busy && !preview && <span style={{ fontSize: 11, color: colors.textGhost }}>no preview</span>}
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => void compose(activeComp, values, false)}
                disabled={busy}
                style={{ ...inputStyle, cursor: 'pointer', flex: 1 }}
              >
                {busy ? 'rendering…' : 'preview'}
              </button>
              <button
                className="hv-blue"
                onClick={() => void compose(activeComp, values, true)}
                disabled={busy}
                style={{
                  ...inputStyle,
                  cursor: 'pointer',
                  flex: 1.4,
                  background: colors.accent,
                  borderColor: colors.accent,
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                }}
              >
                <Plus size={13} /> {editing?.shotSpec?.presetId === activeComp.id ? 'update clip' : 'add to timeline'}
              </button>
            </div>

            {activeControls.map((ctl) => (
              <ControlField
                key={ctl.key}
                ctl={ctl}
                value={values[ctl.key]}
                lib={lib}
                clips={clips}
                onAssetAdded={() => void refreshAssets()}
                onChange={(v) => setValues((p) => ({ ...p, [ctl.key]: v }))}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
