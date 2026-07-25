/** Panel 6 — Project State: workflow state, active scene, checkpoint, queue. */

import type { Snapshot } from '../types';
import { Badge, Card, dev, Empty, Stat, statusColor } from '../ui';

export function ProjectStatePanel({ snap }: { snap: Snapshot | null }) {
  const p = snap?.project;
  if (!p) return <Empty>No project state.</Empty>;

  const statusHue =
    p.status === 'running'
      ? dev.accent
      : p.status === 'done'
        ? dev.green
        : p.status === 'failed'
          ? dev.red
          : dev.faint;

  return (
    <Card title="PROJECT STATE" style={{ height: '100%' }}>
      <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', marginBottom: 14 }}>
        <Stat label="Status" value={<Badge text={p.status} color={statusHue} />} />
        <Stat label="Workflow state" value={<span style={{ fontSize: 15 }}>{p.state}</span>} color={statusColor(p.state)} />
        <Stat label="Queue" value={p.queue} sub="running runs" />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Row k="Run ID" v={p.run_id ?? '—'} mono />
        <Row k="Current stage" v={p.stage ?? '—'} />
        <Row k="Active scene" v={p.active_scene ?? '—'} />
        <Row k="Last checkpoint" v={checkpointLabel(p.checkpoint)} mono />
      </div>
    </Card>
  );
}

function checkpointLabel(cp: unknown): string {
  if (cp == null) return '—';
  if (typeof cp === 'string') return cp;
  if (typeof cp === 'object') {
    const o = cp as Record<string, unknown>;
    return String(o.name ?? o.id ?? JSON.stringify(o).slice(0, 40));
  }
  return String(cp);
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        padding: '8px 0',
        borderBottom: `1px solid ${dev.border}`,
      }}
    >
      <span style={{ color: dev.faint, fontSize: 12 }}>{k}</span>
      <span
        style={{
          color: dev.text,
          fontSize: 12.5,
          fontFamily: mono ? dev.mono : undefined,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: '65%',
        }}
      >
        {v}
      </span>
    </div>
  );
}
