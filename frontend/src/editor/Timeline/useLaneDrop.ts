/**
 * What happens when something is dropped on a timeline lane.
 *
 *   media asset  → placed on that lane at the drop time
 *   repo file    → registered in the library first (shipped sfx, backgrounds)
 *   OS files     → uploaded, then placed
 *
 * Every branch reports through the store's notice line, so a drop that cannot
 * work says why instead of doing nothing.
 */

import { useCallback, useState } from 'react';
import type { ClipAsset } from '@deep-vision/shared';
import { uploadMedia } from '../../services/clips';
import { useEditorStore } from '../../stores/useEditorStore';
import { fetchJson } from '../../utils/fetchJson';
import { isOurDrag, readPayload } from '../dnd';
import type { DragPayload } from '../dnd';

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

async function handleDrop(
  payload: DragPayload | null,
  files: File[],
  trackId: string,
  sec: number,
): Promise<void> {
  if (files.length) return dropFiles(files, trackId, sec);
  if (!payload) return;

  if (payload.k === 'asset') return store().addAssetAt(payload.id, trackId, sec);

  if (payload.k === 'path') {
    const { asset } = await fetchJson<{ asset: ClipAsset }>('/api/clips/register', {
      body: { path: payload.path },
    });
    store().registerAsset(asset);
    return store().addAssetAt(asset.id, trackId, sec);
  }
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
