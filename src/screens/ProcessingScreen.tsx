/**
 * Live pipeline progress with a full agent monitor:
 *  - LEFT: what the agent knows/is doing — model, detected niche, live elapsed
 *    clock, per-stage timings, and pick statistics.
 *  - CENTER: the stage checklist (unchanged), back-to-home, cancel.
 *  - RIGHT: every segment with its extracted keyword, the stock sites queried,
 *    candidate thumbnails as they stream in, and the final pick + score.
 * The generation keeps working in the background when you leave.
 */

import { Activity, Check, ChevronLeft, CircleAlert, Layers, Loader2, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { PipelineStage, SegmentProgress, StageResult } from '@deep-video/shared';
import { GradientLogo } from '../components/GradientLogo';
import { useAppStore } from '../store/useAppStore';
import { colors, fontMono } from '../theme';

const STAGE_LABELS: Record<PipelineStage, string> = {
  segment: 'Splitting the script into visual beats',
  queries: 'Writing retrieval queries (said / shown)',
  retrieve: 'Searching footage libraries',
  rerank: 'Ranking candidates (semantic + visual)',
  pick: 'Picking clips / leaving generation slots',
  history: 'Downloading footage & assembling the timeline',
};

const STAGE_SHORT: Record<PipelineStage, string> = {
  segment: 'Segment',
  queries: 'Niche + keywords',
  retrieve: 'Stock search',
  rerank: 'CLIP ranking',
  pick: 'Pick + verify',
  history: 'Download + assemble',
};

function fmtSecs(ms: number): string {
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const m = Math.floor(sec / 60);
  return `${m}m ${Math.floor(sec % 60)}s`;
}

function stageDuration(s: StageResult, now: number): string {
  if (!s.startedAt) return '—';
  const start = new Date(s.startedAt).getTime();
  const end = s.finishedAt ? new Date(s.finishedAt).getTime() : now;
  return fmtSecs(Math.max(0, end - start));
}

function sourceBadge(source: string) {
  const isPexels = source === 'pexels';
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '.05em',
        padding: '1px 6px',
        borderRadius: 4,
        background: isPexels ? 'rgba(5,160,129,.16)' : 'rgba(72,178,80,.16)',
        color: isPexels ? '#3ecfae' : '#7fd486',
      }}
    >
      {source.toUpperCase()}
    </span>
  );
}

function SegmentRow({ seg, index }: { seg: SegmentProgress; index: number }) {
  const status = seg.pick
    ? seg.pick.status
    : seg.pooled !== undefined
      ? 'ranking'
      : seg.keyword
        ? 'searching'
        : 'waiting';

  return (
    <div
      style={{
        borderBottom: `1px solid ${colors.border6}`,
        padding: '9px 0',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <span
          style={{
            fontFamily: fontMono,
            fontSize: 10,
            color: colors.textGhost,
            paddingTop: 2,
            flexShrink: 0,
          }}
        >
          {String(index + 1).padStart(2, '0')}
        </span>
        <span
          style={{
            fontSize: 11.5,
            color: colors.textMid,
            lineHeight: 1.4,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {seg.text}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', paddingLeft: 22 }}>
        {seg.keyword ? (
          <span
            style={{
              fontSize: 10.5,
              padding: '2px 8px',
              borderRadius: 999,
              background: 'rgba(47,107,255,.14)',
              border: '1px solid rgba(47,107,255,.3)',
              color: '#a9c3ff',
            }}
          >
            {seg.keyword}
          </span>
        ) : (
          <span style={{ fontSize: 10.5, color: colors.textGhost }}>extracting keyword…</span>
        )}

        {status === 'searching' && (
          <span style={{ fontSize: 10.5, color: colors.textGhost, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} /> searching stock…
          </span>
        )}
        {status === 'ranking' && (
          <span style={{ fontSize: 10.5, color: colors.textGhost, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} />
            {seg.pooled} candidates · CLIP ranking…
          </span>
        )}
        {seg.pick && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5 }}>
            {seg.pick.status === 'review' ? (
              <CircleAlert size={11} color="#f5c542" />
            ) : seg.pick.status === 'none' ? (
              <Sparkles size={11} color="#a78bfa" />
            ) : (
              <Check size={11} color="#6fd08e" />
            )}
            <span style={{ color: seg.pick.status === 'review' ? '#f5c542' : colors.textDim }}>
              {seg.pick.status === 'none' ? 'generation slot' : `cos ${seg.pick.score}`}
            </span>
            {seg.pick.status !== 'none' && sourceBadge(seg.pick.source)}
          </span>
        )}
      </div>

      {seg.thumbs && seg.thumbs.length > 0 && (
        <div style={{ display: 'flex', gap: 4, paddingLeft: 22 }}>
          {seg.thumbs.map((t, i) => (
            <img
              key={i}
              src={t.url}
              alt=""
              title={`candidate from ${t.source}`}
              style={{
                width: 46,
                height: 28,
                objectFit: 'cover',
                borderRadius: 4,
                border:
                  seg.pick?.thumb === t.url
                    ? `2px solid ${seg.pick.status === 'review' ? '#f5c542' : colors.accent}`
                    : `1px solid ${colors.border8}`,
                opacity: seg.pick && seg.pick.thumb !== t.url ? 0.45 : 1,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ProcessingScreen() {
  const run = useAppStore((s) => s.run);
  const runError = useAppStore((s) => s.runError);
  const gen = useAppStore((s) => s.gen);
  const go = useAppStore((s) => s.go);
  const cancelGeneration = useAppStore((s) => s.cancelGeneration);

  // Live clock for elapsed + running-stage durations.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, []);

  const progress = run?.progress;
  const segments = progress?.segments ?? [];
  const pooledTotal = segments.reduce((n, s) => n + (s.pooled ?? 0), 0);
  const picks = segments.filter((s) => s.pick);
  const autoPicks = picks.filter((s) => s.pick!.status === 'auto' || s.pick!.status === 'auto-fallback').length;
  const reviewPicks = picks.filter((s) => s.pick!.status === 'review').length;
  const historyOut = run?.stages.find((s) => s.stage === 'history')?.output as
    | { downloaded?: number }
    | undefined;

  const endTime =
    run && run.status !== 'running'
      ? Math.max(
          ...run.stages.map((s) => (s.finishedAt ? new Date(s.finishedAt).getTime() : 0)),
          new Date(run.createdAt).getTime(),
        )
      : now;
  const elapsed = run ? fmtSecs(endTime - new Date(run.createdAt).getTime()) : '—';

  const monitorRow = (k: string, v: React.ReactNode) => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '7px 0',
        borderBottom: `1px solid ${colors.border6}`,
        fontSize: 12.5,
      }}
    >
      <span style={{ color: colors.textFaint }}>{k}</span>
      <span style={{ color: colors.textBright, fontWeight: 500 }}>{v}</span>
    </div>
  );

  const panelStyle: React.CSSProperties = {
    background: colors.panel,
    border: `1px solid ${colors.border8}`,
    borderRadius: 14,
    padding: '14px 16px',
    width: 320,
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: colors.bg,
        padding: '76px 24px 40px',
        position: 'relative',
      }}
    >
      {/* top-left: back to home — the run keeps working in the background */}
      <button
        onClick={() => go('home')}
        className="hv-panel"
        title="The generation keeps running in the background"
        style={{
          position: 'absolute',
          top: 18,
          left: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          background: 'transparent',
          border: `1px solid ${colors.border9}`,
          borderRadius: 11,
          padding: '8px 14px 8px 10px',
          color: colors.textMid,
          fontSize: 13,
          fontWeight: 500,
          cursor: 'pointer',
          zIndex: 2,
        }}
      >
        <ChevronLeft size={16} />
        <GradientLogo size={18} radius={5} />
        Back to Home
      </button>

      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          gap: 24,
          flexWrap: 'wrap',
        }}
      >
        {/* LEFT — agent monitor */}
        <div style={panelStyle}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13.5,
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            <Activity size={15} color={colors.textDim} />
            Agent Monitor
          </div>
          {monitorRow('Model', progress?.model === 'mini' ? 'Deep Video v1 Mini' : progress?.model === 'pro' ? 'Deep Video v1 Pro' : '—')}
          {monitorRow(
            'Niche',
            progress?.niche ?? (
              <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} color={colors.textGhost} />
            ),
          )}
          {monitorRow('Elapsed', <span style={{ fontFamily: fontMono }}>{elapsed}</span>)}

          <div style={{ fontSize: 11, color: colors.textGhost, margin: '12px 0 4px', textTransform: 'uppercase', letterSpacing: '.06em' }}>
            Stage timing
          </div>
          {(run?.stages ?? []).map((s) => (
            <div
              key={s.stage}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '5px 0',
                fontSize: 12,
              }}
            >
              <span
                style={{
                  color:
                    s.status === 'running'
                      ? colors.textBright
                      : s.status === 'done'
                        ? colors.textMid
                        : colors.textGhost,
                }}
              >
                {STAGE_SHORT[s.stage]}
              </span>
              <span
                style={{
                  fontFamily: fontMono,
                  fontSize: 11.5,
                  color:
                    s.status === 'running'
                      ? '#6f9bff'
                      : s.status === 'failed'
                        ? '#e48a8a'
                        : colors.textDim,
                }}
              >
                {stageDuration(s, now)}
              </span>
            </div>
          ))}

          <div style={{ fontSize: 11, color: colors.textGhost, margin: '12px 0 4px', textTransform: 'uppercase', letterSpacing: '.06em' }}>
            Stats
          </div>
          {monitorRow('Segments', segments.length || '—')}
          {monitorRow('Candidates pooled', pooledTotal || '—')}
          {monitorRow(
            'Picks',
            picks.length ? (
              <span>
                <span style={{ color: '#6fd08e' }}>{autoPicks} auto</span>
                {reviewPicks > 0 && <span style={{ color: '#f5c542' }}> · {reviewPicks} review</span>}
              </span>
            ) : (
              '—'
            ),
          )}
          {monitorRow('Clips downloaded', historyOut?.downloaded ?? '—')}
        </div>

        {/* CENTER — headline + stage checklist */}
        <div style={{ textAlign: 'center', maxWidth: 460, minWidth: 380 }}>
          {!runError ? (
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                border: '3px solid rgba(255,255,255,.12)',
                borderTopColor: colors.accent,
                margin: '0 auto 26px',
                animation: 'spin 1s linear infinite',
              }}
            />
          ) : (
            <CircleAlert size={52} color="#e46a6a" style={{ margin: '0 auto 22px' }} />
          )}

          <div style={{ fontSize: 19, fontWeight: 600, marginBottom: 8 }}>
            {runError ? 'The pipeline hit a problem' : (gen?.title ?? 'Processing your request…')}
          </div>
          <div style={{ fontSize: 14, color: colors.textFaint, marginBottom: 26 }}>
            {runError ??
              'The agent is segmenting the script, retrieving footage, and assembling your timeline.'}
          </div>

          {!runError && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 11,
                textAlign: 'left',
                background: colors.panel,
                border: `1px solid ${colors.border8}`,
                borderRadius: 14,
                padding: '16px 18px',
              }}
            >
              {(run?.stages ?? []).map((s) => (
                <div
                  key={s.stage}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 11,
                    fontSize: 13.5,
                    color:
                      s.status === 'done'
                        ? colors.textMid
                        : s.status === 'running'
                          ? colors.textBright
                          : colors.textGhost,
                  }}
                >
                  {s.status === 'done' ? (
                    <Check size={14} color="#6fd08e" style={{ flexShrink: 0 }} />
                  ) : s.status === 'running' ? (
                    <Loader2
                      size={14}
                      color={colors.accent}
                      style={{ flexShrink: 0, animation: 'spin 1s linear infinite' }}
                    />
                  ) : (
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: s.status === 'failed' ? '#e46a6a' : '#3a3a44',
                        flexShrink: 0,
                        margin: 3,
                      }}
                    />
                  )}
                  <span style={{ flex: 1 }}>{STAGE_LABELS[s.stage]}</span>
                </div>
              ))}
              {!run && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, fontSize: 13.5, color: colors.textGhost }}>
                  <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                  Contacting the local server…
                </div>
              )}
            </div>
          )}

          {!runError && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 14,
                marginTop: 18,
              }}
            >
              <span style={{ fontSize: 12, color: colors.textGhost }}>
                You can go back — this keeps running in the background.
              </span>
              <button
                onClick={() => void cancelGeneration()}
                style={{
                  padding: '7px 16px',
                  borderRadius: 9,
                  background: 'transparent',
                  border: '1px solid rgba(228,106,106,.45)',
                  color: '#e48a8a',
                  fontSize: 12.5,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Cancel generation
              </button>
            </div>
          )}

          {runError && (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 8 }}>
              <button
                onClick={() => void cancelGeneration()}
                className="hv-panel"
                style={{
                  padding: '9px 18px',
                  borderRadius: 10,
                  background: 'transparent',
                  border: `1px solid ${colors.border10}`,
                  color: colors.textDim,
                  fontSize: 13.5,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Dismiss
              </button>
              <button
                onClick={() => go('setup')}
                className="hv-blue"
                style={{
                  padding: '9px 22px',
                  borderRadius: 10,
                  background: colors.accent,
                  border: 'none',
                  color: '#fff',
                  fontSize: 13.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Back to setup
              </button>
            </div>
          )}
        </div>

        {/* RIGHT — segments, keywords, live footage */}
        <div style={{ ...panelStyle, maxHeight: 'calc(100vh - 140px)', display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13.5,
              fontWeight: 600,
              marginBottom: 4,
            }}
          >
            <Layers size={15} color={colors.textDim} />
            Segments &amp; Footage
            {segments.length > 0 && (
              <span style={{ marginLeft: 'auto', fontSize: 11, color: colors.textGhost, fontWeight: 400 }}>
                {picks.length}/{segments.length} matched
              </span>
            )}
          </div>
          <div style={{ overflowY: 'auto', minHeight: 0 }}>
            {segments.length === 0 && (
              <div style={{ fontSize: 12, color: colors.textGhost, padding: '14px 0' }}>
                Segments appear here as soon as the script is split…
              </div>
            )}
            {segments.map((seg, i) => (
              <SegmentRow key={seg.beatId} seg={seg} index={i} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
