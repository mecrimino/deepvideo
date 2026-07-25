/** Panel 4 — Logs: structured Loguru lines (live via WS), level + search, download. */

import { useDevStore } from '../useDevStore';
import type { Snapshot } from '../types';
import { Card, dev, Empty } from '../ui';

const LEVELS = ['ALL', 'DEBUG', 'INFO', 'WARNING', 'ERROR'];

function levelColor(l: string): string {
  if (l === 'ERROR') return dev.red;
  if (l === 'WARNING') return dev.amber;
  if (l === 'DEBUG') return dev.faint;
  return dev.green;
}

export function LogsPanel({ snap }: { snap: Snapshot | null }) {
  const logs = snap?.logs ?? [];
  const level = useDevStore((s) => s.logLevel);
  const query = useDevStore((s) => s.logQuery);
  const setLevel = useDevStore((s) => s.setLogLevel);
  const setQuery = useDevStore((s) => s.setLogQuery);
  const download = useDevStore((s) => s.downloadLogs);

  const filtered = logs.filter((l) => {
    if (level !== 'ALL' && l.level !== level) return false;
    if (query && !l.message.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  return (
    <Card
      title="LOGS"
      right={
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <select value={level} onChange={(e) => setLevel(e.target.value)} style={inputStyle}>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="search…"
            style={{ ...inputStyle, width: 110 }}
          />
          <button onClick={download} style={btnStyle}>
            ↓ log
          </button>
        </div>
      }
      style={{ height: '100%' }}
    >
      {filtered.length === 0 ? (
        <Empty>No log lines{logs.length ? ' match the filter.' : ' yet.'}</Empty>
      ) : (
        <div style={{ overflow: 'auto', flex: 1, fontFamily: dev.mono, fontSize: 12 }}>
          {filtered.map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, padding: '3px 4px' }}>
              <span style={{ color: dev.faint, flexShrink: 0 }}>{l.at}</span>
              <span style={{ color: levelColor(l.level), width: 58, flexShrink: 0 }}>{l.level}</span>
              <span style={{ color: dev.dim, width: 70, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {l.name}
              </span>
              <span style={{ color: dev.text, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{l.message}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

const inputStyle: React.CSSProperties = {
  background: dev.bg,
  color: dev.text,
  border: `1px solid ${dev.border2}`,
  borderRadius: 6,
  padding: '3px 7px',
  fontSize: 11,
  outline: 'none',
};
const btnStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
};
