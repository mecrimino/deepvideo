/** Panel 3 — Event Stream: chronological events, filter by agent + search. */

import { useMemo } from 'react';
import { useDevStore } from '../useDevStore';
import type { Snapshot } from '../types';
import { Card, dev, Empty } from '../ui';

export function EventStreamPanel({ snap }: { snap: Snapshot | null }) {
  const events = snap?.events ?? [];
  const agentFilter = useDevStore((s) => s.eventAgentFilter);
  const query = useDevStore((s) => s.eventQuery);
  const setAgent = useDevStore((s) => s.setEventAgentFilter);
  const setQuery = useDevStore((s) => s.setEventQuery);

  const agents = useMemo(() => {
    const set = new Set<string>();
    for (const e of events) set.add(e.name.split('.')[0]);
    return ['', ...Array.from(set).sort()];
  }, [events]);

  const filtered = events.filter((e) => {
    if (agentFilter && !e.name.startsWith(agentFilter + '.') && e.name.split('.')[0] !== agentFilter)
      return false;
    if (query && !e.name.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  return (
    <Card
      title="EVENT STREAM"
      right={
        <div style={{ display: 'flex', gap: 6 }}>
          <select
            value={agentFilter}
            onChange={(e) => setAgent(e.target.value)}
            style={inputStyle}
          >
            {agents.map((a) => (
              <option key={a} value={a}>
                {a || 'all agents'}
              </option>
            ))}
          </select>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="search…"
            style={{ ...inputStyle, width: 120 }}
          />
        </div>
      }
      style={{ height: '100%' }}
    >
      {filtered.length === 0 ? (
        <Empty>No events{events.length ? ' match the filter.' : ' yet.'}</Empty>
      ) : (
        <div style={{ overflow: 'auto', flex: 1, fontFamily: dev.mono, fontSize: 12 }}>
          {filtered.map((e, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: 10,
                padding: '5px 4px',
                borderBottom: `1px solid ${dev.border}`,
              }}
            >
              <span style={{ color: dev.faint, flexShrink: 0 }}>{e.at?.slice(11, 19)}</span>
              <span style={{ color: dev.accent, flexShrink: 0 }}>{e.name}</span>
              <span style={{ color: dev.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {payloadPreview(e.payload)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function payloadPreview(p: Record<string, unknown>): string {
  const keys = Object.keys(p || {});
  if (!keys.length) return '';
  return keys.map((k) => `${k}=${short(p[k])}`).join(' ');
}
function short(v: unknown): string {
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.length > 40 ? s.slice(0, 39) + '…' : s;
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
