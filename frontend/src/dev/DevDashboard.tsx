/**
 * Developer Dashboard — a single-page, live telemetry board. Every panel is on
 * screen at once in a responsive card grid (no tab switching); a snapshot streams
 * in over the `/dev/ws` WebSocket (~1 Hz). Styled with the app's own design
 * tokens so it reads as part of Deep Video.
 */

import { useEffect } from 'react';
import { useDevStore } from './useDevStore';
import { dev, devGradients, StatChip } from './ui';
import { WorkflowGraphPanel } from './panels/WorkflowGraphPanel';
import { AgentMonitorPanel } from './panels/AgentMonitorPanel';
import { EventStreamPanel } from './panels/EventStreamPanel';
import { LogsPanel } from './panels/LogsPanel';
import { ApiMonitorPanel } from './panels/ApiMonitorPanel';
import { LlmCallsPanel } from './panels/LlmCallsPanel';
import { ProjectStatePanel } from './panels/ProjectStatePanel';
import { PerformancePanel } from './panels/PerformancePanel';
import { TimelineProgressPanel } from './panels/TimelineProgressPanel';
import { DownloadsPanel } from './panels/DownloadsPanel';
import { ReviewerPanel } from './panels/ReviewerPanel';

const GRID_CSS = `
.dv-scroll{scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.16) transparent}
.dv-scroll::-webkit-scrollbar{width:10px;height:10px}
.dv-scroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,.14);border-radius:8px;border:2px solid transparent;background-clip:content-box}
.dv-scroll::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,.24);background-clip:content-box}
.dv-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:14px;align-items:stretch}
.dv-grid>.dv-cell{min-width:0;height:340px}
.dv-grid>.dv-full{grid-column:1/-1}
.dv-grid>.dv-graph{grid-column:1/-1;height:360px}
.dv-grid>.dv-logs{grid-column:1/-1;height:320px}
@media(max-width:720px){.dv-grid>.dv-cell{height:320px}}
`;

const connLabel: Record<string, { t: string; c: string }> = {
  open: { t: 'live', c: dev.green },
  connecting: { t: 'connecting…', c: dev.amber },
  closed: { t: 'offline', c: dev.red },
};

export function DevDashboard() {
  const open = useDevStore((s) => s.open);
  const conn = useDevStore((s) => s.conn);
  const snap = useDevStore((s) => s.snapshot);
  const close = useDevStore((s) => s.closeDashboard);
  const runId = useDevStore((s) => s.runId);
  const setRunId = useDevStore((s) => s.setRunId);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open) return null;

  const c = connLabel[conn];
  const sys = snap?.system;
  const apiReqs = snap
    ? Object.values(snap.api.providers).reduce((s, p) => s + p.requests, 0)
    : 0;
  const runStatus = snap?.project.status ?? '—';
  const runColor =
    runStatus === 'running'
      ? dev.accent
      : runStatus === 'done'
        ? dev.green
        : runStatus === 'failed'
          ? dev.red
          : dev.dim;

  return (
    <div
      className="dv-scroll"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9000,
        background: devGradients.hero,
        color: dev.text,
        overflow: 'auto',
        fontFamily: 'ui-sans-serif,system-ui,-apple-system,sans-serif',
      }}
    >
      <style>{GRID_CSS}</style>

      {/* sticky header */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 5,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '14px 22px',
          background: 'rgba(10,10,12,.72)',
          borderBottom: `1px solid ${dev.border}`,
          backdropFilter: 'blur(12px)',
        }}
      >
        <span
          style={{
            width: 26,
            height: 26,
            borderRadius: 8,
            background: devGradients.brand,
            flexShrink: 0,
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Developer Dashboard</span>
          <span style={{ fontSize: 11, color: dev.faint }}>
            Deep Video · live telemetry {snap ? `· ${snap.at?.slice(11, 19)}` : ''}
          </span>
        </div>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: c.c,
            padding: '4px 10px',
            borderRadius: 20,
            background: `${c.c}18`,
            border: `1px solid ${c.c}44`,
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.c }} />
          {c.t}
        </span>
        {/* project selector — scopes every panel to one run */}
        <select
          value={runId ?? ''}
          onChange={(e) => setRunId(e.target.value || null)}
          style={{
            background: dev.control,
            color: dev.text,
            border: `1px solid ${dev.border2}`,
            borderRadius: 8,
            padding: '6px 10px',
            fontSize: 12,
            outline: 'none',
            maxWidth: 240,
          }}
        >
          <option value="">No project (system only)</option>
          {(snap?.runs ?? []).map((r) => (
            <option key={r.id} value={r.id}>
              {r.id} · {r.status}
            </option>
          ))}
        </select>
        <button
          onClick={close}
          style={{
            marginLeft: 'auto',
            background: dev.control,
            color: dev.text,
            border: `1px solid ${dev.border2}`,
            borderRadius: 8,
            padding: '7px 14px',
            fontSize: 12.5,
            cursor: 'pointer',
          }}
        >
          Close <span style={{ color: dev.faint }}>Esc</span>
        </button>
      </header>

      {/* KPI strip — system always; run KPIs only for a selected project */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          padding: '16px 22px 4px',
        }}
      >
        <StatChip
          label="CPU"
          value={sys?.cpu_pct != null ? `${sys.cpu_pct.toFixed(0)}%` : '—'}
          accent={dev.accent}
        />
        <StatChip
          label="RAM"
          value={sys?.ram_pct != null ? `${sys.ram_pct.toFixed(0)}%` : '—'}
          accent={dev.accent}
        />
        {runId && (
          <>
            <StatChip label="Run" value={runStatus} color={runColor} accent={runColor} />
            <StatChip label="API calls" value={apiReqs} accent={dev.green} />
            <StatChip
              label="LLM tokens"
              value={(snap?.llm.total_tokens ?? 0).toLocaleString()}
              accent={dev.amber}
            />
            <StatChip
              label="Scenes"
              value={`${snap?.timeline.scenes_done ?? 0}/${snap?.timeline.scenes_total ?? 0}`}
              accent={dev.amber}
            />
            <StatChip label="Queue" value={snap?.project.queue ?? 0} accent={dev.dim} />
          </>
        )}
      </div>

      {!runId ? (
        /* no project — only system-level data */
        <div className="dv-grid" style={{ padding: '12px 22px 28px' }}>
          <div className="dv-cell">
            <PerformancePanel snap={snap} />
          </div>
          <div
            className="dv-cell"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: dev.faint,
              fontSize: 13,
              border: `1px dashed ${dev.border2}`,
              borderRadius: 10,
            }}
          >
            Select a project above to see its workflow, agents, events and logs.
          </div>
        </div>
      ) : (
        /* project selected — every panel, scoped to that run */
        <div className="dv-grid" style={{ padding: '12px 22px 28px' }}>
          <div className="dv-cell">
            <ProjectStatePanel snap={snap} />
          </div>
          <div className="dv-cell">
            <PerformancePanel snap={snap} />
          </div>
          <div className="dv-cell">
            <TimelineProgressPanel snap={snap} />
          </div>
          <div className="dv-cell">
            <DownloadsPanel snap={snap} />
          </div>

          <div className="dv-graph">
            <WorkflowGraphPanel snap={snap} />
          </div>

          <div className="dv-cell">
            <AgentMonitorPanel snap={snap} />
          </div>
          <div className="dv-cell">
            <EventStreamPanel snap={snap} />
          </div>
          <div className="dv-cell">
            <ApiMonitorPanel snap={snap} />
          </div>
          <div className="dv-cell">
            <LlmCallsPanel snap={snap} />
          </div>
          <div className="dv-cell">
            <ReviewerPanel snap={snap} />
          </div>

          <div className="dv-logs">
            <LogsPanel snap={snap} />
          </div>
        </div>
      )}
    </div>
  );
}

/** The always-visible "Developer Mode" pill that opens the dashboard. */
export function DevModeButton() {
  const open = useDevStore((s) => s.open);
  const toggle = useDevStore((s) => s.toggleDashboard);
  if (open) return null;
  return (
    <button
      onClick={toggle}
      title="Open Developer Dashboard"
      style={{
        position: 'fixed',
        right: 14,
        bottom: 14,
        zIndex: 8000,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'rgba(20,20,24,.9)',
        color: dev.text,
        border: `1px solid ${dev.border2}`,
        borderRadius: 22,
        padding: '8px 15px',
        fontSize: 12.5,
        fontWeight: 600,
        cursor: 'pointer',
        backdropFilter: 'blur(8px)',
        boxShadow: '0 6px 22px rgba(0,0,0,.45)',
      }}
    >
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: 5,
          background: devGradients.brand,
          display: 'inline-block',
        }}
      />
      Developer Mode
    </button>
  );
}
