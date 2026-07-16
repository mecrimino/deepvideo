/** The user's channel/brand name — persisted locally, editable from Home. */

const KEY = 'deepvideo.channel';
const DEFAULT_NAME = 'Amish channel1';

const listeners = new Set<() => void>();

export function getChannelName(): string {
  return localStorage.getItem(KEY) ?? DEFAULT_NAME;
}

export function setChannelName(name: string): void {
  localStorage.setItem(KEY, name.trim() || DEFAULT_NAME);
  listeners.forEach((l) => l());
}

export function subscribeChannel(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
