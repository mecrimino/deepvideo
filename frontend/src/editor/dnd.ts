/**
 * One drag channel for the whole editor. Every panel hands the timeline the
 * same shape of payload, so a new drag source only has to call `dragProps`.
 *
 * The payload rides on a private mime type: during `dragover` the browser
 * hides the DATA but still exposes the TYPES, which is enough to decide
 * whether a lane accepts the drop.
 */

const MIME = 'application/x-deepvideo';

export type DragPayload =
  /** An asset already in the clip library. */
  | { k: 'asset'; id: string }
  /** A repo file that is not in the library yet (a shipped sfx, a background). */
  | { k: 'path'; path: string }
  /** A look preset — drop it on a clip to stamp its filter on. */
  | { k: 'look'; id: string; filter: string }
  /** A composition preset — drop it on a lane to build and insert the shot. */
  | { k: 'shot'; id: string };

/** Spread onto any element to make it a drag source. */
export function dragProps(payload: DragPayload): {
  draggable: true;
  onDragStart: (e: React.DragEvent) => void;
} {
  return {
    draggable: true,
    onDragStart: (e) => {
      e.dataTransfer.setData(MIME, JSON.stringify(payload));
      e.dataTransfer.effectAllowed = 'copy';
    },
  };
}

/** True while a drag the timeline understands is in flight (files included). */
export function isOurDrag(e: React.DragEvent): boolean {
  return e.dataTransfer.types.includes(MIME) || e.dataTransfer.types.includes('Files');
}

export function readPayload(e: React.DragEvent): DragPayload | null {
  const raw = e.dataTransfer.getData(MIME);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DragPayload;
  } catch {
    return null;
  }
}
