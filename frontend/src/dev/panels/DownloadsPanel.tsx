/** Panel 9 — Asset Downloads: in-flight downloads, speed, remaining bytes. */

import type { Snapshot } from '../types';
import { Bar, Card, dev, Empty } from '../ui';

function fmtKb(kb: number): string {
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb.toFixed(0)} KB`;
}
function fmtSpeed(kbps: number): string {
  return kbps >= 1024 ? `${(kbps / 1024).toFixed(1)} MB/s` : `${kbps.toFixed(0)} KB/s`;
}

export function DownloadsPanel({ snap }: { snap: Snapshot | null }) {
  const dls = snap?.downloads ?? [];
  return (
    <Card
      title="ASSET DOWNLOADS"
      right={<span style={{ color: dev.faint, fontSize: 11 }}>{dls.length} active</span>}
      style={{ height: '100%' }}
    >
      {dls.length === 0 ? (
        <Empty>No downloads in flight.</Empty>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto', flex: 1 }}>
          {dls.map((d) => (
            <div key={d.name}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, gap: 10 }}>
                <span
                  style={{
                    fontSize: 12,
                    color: dev.text,
                    fontFamily: dev.mono,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {d.name}
                </span>
                <span style={{ fontSize: 11.5, color: dev.dim, flexShrink: 0 }}>
                  {fmtSpeed(d.speed_kbps)} · {fmtKb(d.remaining_kb)} left
                </span>
              </div>
              <Bar pct={d.pct} color={dev.accent} />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
