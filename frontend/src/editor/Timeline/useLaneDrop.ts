/**
 * What happens when something is dropped on a timeline lane.
 *
 *   media asset  → placed on that lane at the drop time
 *   repo file    → registered in the library first (shipped sfx, backgrounds)
 *   OS files     → uploaded, then placed
 *   look preset  → stamped on the clip under the pointer
 *   shot preset  → composed on the gateway (using the clip under the pointer as
 *                  its picture when it needs one) and inserted
 *
 * Every branch reports through the store's notice line, so a drop that cannot
 * work says why instead of doing nothing.
 */

import { useCallback, useState } from 'react';
import type { ClipAsset } from '@deep-vision/shared';
import { seedValues } from '../../components/PresetControls';
import type { Composition, ComposeResponse, Control, PresetValues } from '../../components/PresetControls';
import { uploadMedia } from '../../services/clips';
import { clipOnTrackAt, isAudioAsset, useEditorStore } from '../../stores/useEditorStore';
import { fetchJson } from '../../utils/fetchJson';
import { isOurDrag, readPayload } from '../dnd';
import type { DragPayload } from '../dnd';

const VISUAL_RE = /\.(mp4|mov|webm|mkv|png|jpe?g|webp)$/i;

/** The shot library, fetched once and shared by every lane. */
let libraryOnce: Promise<{ compositions: Composition[]; controls: Record<string, Control[]> }> | null = null;
function presetLibrary() {
  libraryOnce ??= fetchJson('/api/editinglab/presets');
  return libraryOnce;
}

const store = () => useEditorStore.getState();

async function dropFiles(files: File[], trackId: string, sec: number): Promise<void> {
  store().setNotice(`uploading ${files.length} file${files.length > 1 ? 's' : ''}…`);
  let at = sec;
  for (const file of files) {
    const { asset } = await uploadMedia(file);
    store().registerAsset(asset);
    store().addAssetAt(asset.id, trackId, at);
    at += asset.durationSec > 0 ? asset.durationSec : 4;
  }
  store().setNotice(`added ${files.length} file${files.length > 1 ? 's' : ''}`);
}

async function dropShot(presetId: string, trackId: string, sec: number): Promise<void> {
  const { compositions, controls } = await presetLibrary();
  const comp = compositions.find((c) => c.id === presetId);
  if (!comp) throw new Error(`unknown shot: ${presetId}`);

  // The clip you dropped onto supplies the picture the shot is built from;
  // failing that, the first still/footage in the library.
  const s = store();
  const under = clipOnTrackAt(s.timeline, trackId, sec);
  const underAsset = under?.source.kind === 'asset' ? s.assets[under.source.assetId] : undefined;
  const picture =
    (underAsset && !isAudioAsset(underAsset) ? underAsset.path : '') ||
    Object.values(s.assets).find((a) => VISUAL_RE.test(a.path))?.path ||
    '';

  const values: PresetValues = seedValues(comp, controls[comp.kind] ?? [], picture);
  if (!values.images && picture) values.image = picture;

  s.setNotice(`building “${comp.name}”…`);
  const res = await fetchJson<ComposeResponse>('/api/editinglab/compose', {
    body: { presetId: comp.id, ...values, addToLibrary: true },
  });
  if (!res.asset) throw new Error('the shot rendered but could not be added to the library');
  store().addComposedAsset(res.asset, { presetId: comp.id, values }, { trackId, startSec: sec });
  store().setNotice(`${comp.name} added — open the Presets panel to customize it`);
}

async function handleDrop(
  payload: DragPayload | null,
  files: File[],
  trackId: string,
  sec: number,
): Promise<void> {
  if (files.length) return dropFiles(files, trackId, sec);
  if (!payload) return;

  if (payload.k === 'look') {
    const clip = clipOnTrackAt(store().timeline, trackId, sec);
    if (!clip) return store().setNotice('drop a look onto a clip, not an empty lane', true);
    const off = payload.id === 'original';
    store().setClipLook(clip.id, off ? null : payload.id, off ? null : payload.filter);
    store().selectClip(clip.id);
    return store().setNotice(off ? 'look cleared' : `${payload.id} applied`);
  }

  if (payload.k === 'asset') return store().addAssetAt(payload.id, trackId, sec);

  if (payload.k === 'path') {
    const { asset } = await fetchJson<{ asset: ClipAsset }>('/api/clips/register', {
      body: { path: payload.path },
    });
    store().registerAsset(asset);
    return store().addAssetAt(asset.id, trackId, sec);
  }

  return dropShot(payload.id, trackId, sec);
}

/** Drop handlers plus the highlight flag, for one lane. */
export function useLaneDrop(trackId: string): {
  over: boolean;
  dropProps: {
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: () => void;
    onDrop: (e: React.DragEvent) => void;
  };
} {
  const [over, setOver] = useState(false);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      if (!isOurDrag(e)) return;
      e.preventDefault();
      setOver(false);
      // The event is recycled the moment this handler returns — read
      // everything the async work needs first.
      const rect = e.currentTarget.getBoundingClientRect();
      const sec = Math.max(0, (e.clientX - rect.left) / store().pxPerSec);
      const payload = readPayload(e);
      const files = Array.from(e.dataTransfer.files);
      const lane = store().timeline?.tracks.find((t) => t.id === trackId);
      if (lane?.locked) return store().setNotice(`${lane.name} is locked`, true);
      void handleDrop(payload, files, trackId, sec)
        .catch((err: Error) => store().setNotice(err.message, true))
        .finally(() => void store().refreshAssets());
    },
    [trackId],
  );

  return {
    over,
    dropProps: {
      onDragOver: (e) => {
        if (!isOurDrag(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop,
    },
  };
}
