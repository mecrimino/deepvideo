/** Live telemetry snapshot from the core `/dev` service. Mirrors metrics.py. */

export type AgentStatus = 'idle' | 'waiting' | 'running' | 'completed' | 'failed';

export interface GpuInfo {
  name: string;
  mem_used_mb: number;
  mem_total_mb: number;
  util_pct: number;
}

export interface SystemMetrics {
  cpu_pct?: number;
  ram_used_mb?: number;
  ram_total_mb?: number;
  ram_pct?: number;
  disk_used_gb?: number;
  disk_total_gb?: number;
  disk_pct?: number;
  net_up_kbps?: number;
  net_down_kbps?: number;
  gpu?: GpuInfo | null;
}

export interface ProviderStat {
  requests: number;
  failures: number;
  avg_ms: number;
  tokens: number;
  cost: number;
  last_status: number;
  last_ms: number;
}

export interface ApiCall {
  provider: string;
  method: string;
  url: string;
  ms: number;
  status: number;
  ok: boolean;
  at: string;
}

export interface AgentInfo {
  name: string;
  status: AgentStatus;
  task: string;
  duration_ms: number;
  retries: number;
}

export interface GraphNode {
  id: string;
  status: AgentStatus;
  /** Elapsed ms for this stage (live for the running one). */
  ms?: number;
  /** One-line real result, e.g. "40 scenes", "620 candidates". */
  info?: string;
}

/** A provider rate-limited us; the request is waiting `wait_sec` then retrying. */
export interface RateLimitEvent {
  provider: string;
  wait_sec: number;
  until: number;
  at: string;
}

/** One LLM chat call with the actual prompts sent. */
export interface LlmCall {
  provider: string;
  model: string;
  ms: number;
  ok: boolean;
  system: string;
  user: string;
  at: string;
}

/** One entry in the project selector. */
export interface RunSummary {
  id: string;
  status: string;
  stage: string | null;
  createdAt: string;
}
export interface GraphEdge {
  from: string;
  to: string;
}

export interface EventItem {
  name: string;
  at: string;
  payload: Record<string, unknown>;
}

export interface ProjectState {
  state: string;
  run_id: string | null;
  status: string;
  stage: string | null;
  active_scene: string | null;
  checkpoint: unknown;
  queue: number;
}

export interface TimelineProgress {
  scenes_done: number;
  scenes_total: number;
  render_pct: number;
}

export interface DownloadItem {
  name: string;
  pct: number;
  speed_kbps: number;
  remaining_kb: number;
}

export interface ReviewInfo {
  score?: number | null;
  passed?: boolean | null;
  category_scores?: Record<string, number>;
  failed_checks?: string[];
  recommendations?: Array<Record<string, unknown>>;
}

export interface LogEntry {
  level: string;
  name: string;
  message: string;
  at: string;
}

export interface Snapshot {
  at: string;
  system: SystemMetrics;
  /** All known runs — the project selector. */
  runs: RunSummary[];
  selected_run: string | null;
  api: { providers: Record<string, ProviderStat>; recent: ApiCall[] };
  rate_limits: RateLimitEvent[];
  llm_calls: LlmCall[];
  llm: { requests: number; total_tokens: number; total_cost: number };
  agents: AgentInfo[];
  workflow_graph: { nodes: GraphNode[]; edges: GraphEdge[] };
  events: EventItem[];
  logs: LogEntry[];
  project: ProjectState;
  timeline: TimelineProgress;
  downloads: DownloadItem[];
  review: ReviewInfo;
}
