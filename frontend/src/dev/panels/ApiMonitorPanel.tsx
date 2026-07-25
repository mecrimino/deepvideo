/** Panel 5 — API Monitor: requests, response times, rate-limits, failures, cost. */

import type { Snapshot } from '../types';
import { Badge, Card, dev, Empty, Stat } from '../ui';

function statusColorFor(code: number, ok: boolean): string {
  if (code === 429) return dev.amber;
  if (!ok || code >= 400 || code === 0) return dev.red;
  return dev.green;
}

export function ApiMonitorPanel({ snap }: { snap: Snapshot | null }) {
  const providers = snap?.api.providers ?? {};
  const recent = snap?.api.recent ?? [];
  const llm = snap?.llm;
  const names = Object.keys(providers);

  const totalReq = names.reduce((s, n) => s + providers[n].requests, 0);
  const totalFail = names.reduce((s, n) => s + providers[n].failures, 0);

  const limits = snap?.rate_limits ?? [];
  const now = Date.now() / 1000;

  return (
    <Card title="API MONITOR" style={{ height: '100%' }}>
      {limits.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 }}>
          {limits.slice(0, 4).map((l, i) => {
            const active = l.until > now;
            const left = Math.max(0, Math.round(l.until - now));
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 11.5,
                  padding: '6px 9px',
                  borderRadius: 7,
                  background: active ? 'rgba(255,179,64,.12)' : dev.raised,
                  border: `1px solid ${active ? dev.amber + '66' : dev.border}`,
                  color: active ? dev.amber : dev.dim,
                }}
              >
                <Badge text="RATE LIMIT" color={dev.amber} />
                <span style={{ fontFamily: dev.mono }}>{l.provider}</span>
                <span style={{ marginLeft: 'auto' }}>
                  {active ? `waiting ${left}s, then retrying` : `waited ${l.wait_sec}s · ${l.at.slice(11, 19)}`}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <div style={{ display: 'flex', gap: 22, marginBottom: 12, flexWrap: 'wrap' }}>
        <Stat label="Requests" value={totalReq} />
        <Stat label="Failures" value={totalFail} color={totalFail ? dev.red : dev.text} />
        <Stat label="LLM tokens" value={(llm?.total_tokens ?? 0).toLocaleString()} />
        <Stat label="Est. cost" value={`$${(llm?.total_cost ?? 0).toFixed(3)}`} />
      </div>

      {names.length === 0 ? (
        <Empty>No API calls recorded yet.</Empty>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {names.map((n) => {
            const p = providers[n];
            const failRate = p.requests ? (p.failures / p.requests) * 100 : 0;
            return (
              <div
                key={n}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.1fr .7fr .7fr .7fr .8fr',
                  gap: 8,
                  alignItems: 'center',
                  background: dev.raised,
                  border: `1px solid ${dev.border}`,
                  borderRadius: 8,
                  padding: '8px 10px',
                  fontSize: 12,
                }}
              >
                <span style={{ fontWeight: 600, color: dev.text, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {n}
                </span>
                <span style={{ color: dev.dim, fontFamily: dev.mono }}>{p.requests} req</span>
                <span style={{ color: dev.dim, fontFamily: dev.mono }}>{p.avg_ms} ms</span>
                <span style={{ color: failRate ? dev.red : dev.dim, fontFamily: dev.mono }}>
                  {failRate.toFixed(0)}% fail
                </span>
                <span style={{ color: dev.dim, fontFamily: dev.mono }}>
                  {p.tokens ? `${p.tokens.toLocaleString()} tok` : '—'}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ fontSize: 11, color: dev.faint, marginBottom: 6 }}>RECENT CALLS</div>
      <div style={{ overflow: 'auto', flex: 1, fontFamily: dev.mono, fontSize: 11.5 }}>
        {recent.length === 0 ? (
          <Empty>—</Empty>
        ) : (
          recent.map((c, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, padding: '3px 2px', alignItems: 'center' }}>
              <Badge text={String(c.status || 'ERR')} color={statusColorFor(c.status, c.ok)} />
              <span style={{ color: dev.dim, width: 44 }}>{c.method}</span>
              <span style={{ color: dev.text, width: 90, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {c.provider}
              </span>
              <span style={{ color: dev.faint, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.url}
              </span>
              <span style={{ color: dev.dim }}>{c.ms} ms</span>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
