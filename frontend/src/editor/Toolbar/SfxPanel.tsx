/**
 * Sound panel: every sound effect and music bed shipped in `assets/`, plus the
 * audio already uploaded to the clip library. Preview with the play button,
 * drag any row onto an audio lane — a shipped file is taken into the library
 * on drop (POST /api/clips/register), so the timeline can reference it by id.
 */

import { Loader2, Music, Pause, Play, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ClipAsset } from '@deep-vision/shared';
import { uploadMedia } from '../../services/clips';
import { fileUrl, isAudioAsset, useEditorStore } from '../../stores/useEditorStore';
import { colors } from '../../styles/theme';
import { fetchJson } from '../../utils/fetchJson';
import { formatDuration } from '../../utils/format';
import { dragProps } from '../dnd';

/** A library asset, or a file shipped in assets/ that is not in the library. */
type SoundRef = { k: 'asset'; id: string } | { k: 'path'; path: string };

interface Sound {
  key: string;
  name: string;
  url: string;
  group: string;
  payload: SoundRef;
  durationSec?: number;
}

export function SfxPanel() {
  const assets = useEditorStore((s) => s.assets);
  const refreshAssets = useEditorStore((s) => s.refreshAssets);
  const addAssetAt = useEditorStore((s) => s.addAssetAt);
  const playheadSec = useEditorStore((s) => s.playheadSec);
  const setNotice = useEditorStore((s) => s.setNotice);
  const registerAsset = useEditorStore((s) => s.registerAsset);

  const [shipped, setShipped] = useState<{ sfx: string[]; music: string[] }>({ sfx: [], music: [] });
  const [filter, setFilter] = useState('');
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void fetchJson<{ sfx: string[]; music: string[] }>('/api/editinglab/assets')
      .then((d) => setShipped({ sfx: d.sfx ?? [], music: d.music ?? [] }))
      .catch(() => undefined);
    void refreshAssets();
  }, [refreshAssets]);

  const sounds = useMemo<Sound[]>(() => {
    const library: Sound[] = Object.values(assets)
      .filter(isAudioAsset)
      .map((a) => ({
        key: a.id,
        name: a.path.split('/').pop() ?? a.path,
        url: fileUrl(a.path),
        group: 'my uploads',
        durationSec: a.durationSec,
        payload: { k: 'asset', id: a.id },
      }));
    // assets/music is often empty and the endpoint pads it with the sfx list —
    // dedupe on the path so nothing shows up twice.
    const seen = new Set(shipped.sfx);
    const files: Sound[] = [
      ...shipped.sfx.map((p) => ({ path: p, group: 'sound effects' })),
      ...shipped.music.filter((p) => !seen.has(p)).map((p) => ({ path: p, group: 'music' })),
    ].map(({ path, group }) => ({
      key: path,
      name: path.split('/').pop() ?? path,
      url: fileUrl(path),
      group,
      payload: { k: 'path', path } as SoundRef,
    }));
    const q = filter.trim().toLowerCase();
    return [...library, ...files].filter((s) => !q || s.name.toLowerCase().includes(q));
  }, [assets, shipped, filter]);

  const groups = useMemo(() => {
    const out = new Map<string, Sound[]>();
    for (const s of sounds) out.set(s.group, [...(out.get(s.group) ?? []), s]);
    return [...out];
  }, [sounds]);

  const toggle = (s: Sound) => {
    const el = audioRef.current;
    if (!el) return;
    if (playingKey === s.key) {
      el.pause();
      setPlayingKey(null);
      return;
    }
    el.src = s.url;
    void el.play().catch(() => setPlayingKey(null));
    setPlayingKey(s.key);
  };

  /** Put a sound on the first audio lane at the playhead (the click path). */
  const place = async (s: Sound) => {
    try {
      if (s.payload.k === 'asset') return addAssetAt(s.payload.id, null, playheadSec);
      const { asset } = await fetchJson<{ asset: ClipAsset }>('/api/clips/register', {
        body: { path: s.payload.path },
      });
      registerAsset(asset);
      addAssetAt(asset.id, null, playheadSec);
      setNotice(`${s.name} added`);
    } catch (err) {
      setNotice((err as Error).message, true);
    }
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) {
        const { asset } = await uploadMedia(f);
        registerAsset(asset);
      }
      await refreshAssets();
    } catch (err) {
      setNotice((err as Error).message, true);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div
      style={{
        width: 240,
        flexShrink: 0,
        borderRight: `1px solid ${colors.border7}`,
        background: colors.bgBar,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <div style={{ padding: '12px 12px 8px', fontSize: 13, fontWeight: 600 }}>Sound</div>

      <div style={{ padding: '0 12px 8px', display: 'flex', gap: 6 }}>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="search sounds"
          style={{
            flex: 1,
            minWidth: 0,
            background: colors.control,
            border: `1px solid ${colors.border9}`,
            color: colors.text,
            borderRadius: 8,
            padding: '6px 8px',
            fontSize: 12,
            fontFamily: 'inherit',
          }}
        />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          title="Upload your own audio"
          style={{
            width: 30,
            display: 'grid',
            placeItems: 'center',
            background: colors.control,
            border: `1px solid ${colors.border9}`,
            borderRadius: 8,
            color: colors.textDim,
            cursor: 'pointer',
          }}
        >
          {busy ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={13} />}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => void upload(e.target.files)}
        />
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 12px 12px' }}>
        {sounds.length === 0 && (
          <div style={{ fontSize: 11.5, color: colors.textGhost, lineHeight: 1.5 }}>
            No sounds found. Drop files into <code>assets/sfx</code> or upload your own.
          </div>
        )}
        {groups.map(([group, list]) => (
          <section key={group} style={{ marginBottom: 12 }}>
            <div
              style={{
                fontSize: 10,
                letterSpacing: 1.2,
                textTransform: 'uppercase',
                color: colors.textMono,
                marginBottom: 5,
              }}
            >
              {group} ({list.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {list.map((s) => (
                <div
                  key={s.key}
                  {...dragProps(s.payload)}
                  onDoubleClick={() => void place(s)}
                  title={`${s.name} — drag onto an audio lane, or double-click to add at the playhead`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '5px 7px',
                    borderRadius: 7,
                    background: colors.card,
                    border: `1px solid ${playingKey === s.key ? colors.accent : colors.border7}`,
                    cursor: 'grab',
                  }}
                >
                  <button
                    onClick={() => toggle(s)}
                    style={{
                      width: 18,
                      height: 18,
                      flexShrink: 0,
                      display: 'grid',
                      placeItems: 'center',
                      borderRadius: 5,
                      border: 'none',
                      background: 'rgba(255,255,255,.07)',
                      color: colors.textDim,
                      cursor: 'pointer',
                    }}
                  >
                    {playingKey === s.key ? <Pause size={10} /> : <Play size={10} />}
                  </button>
                  <Music size={10} color={colors.textGhost} style={{ flexShrink: 0 }} />
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 11,
                      color: colors.textDim,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {s.name}
                  </span>
                  {s.durationSec ? (
                    <span style={{ fontSize: 9.5, color: colors.textGhost }}>{formatDuration(s.durationSec)}</span>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <audio ref={audioRef} onEnded={() => setPlayingKey(null)} />
    </div>
  );
}
