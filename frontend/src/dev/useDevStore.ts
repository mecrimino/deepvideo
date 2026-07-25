/**
 * Developer Dashboard state (Zustand). Holds the single live `Snapshot` pushed
 * by the core `/dev/ws` WebSocket (~1 Hz), the structured log buffer, and the
 * panel/open UI state. Every field is REAL telemetry — nothing is synthesised.
 */

import { create } from 'zustand';
import type { Snapshot } from './types';

export type ConnState = 'connecting' | 'open' | 'closed';

function wsUrl(runId: string | null): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const q = runId ? `?run=${encodeURIComponent(runId)}` : '';
  return `${proto}://${window.location.host}/dev/ws${q}`;
}

interface DevState {
  open: boolean;
  conn: ConnState;
  snapshot: Snapshot | null;
  /** Selected project (run id) — null shows system-only data. */
  runId: string | null;
  logLevel: string;
  logQuery: string;
  eventAgentFilter: string;
  eventQuery: string;

  _sock: WebSocket | null;
  _retry: number | null;

  openDashboard: () => void;
  closeDashboard: () => void;
  toggleDashboard: () => void;
  setRunId: (id: string | null) => void;
  setLogLevel: (l: string) => void;
  setLogQuery: (q: string) => void;
  setEventAgentFilter: (a: string) => void;
  setEventQuery: (q: string) => void;
  downloadLogs: () => void;
  connect: () => void;
  disconnect: () => void;
}

export const useDevStore = create<DevState>((set, get) => ({
  open: false,
  conn: 'closed',
  snapshot: null,
  runId: null,
  logLevel: 'ALL',
  logQuery: '',
  eventAgentFilter: '',
  eventQuery: '',
  _sock: null,
  _retry: null,

  openDashboard: () => {
    set({ open: true });
    get().connect();
  },
  closeDashboard: () => {
    set({ open: false });
    get().disconnect();
  },
  toggleDashboard: () => (get().open ? get().closeDashboard() : get().openDashboard()),
  setRunId: (runId) => {
    // reconnect the WS so the server scopes the stream to this project
    get().disconnect();
    set({ runId });
    get().connect();
  },
  setLogLevel: (logLevel) => set({ logLevel }),
  setLogQuery: (logQuery) => set({ logQuery }),
  setEventAgentFilter: (eventAgentFilter) => set({ eventAgentFilter }),
  setEventQuery: (eventQuery) => set({ eventQuery }),

  downloadLogs: () => {
    const a = document.createElement('a');
    a.href = '/dev/logs/download';
    a.download = 'deep-vision-core.log';
    document.body.appendChild(a);
    a.click();
    a.remove();
  },

  connect: () => {
    if (get()._sock) return;
    set({ conn: 'connecting' });
    let sock: WebSocket;
    try {
      sock = new WebSocket(wsUrl(get().runId));
    } catch {
      set({ conn: 'closed' });
      return;
    }
    sock.onopen = () => set({ conn: 'open' });
    sock.onmessage = (ev) => {
      try {
        const snap = JSON.parse(ev.data) as Snapshot;
        set({ snapshot: snap });
      } catch {
        /* ignore malformed frame */
      }
    };
    sock.onclose = () => {
      set({ conn: 'closed', _sock: null });
      // auto-reconnect while the dashboard stays open
      if (get().open) {
        const retry = window.setTimeout(() => get().connect(), 1500);
        set({ _retry: retry });
      }
    };
    sock.onerror = () => sock.close();
    set({ _sock: sock });
  },

  disconnect: () => {
    const { _sock, _retry } = get();
    if (_retry) window.clearTimeout(_retry);
    if (_sock) {
      _sock.onclose = null;
      _sock.close();
    }
    set({ _sock: null, _retry: null, conn: 'closed' });
  },
}));
