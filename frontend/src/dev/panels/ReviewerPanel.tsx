/** Panel 10 — Reviewer: quality score, failed checks, suggested fixes. */

import type { Snapshot } from '../types';
import { Badge, Bar, Card, dev, Empty, Stat } from '../ui';

function scoreColor(s: number): string {
  if (s >= 0.8) return dev.green;
  if (s >= 0.6) return dev.amber;
  return dev.red;
}

export function ReviewerPanel({ snap }: { snap: Snapshot | null }) {
  const r = snap?.review;
  if (!r || (r.score == null && !(r.failed_checks?.length))) return <Empty>No review has run yet.</Empty>;

  const score = r.score ?? 0;
  const cats = r.category_scores ?? {};

  return (
    <Card title="REVIEWER" style={{ height: '100%' }}>
      <div style={{ display: 'flex', gap: 22, alignItems: 'center', marginBottom: 16 }}>
        <Stat
          label="Overall score"
          value={`${(score * 100).toFixed(0)}%`}
          color={scoreColor(score)}
        />
        {r.passed != null && (
          <Badge text={r.passed ? 'passed' : 'needs work'} color={r.passed ? dev.green : dev.red} />
        )}
      </div>

      {Object.keys(cats).length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 16 }}>
          {Object.entries(cats).map(([k, v]) => (
            <div key={k}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: dev.text }}>{k}</span>
                <span style={{ fontSize: 12, color: dev.dim, fontFamily: dev.mono }}>
                  {(v * 100).toFixed(0)}%
                </span>
              </div>
              <Bar pct={v * 100} color={scoreColor(v)} />
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 11, color: dev.faint, marginBottom: 6 }}>FAILED CHECKS / FIXES</div>
      {r.failed_checks && r.failed_checks.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto', flex: 1 }}>
          {r.failed_checks.map((c, i) => (
            <div
              key={i}
              style={{
                fontSize: 12,
                color: dev.text,
                background: dev.raised,
                border: `1px solid ${dev.border}`,
                borderLeft: `3px solid ${dev.amber}`,
                borderRadius: 6,
                padding: '7px 10px',
              }}
            >
              {c}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: dev.green }}>All checks passed.</div>
      )}
    </Card>
  );
}
