/** Panel 8 — Timeline Progress: scenes completed / remaining, render progress. */

import type { Snapshot } from '../types';
import { Bar, Card, dev, Empty, Stat } from '../ui';

export function TimelineProgressPanel({ snap }: { snap: Snapshot | null }) {
  const t = snap?.timeline;
  if (!t) return <Empty>No timeline yet.</Empty>;

  const total = t.scenes_total || 0;
  const done = t.scenes_done || 0;
  const remaining = Math.max(0, total - done);
  const scenePct = total ? (done / total) * 100 : 0;

  return (
    <Card title="TIMELINE PROGRESS" style={{ height: '100%' }}>
      <div style={{ display: 'flex', gap: 24, marginBottom: 16, flexWrap: 'wrap' }}>
        <Stat label="Scenes done" value={done} color={dev.green} />
        <Stat label="Remaining" value={remaining} color={remaining ? dev.amber : dev.text} />
        <Stat label="Total" value={total} />
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
          <span style={{ fontSize: 12, color: dev.text, fontWeight: 600 }}>Scenes matched</span>
          <span style={{ fontSize: 12, color: dev.dim, fontFamily: dev.mono }}>{scenePct.toFixed(0)}%</span>
        </div>
        <Bar pct={scenePct} color={dev.green} />
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
          <span style={{ fontSize: 12, color: dev.text, fontWeight: 600 }}>Render</span>
          <span style={{ fontSize: 12, color: dev.dim, fontFamily: dev.mono }}>{t.render_pct.toFixed(0)}%</span>
        </div>
        <Bar pct={t.render_pct} color={dev.accent} />
      </div>

      {total > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 18 }}>
          {Array.from({ length: total }).map((_, i) => (
            <div
              key={i}
              title={`scene ${i + 1}`}
              style={{
                width: 18,
                height: 18,
                borderRadius: 4,
                background: i < done ? dev.green : dev.raised,
                border: `1px solid ${i < done ? dev.green : dev.border}`,
              }}
            />
          ))}
        </div>
      )}
    </Card>
  );
}
