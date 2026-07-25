/** Panel 2 — Agent Monitor: task, progress, duration, retries per agent. */

import type { Snapshot } from '../types';
import { Badge, Card, dev, Dot, Empty, statusColor } from '../ui';

function fmtDur(ms: number): string {
  if (!ms) return '—';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function AgentMonitorPanel({ snap }: { snap: Snapshot | null }) {
  const agents = snap?.agents ?? [];
  return (
    <Card title="AGENT MONITOR" right={<span style={{ color: dev.faint, fontSize: 11 }}>{agents.length} active</span>} style={{ height: '100%' }}>
      {agents.length === 0 ? (
        <Empty>No agents have run yet.</Empty>
      ) : (
        <div style={{ overflow: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {agents.map((a) => (
            <div
              key={a.name}
              style={{
                background: dev.raised,
                border: `1px solid ${dev.border}`,
                borderRadius: 8,
                padding: '10px 12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Dot color={statusColor(a.status)} />
                <span style={{ fontWeight: 600, fontSize: 13, color: dev.text }}>{a.name}</span>
                <Badge text={a.status} color={statusColor(a.status)} />
                {a.retries > 0 && <Badge text={`${a.retries} retries`} color={dev.amber} />}
                <span style={{ marginLeft: 'auto', fontFamily: dev.mono, fontSize: 12, color: dev.dim }}>
                  {fmtDur(a.duration_ms)}
                </span>
              </div>
              {a.task && (
                <div style={{ fontSize: 12, color: dev.dim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {a.task}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
