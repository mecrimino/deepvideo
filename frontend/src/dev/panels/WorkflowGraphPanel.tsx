/** Panel 1 — Live Workflow Graph: real pipeline stages with durations, a pulsing
 * running node, and animated flow along active edges. */

import { useMemo } from 'react';
import type { Snapshot } from '../types';
import { Badge, Card, dev, Empty, statusColor } from '../ui';

const NODE_W = 140;
const NODE_H = 56;

function fmtMs(ms?: number): string {
  if (!ms) return '';
  return ms < 1000 ? `${ms} ms` : ms < 60_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

export function WorkflowGraphPanel({ snap }: { snap: Snapshot | null }) {
  const graph = snap?.workflow_graph;

  const layout = useMemo(() => {
    if (!graph || graph.nodes.length === 0) return null;
    const edges = graph.edges;
    const ids = graph.nodes.map((n) => n.id);
    // longest-path depth = column index
    const depth: Record<string, number> = Object.fromEntries(ids.map((i) => [i, 0]));
    for (let pass = 0; pass < ids.length; pass++) {
      for (const e of edges) {
        if (depth[e.to] < depth[e.from] + 1) depth[e.to] = depth[e.from] + 1;
      }
    }
    const cols: Record<number, string[]> = {};
    for (const id of ids) (cols[depth[id]] ??= []).push(id);
    const colW = NODE_W + 34;
    const rowH = NODE_H + 26;
    const pos: Record<string, { x: number; y: number }> = {};
    let maxRows = 0;
    Object.entries(cols).forEach(([c, list]) => {
      maxRows = Math.max(maxRows, list.length);
      list.forEach((id, r) => {
        pos[id] = { x: Number(c) * colW + 20, y: r * rowH + 20 };
      });
    });
    const width = (Math.max(...Object.keys(cols).map(Number)) + 1) * colW + 40;
    const height = maxRows * rowH + 40;
    return { pos, width, height };
  }, [graph]);

  if (!graph || !layout) return <Empty>No workflow yet — the graph appears when the run starts.</Empty>;

  const nodeOf = (id: string) => graph.nodes.find((n) => n.id === id);

  return (
    <Card title="LIVE WORKFLOW GRAPH" style={{ height: '100%' }}>
      <div style={{ overflow: 'auto', flex: 1 }}>
        <svg width={layout.width} height={layout.height} style={{ display: 'block' }}>
          <style>{`
            @keyframes dvFlow { to { stroke-dashoffset: -24; } }
            @keyframes dvPulse { 0%,100% { stroke-opacity: 1; } 50% { stroke-opacity: .35; } }
            .dv-edge { transition: stroke .3s; }
            .dv-edge-active { stroke-dasharray: 7 5; animation: dvFlow .7s linear infinite; }
            .dv-node rect { transition: stroke .3s, fill .3s; }
            .dv-node-running rect { animation: dvPulse 1.4s ease-in-out infinite; }
          `}</style>
          {graph.edges.map((e, i) => {
            const a = layout.pos[e.from];
            const b = layout.pos[e.to];
            if (!a || !b) return null;
            const x1 = a.x + NODE_W;
            const y1 = a.y + NODE_H / 2;
            const x2 = b.x;
            const y2 = b.y + NODE_H / 2;
            const mx = (x1 + x2) / 2;
            const from = nodeOf(e.from)?.status;
            const to = nodeOf(e.to)?.status;
            // flowing edge = work is moving across it right now
            const flowing = from === 'completed' && to === 'running';
            const done = from === 'completed' && (to === 'completed' || to === 'failed');
            return (
              <path
                key={i}
                className={`dv-edge${flowing ? ' dv-edge-active' : ''}`}
                d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke={flowing ? dev.accent : done ? dev.green + '88' : 'rgba(255,255,255,.13)'}
                strokeWidth={flowing ? 2.2 : done ? 1.8 : 1.2}
              />
            );
          })}
          {graph.nodes.map((n) => {
            const p = layout.pos[n.id];
            if (!p) return null;
            const c = statusColor(n.status);
            const running = n.status === 'running';
            const dur = fmtMs(n.ms);
            return (
              <g key={n.id} className={`dv-node${running ? ' dv-node-running' : ''}`}>
                <rect
                  x={p.x}
                  y={p.y}
                  width={NODE_W}
                  height={NODE_H}
                  rx={9}
                  fill={running ? dev.accent + '14' : dev.raised}
                  stroke={c}
                  strokeWidth={running ? 2.2 : 1.2}
                />
                <circle cx={p.x + 13} cy={p.y + 16} r={4} fill={c} />
                <text
                  x={p.x + 25}
                  y={p.y + 20}
                  fill={dev.text}
                  fontSize={11.5}
                  fontWeight={running ? 700 : 400}
                  fontFamily="ui-sans-serif,system-ui"
                >
                  {n.id.length > 13 ? n.id.slice(0, 12) + '…' : n.id}
                </text>
                <text
                  x={p.x + 25}
                  y={p.y + 34}
                  fill={running ? dev.accent : dev.faint}
                  fontSize={10}
                  fontFamily={dev.mono}
                >
                  {running ? `${dur || '…'} ·  running` : dur}
                </text>
                {n.info && (
                  <text
                    x={p.x + 25}
                    y={p.y + 47}
                    fill={dev.dim}
                    fontSize={9.5}
                    fontFamily={dev.mono}
                  >
                    {n.info}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        {(['running', 'completed', 'failed', 'waiting', 'idle'] as const).map((s) => (
          <Badge key={s} text={s} color={statusColor(s)} />
        ))}
      </div>
    </Card>
  );
}
