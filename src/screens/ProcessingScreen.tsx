/**
 * Live pipeline progress: renders the REAL stage list from the running
 * PipelineRun (segment → queries → retrieve → rerank → pick → history),
 * with per-stage status and an error state with a way back.
 */

import { Check, CircleAlert, Loader2 } from 'lucide-react';
import type { PipelineStage } from '@deep-video/shared';
import { useAppStore } from '../store/useAppStore';
import { colors } from '../theme';

const STAGE_LABELS: Record<PipelineStage, string> = {
  segment: 'Splitting the script into visual beats',
  queries: 'Writing retrieval queries (said / shown)',
  retrieve: 'Searching the local clip library',
  rerank: 'Ranking candidates (semantic + visual)',
  pick: 'Picking clips / leaving generation slots',
  history: 'Saving the run & assembling the timeline',
};

export function ProcessingScreen() {
  const run = useAppStore((s) => s.run);
  const runError = useAppStore((s) => s.runError);
  const go = useAppStore((s) => s.go);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: colors.bg,
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 460 }}>
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
          {runError ? 'The pipeline hit a problem' : 'Processing your request…'}
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

        {runError && (
          <button
            onClick={() => go('setup')}
            className="hv-blue"
            style={{
              marginTop: 8,
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
        )}
      </div>
    </div>
  );
}
