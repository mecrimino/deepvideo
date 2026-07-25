/** Panel 7 — Performance: CPU, RAM, GPU, disk, network (real psutil data). */

import type { Snapshot } from '../types';
import { Bar, Card, dev, Empty, Stat } from '../ui';

function hue(pct: number): string {
  if (pct >= 90) return dev.red;
  if (pct >= 70) return dev.amber;
  return dev.green;
}

export function PerformancePanel({ snap }: { snap: Snapshot | null }) {
  const s = snap?.system;
  if (!s || s.cpu_pct == null) return <Empty>System metrics unavailable.</Empty>;

  const gpu = s.gpu;
  const gpuMem = gpu ? (gpu.mem_used_mb / gpu.mem_total_mb) * 100 : 0;

  return (
    <Card title="PERFORMANCE" style={{ height: '100%' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Meter label="CPU" pct={s.cpu_pct ?? 0} detail={`${(s.cpu_pct ?? 0).toFixed(0)}%`} />
        <Meter
          label="Memory"
          pct={s.ram_pct ?? 0}
          detail={`${gb(s.ram_used_mb)} / ${gb(s.ram_total_mb)} GB · ${(s.ram_pct ?? 0).toFixed(0)}%`}
        />
        <Meter
          label="Disk"
          pct={s.disk_pct ?? 0}
          detail={`${s.disk_used_gb} / ${s.disk_total_gb} GB · ${(s.disk_pct ?? 0).toFixed(0)}%`}
        />
        {gpu ? (
          <Meter
            label={`GPU · ${gpu.name}`}
            pct={gpu.util_pct}
            detail={`${gpu.util_pct}% util · ${gpu.mem_used_mb}/${gpu.mem_total_mb} MB`}
            sub={<Bar pct={gpuMem} color={hue(gpuMem)} />}
          />
        ) : (
          <div style={{ fontSize: 12, color: dev.faint }}>GPU: none detected (nvidia-smi unavailable)</div>
        )}
        <div style={{ display: 'flex', gap: 28, marginTop: 2 }}>
          <Stat label="Net ↓" value={`${fmtKbps(s.net_down_kbps)}`} />
          <Stat label="Net ↑" value={`${fmtKbps(s.net_up_kbps)}`} />
        </div>
      </div>
    </Card>
  );
}

function Meter({
  label,
  pct,
  detail,
  sub,
}: {
  label: string;
  pct: number;
  detail: string;
  sub?: React.ReactNode;
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 12, color: dev.text, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 12, color: dev.dim, fontFamily: dev.mono }}>{detail}</span>
      </div>
      <Bar pct={pct} color={hue(pct)} />
      {sub && <div style={{ marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

const gb = (mb?: number) => ((mb ?? 0) / 1000).toFixed(1);
const fmtKbps = (k?: number) => {
  const v = k ?? 0;
  return v >= 1024 ? `${(v / 1024).toFixed(1)} MB/s` : `${v.toFixed(0)} KB/s`;
};
