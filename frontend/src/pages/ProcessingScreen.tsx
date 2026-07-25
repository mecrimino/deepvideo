/**
 * Processing — a single, focused "what's happening" panel. Header has Back to
 * Home (top-left; the run keeps working in the background) and the panel shows
 * the live stage checklist with a Cancel button. Leaving keeps it running; it
 * shows on Home under Recent Generations and clicking it returns here.
 */

import { Check, ChevronLeft, CircleAlert, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { PipelineStage } from '@deep-vision/shared';
import { GradientLogo } from '../components/GradientLogo';
import { useAppStore } from '../stores/useAppStore';
import { colors, fontMono } from '../styles/theme';

const STAGE_LABELS: Record<PipelineStage, string> = {
  segment: 'Splitting the script into visual beats',
  queries: 'Writing retrieval queries (said / shown)',
  retrieve: 'Searching footage libraries',
  rerank: 'Ranking candidates (semantic + visual)',
  pick: 'Picking clips / generating visuals',
  history: 'Downloading footage & assembling the timeline',
};

function fmtSecs(ms: number): string {
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(0)}s`;
  return `${Math.floor(sec / 60)}m ${Math.floor(sec % 60)}s`;
}

export function ProcessingScreen() {
  const run = useAppStore((s) => s.run);
  const runError = useAppStore((s) => s.runError);
  const gen = useAppStore((s) => s.gen);
  const go = useAppStore((s) => s.go);
  const cancelGeneration = useAppStore((s) => s.cancelGeneration);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, []);

  const stages = run?.stages ?? [];
  const elapsed = run ? fmtSecs(now - new Date(run.createdAt).getTime()) : '—';

  return (
    <div style={{ minHeight: '100vh', background: colors.bg, position: 'relative' }}>
      {/* header — Back to Home (keeps running in the background) */}
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
        }}
      >
        <ChevronLeft size={16} />
        <GradientLogo size={18} radius={5} />
        Back to Home
      </button>

      {/* centered panel */}
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '80px 24px 40px',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 460,
            background: colors.panel,
            border: `1px solid ${colors.border8}`,
            borderRadius: 18,
            padding: '28px 26px',
            textAlign: 'center',
          }}
        >
          {!runError ? (
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                border: '3px solid rgba(255,255,255,.12)',
                borderTopColor: colors.accent,
                margin: '0 auto 22px',
                animation: 'spin 1s linear infinite',
              }}
            />
          ) : (
            <CircleAlert size={48} color="#e46a6a" style={{ margin: '0 auto 18px' }} />
          )}

          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>
            {runError ? 'The pipeline hit a problem' : (gen?.title ?? 'Processing…')}
          </div>
          <div style={{ fontSize: 13.5, color: colors.textFaint, marginBottom: 22 }}>
            {runError ?? (
              <>
                Building your video · <span style={{ fontFamily: fontMono }}>{elapsed}</span>
              </>
            )}
          </div>

          {/* what's happening — the live stage checklist */}
          {!runError && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                textAlign: 'left',
                background: colors.card,
                border: `1px solid ${colors.border8}`,
                borderRadius: 14,
                padding: '16px 18px',
              }}
            >
              {stages.length === 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, fontSize: 13.5, color: colors.textGhost }}>
                  <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                  Contacting the local server…
                </div>
              )}
              {stages.map((s) => (
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
                    <Check size={15} color="#6fd08e" style={{ flexShrink: 0 }} />
                  ) : s.status === 'running' ? (
                    <Loader2 size={15} color={colors.accent} style={{ flexShrink: 0, animation: 'spin 1s linear infinite' }} />
                  ) : (
                    <span
                      style={{
                        width: 9,
                        height: 9,
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
            </div>
          )}

          {/* actions */}
          {!runError ? (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 12, color: colors.textGhost, marginBottom: 12 }}>
                You can go back — this keeps running in the background.
              </div>
              <button
                onClick={() => void cancelGeneration()}
                style={{
                  padding: '9px 20px',
                  borderRadius: 10,
                  background: 'transparent',
                  border: '1px solid rgba(228,106,106,.45)',
                  color: '#e48a8a',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Cancel generation
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 18 }}>
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
      </div>
    </div>
  );
}
