/** Panel — LLM & Prompts: every chat call with provider, latency, and the
 * ACTUAL system/user prompts sent (what each agent asked the model). */

import { useState } from 'react';
import type { Snapshot } from '../types';
import { Badge, Card, dev, Empty } from '../ui';

/** The system prompt's opening identifies the agent role. */
function roleOf(system: string): string {
  const m = system.match(/You are (?:the |a |an )?([^.,]{3,40})/i);
  return m ? m[1].trim() : 'LLM call';
}

export function LlmCallsPanel({ snap }: { snap: Snapshot | null }) {
  const calls = snap?.llm_calls ?? [];
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  return (
    <Card
      title="LLM & PROMPTS"
      right={<span style={{ color: dev.faint, fontSize: 11 }}>{calls.length} calls</span>}
      style={{ height: '100%' }}
    >
      {calls.length === 0 ? (
        <Empty>No LLM calls yet this session.</Empty>
      ) : (
        <div style={{ overflow: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {calls.map((c, i) => {
            const open = openIdx === i;
            return (
              <div
                key={i}
                onClick={() => setOpenIdx(open ? null : i)}
                style={{
                  background: dev.raised,
                  border: `1px solid ${dev.border}`,
                  borderRadius: 8,
                  padding: '8px 10px',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Badge text={c.ok ? 'OK' : 'FAIL'} color={c.ok ? dev.green : dev.red} />
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: dev.text }}>
                    {roleOf(c.system)}
                  </span>
                  <span style={{ marginLeft: 'auto', fontFamily: dev.mono, fontSize: 11, color: dev.dim }}>
                    {c.provider}
                    {c.model ? ` · ${c.model.split('/').pop()}` : ''} · {(c.ms / 1000).toFixed(1)}s
                  </span>
                  <span style={{ fontFamily: dev.mono, fontSize: 10.5, color: dev.faint }}>
                    {c.at.slice(11, 19)}
                  </span>
                </div>
                {open && (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <PromptBlock label="SYSTEM" text={c.system} />
                    <PromptBlock label="USER" text={c.user} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function PromptBlock({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: dev.faint, letterSpacing: 0.5, marginBottom: 3 }}>{label}</div>
      <div
        style={{
          fontFamily: dev.mono,
          fontSize: 11,
          lineHeight: 1.5,
          color: dev.dim,
          background: dev.bg,
          border: `1px solid ${dev.border}`,
          borderRadius: 6,
          padding: '7px 9px',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          maxHeight: 140,
          overflowY: 'auto',
        }}
      >
        {text}
        {text.length >= 260 ? '…' : ''}
      </div>
    </div>
  );
}
