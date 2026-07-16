/**
 * Right-hand "Deep Video Agent" chat column. Fully functional: messages go to
 * POST /api/agent/chat with the current timeline; when the agent edits it,
 * the returned timeline is applied to the editor (undoable). Powered by
 * OpenRouter (tencent/hy3:free) with Ollama and offline command fallbacks —
 * the chip in the composer shows which brain answered. Toggled from the
 * panel button in the top bar.
 */

import { ArrowUp, Bot, ChevronRight, Loader2, Plus, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { agentChat } from '../../services/agent';
import { useAppStore } from '../../store/useAppStore';
import { useEditorStore } from '../../store/useEditorStore';
import { colors, gradients } from '../../theme';

const SUGGESTIONS = [
  'Explain what Deep Video Agent can do, and how I can use you most effectively.',
  'Regenerate the clips from 0:00 to 0:30 with fresh footage',
  'Find a better alternative for clip 1',
];

const BACKEND_LABEL: Record<string, string> = {
  openrouter: 'Agent · hy3 (OpenRouter)',
  ollama: 'Agent · Ollama',
  commands: 'Agent · command mode',
};

interface Message {
  role: 'user' | 'agent';
  text: string;
  actions?: string[];
}

export function AgentChat() {
  const toggleChat = useAppStore((s) => s.toggleChat);
  const timeline = useEditorStore((s) => s.timeline);
  const applyTimeline = useEditorStore((s) => s.applyTimeline);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [backend, setBackend] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [messages, busy]);

  const send = async (text?: string) => {
    const message = (text ?? input).trim();
    if (!message || busy || !timeline) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text: message }]);
    setBusy(true);
    try {
      const res = await agentChat({ message, timeline });
      if (res.timeline) applyTimeline(res.timeline);
      if (res.backend) setBackend(res.backend);
      setMessages((m) => [...m, { role: 'agent', text: res.reply, actions: res.actions }]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          role: 'agent',
          text: `I couldn't reach the local server: ${err instanceof Error ? err.message : err}`,
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const iconBtn: React.CSSProperties = {
    width: 28,
    height: 28,
    borderRadius: 7,
    background: 'transparent',
    border: 'none',
    color: colors.textDim,
    display: 'grid',
    placeItems: 'center',
    cursor: 'pointer',
  };

  return (
    <div
      style={{
        width: 'clamp(340px, 28vw, 430px)',
        flexShrink: 0,
        borderLeft: `1px solid ${colors.border7}`,
        display: 'flex',
        flexDirection: 'column',
        background: colors.bgBar,
        minHeight: 0,
        position: 'relative',
      }}
    >
      {/* collapse handle on the panel's left edge */}
      <button
        onClick={toggleChat}
        title="Collapse agent panel"
        style={{
          position: 'absolute',
          left: -9,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 18,
          height: 36,
          borderRadius: 8,
          background: colors.raised,
          border: `1px solid ${colors.border9}`,
          color: colors.textDim,
          display: 'grid',
          placeItems: 'center',
          zIndex: 7,
          padding: 0,
          cursor: 'pointer',
        }}
      >
        <ChevronRight size={12} />
      </button>

      {/* header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '12px 16px',
          borderBottom: `1px solid ${colors.border7}`,
        }}
      >
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>
          {messages.length === 0 ? 'New chat' : 'Deep Video Agent'}
        </span>
        {messages.length > 0 && (
          <button onClick={() => setMessages([])} className="hv-rail" style={iconBtn} title="New chat">
            <Plus size={16} />
          </button>
        )}
      </div>

      {/* body */}
      <div
        ref={bodyRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '18px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          minHeight: 0,
        }}
      >
        {messages.length === 0 && (
          <>
            <div style={{ textAlign: 'center', margin: 'auto 0 14px' }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: gradients.brand,
                  margin: '0 auto 12px',
                }}
              />
              <div style={{ fontSize: 16, fontWeight: 700 }}>Deep Video Agent</div>
              <div
                style={{
                  fontSize: 13,
                  color: colors.textFaint,
                  lineHeight: 1.55,
                  marginTop: 6,
                  maxWidth: 260,
                  marginLeft: 'auto',
                  marginRight: 'auto',
                }}
              >
                Ask me to edit your timeline, add effects, or improve your cut — cut scenes,
                replace stock and images, regenerate any section.
              </div>
            </div>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => void send(s)}
                className="hv-input"
                style={{
                  textAlign: 'left',
                  background: colors.card,
                  border: `1px solid ${colors.border8}`,
                  borderRadius: 10,
                  padding: '11px 13px',
                  fontSize: 12.5,
                  color: colors.textSoft,
                  lineHeight: 1.45,
                  cursor: 'pointer',
                }}
              >
                {s}
              </button>
            ))}
          </>
        )}

        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} style={{ alignSelf: 'flex-end', maxWidth: '88%' }}>
              <div
                style={{
                  background: '#1e2635',
                  border: '1px solid rgba(90,130,220,.25)',
                  borderRadius: '12px 12px 4px 12px',
                  padding: '9px 12px',
                  fontSize: 13,
                  color: '#dbe2ef',
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {m.text}
              </div>
            </div>
          ) : (
            <div key={i} style={{ alignSelf: 'flex-start', maxWidth: '94%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: gradients.brand,
                    display: 'inline-block',
                  }}
                />
                <span style={{ fontSize: 11, color: colors.textFaint }}>Deep Video Agent</span>
              </div>
              <div style={{ fontSize: 13, color: colors.textMid, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {m.text}
              </div>
              {m.actions && m.actions.length > 0 && (
                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {m.actions.map((a, j) => (
                    <div
                      key={j}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 11,
                        color: '#8fb389',
                      }}
                    >
                      <Sparkles size={11} style={{ flexShrink: 0 }} />
                      {a}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ),
        )}

        {busy && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: colors.textFaint, fontSize: 12 }}>
            <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
            Editing…
          </div>
        )}
      </div>

      {/* composer */}
      <div style={{ padding: '12px 16px 8px', borderTop: `1px solid ${colors.border7}` }}>
        <div
          style={{
            background: colors.card,
            border: `1px solid ${colors.border9}`,
            borderRadius: 12,
            padding: '10px 12px',
          }}
        >
          <textarea
            rows={2}
            placeholder="Ask Deep Video Agent to edit your video…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              color: colors.text,
              fontSize: 13,
              lineHeight: 1.45,
              minHeight: 38,
              resize: 'none',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
            <span
              title="Which brain answers: OpenRouter (tencent/hy3:free) → local Ollama → offline command mode"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: colors.chip,
                border: `1px solid ${colors.border8}`,
                borderRadius: 8,
                padding: '5px 10px',
                color: colors.textSoft,
                fontSize: 12,
              }}
            >
              <Bot size={14} color={colors.textDim} />
              {backend ? BACKEND_LABEL[backend] ?? 'Agent' : 'Agent'}
            </span>
            <button
              onClick={() => void send()}
              disabled={busy || !input.trim()}
              className="hv-blue"
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: colors.accent,
                border: 'none',
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer',
                opacity: busy || !input.trim() ? 0.5 : 1,
              }}
            >
              <ArrowUp size={16} />
            </button>
          </div>
        </div>
        <div style={{ fontSize: 10, color: colors.textGhost, textAlign: 'center', marginTop: 6 }}>
          Deep Video Agent is in early Beta and may make mistakes.
        </div>
      </div>
    </div>
  );
}
