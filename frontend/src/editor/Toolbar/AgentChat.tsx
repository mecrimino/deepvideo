/**
 * Right-hand "Deep Video Agent" chat column — full window height. Matches the
 * reference agent UI:
 *  - "New chat" header with history/new-chat control
 *  - welcome block + suggestion cards anchored above the composer
 *  - clip MENTION CHIPS in the composer (thumbnail · label · #index · ×),
 *    added from the timeline's "Add to Deep Video Agent" pill or Ctrl+L
 *  - Agent chip + a real EFFORT picker (Fast = quick library-only edits,
 *    Smart = deeper work incl. stock downloads; Smart costs 1 credit)
 *  - send turns into a STOP button while the agent thinks (aborts the request)
 *  - "Total Credits Used" strip tracking real session spend
 * Messages go to POST /api/agent/chat with the current timeline; returned
 * timelines are applied to the editor (undoable).
 */

import { ArrowUp, Bot, ChevronDown, Loader2, Plus, Repeat, Sparkles, Square, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { AgentMention } from '@deep-vision/shared';
import { spendCredits } from '../../utils/credits';
import { agentChat } from '../../services/agent';
import { useEditorStore, type ChatMention } from '../../stores/useEditorStore';
import { colors, gradients } from '../../styles/theme';

const SUGGESTIONS = [
  'Explain what Deep Video Agent can do, and how I can use you most effectively.',
  'Regenerate the clips from 0:00 to 0:30 with fresh footage',
  'Find a better alternative for clip 1',
];

const BACKEND_LABEL: Record<string, string> = {
  openrouter: 'hy3 (OpenRouter)',
  ollama: 'Ollama',
  commands: 'command mode',
};

const SMART_COST = 1; // credits per Smart message; Fast is free

interface Message {
  role: 'user' | 'agent';
  text: string;
  mentions?: ChatMention[];
  actions?: string[];
}

function MentionChip({
  m,
  onRemove,
  small,
}: {
  m: ChatMention;
  onRemove?: () => void;
  small?: boolean;
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        background: 'rgba(72,111,255,.22)',
        border: '1px solid rgba(97,132,255,.5)',
        borderRadius: 6,
        padding: small ? '1px 6px 1px 2px' : '2px 7px 2px 3px',
        maxWidth: 200,
        verticalAlign: 'middle',
      }}
    >
      {m.thumb ? (
        <img
          src={m.thumb}
          alt=""
          style={{ width: small ? 16 : 20, height: small ? 12 : 14, objectFit: 'cover', borderRadius: 3 }}
        />
      ) : (
        <span
          style={{
            width: small ? 16 : 20,
            height: small ? 12 : 14,
            borderRadius: 3,
            background: gradients.elementTrack,
            display: 'inline-block',
          }}
        />
      )}
      <span
        style={{
          fontSize: small ? 10.5 : 11.5,
          color: '#bcd0ff',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: 110,
        }}
      >
        {m.label}
      </span>
      <span style={{ fontSize: small ? 9.5 : 10.5, color: '#7f96d9', flexShrink: 0 }}>#{m.index}</span>
      {onRemove && (
        <button
          onClick={onRemove}
          title="Remove"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#7f96d9',
            cursor: 'pointer',
            padding: 0,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <X size={11} />
        </button>
      )}
    </span>
  );
}

export function AgentChat() {
  const timeline = useEditorStore((s) => s.timeline);
  const applyTimeline = useEditorStore((s) => s.applyTimeline);
  const mentions = useEditorStore((s) => s.chatMentions);
  const removeMention = useEditorStore((s) => s.removeMention);
  const clearMentions = useEditorStore((s) => s.clearMentions);
  const openReplace = useEditorStore((s) => s.openReplace);
  const agentW = useEditorStore((s) => s.agentW);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [backend, setBackend] = useState<string | null>(null);
  const [effort, setEffort] = useState<'fast' | 'smart'>('smart');
  const [effortOpen, setEffortOpen] = useState(false);
  const [creditsUsed, setCreditsUsed] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [messages, busy]);

  const stop = () => {
    abortRef.current?.abort();
  };

  const send = async (text?: string) => {
    const raw = (text ?? input).trim();
    if ((!raw && mentions.length === 0) || busy || !timeline) return;
    const sentMentions = [...mentions];
    const apiMentions: AgentMention[] = sentMentions.map(({ clipId, index, label }) => ({
      clipId,
      index,
      label,
    }));
    const message =
      sentMentions.length > 0 && raw
        ? raw
        : raw || `Look at ${sentMentions.map((m) => `clip #${m.index}`).join(', ')}.`;

    setInput('');
    clearMentions();
    setMessages((m) => [...m, { role: 'user', text: message, mentions: sentMentions }]);
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await agentChat(
        { message, timeline, mentions: apiMentions, effort },
        controller.signal,
      );
      if (res.timeline) applyTimeline(res.timeline);
      if (res.backend) setBackend(res.backend);
      if (effort === 'smart') {
        spendCredits(SMART_COST);
        setCreditsUsed((c) => c + SMART_COST);
      }
      setMessages((m) => [...m, { role: 'agent', text: res.reply, actions: res.actions }]);
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === 'AbortError';
      setMessages((m) => [
        ...m,
        {
          role: 'agent',
          text: aborted
            ? 'Stopped.'
            : `I couldn't reach the local server: ${err instanceof Error ? err.message : err}`,
        },
      ]);
    } finally {
      abortRef.current = null;
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

  const pickerChip: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    background: 'transparent',
    border: 'none',
    color: colors.textDim,
    fontSize: 12.5,
    cursor: 'pointer',
    padding: '3px 4px',
  };

  return (
    <div
      className="glass"
      style={{
        // Thin column like the reference editor; drag the left-edge handle to resize.
        width: agentW,
        flexShrink: 0,
        borderLeft: `1px solid ${colors.border7}`,
        display: 'flex',
        flexDirection: 'column',
        background: colors.bgBar,
        minHeight: 0,
        position: 'relative',
      }}
    >
      {/* left-edge resize handle */}
      <div
        onPointerDown={(e) => {
          e.preventDefault();
          const startX = e.clientX;
          const startW = useEditorStore.getState().agentW;
          const move = (ev: PointerEvent) =>
            useEditorStore.getState().setAgentW(startW + (startX - ev.clientX));
          const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
        }}
        title="Drag to resize the agent panel"
        style={{
          position: 'absolute',
          left: -4,
          top: 0,
          bottom: 0,
          width: 9,
          cursor: 'ew-resize',
          zIndex: 8,
          display: 'grid',
          placeItems: 'center',
          touchAction: 'none',
        }}
      >
        <div style={{ width: 4, height: 38, borderRadius: 3, background: '#3a3a42' }} />
      </div>
      {/* header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '10px 13px',
          borderBottom: `1px solid ${colors.border7}`,
        }}
      >
        <span style={{ fontSize: 12.5, fontWeight: 600, color: colors.textSoft }}>New chat</span>
        {messages.length > 0 && (
          <button
            onClick={() => {
              setMessages([]);
              setCreditsUsed(0);
            }}
            className="hv-rail"
            style={iconBtn}
            title="New chat"
          >
            <Plus size={16} />
          </button>
        )}
      </div>

      {/* body — welcome + suggestions sit at the BOTTOM, like the reference */}
      <div
        ref={bodyRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '14px 13px 8px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: messages.length === 0 ? 'flex-end' : 'flex-start',
          gap: 10,
          minHeight: 0,
        }}
      >
        {messages.length === 0 && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 6 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Deep Video Agent</div>
              <div
                style={{
                  fontSize: 11.5,
                  color: colors.textFaint,
                  lineHeight: 1.5,
                  marginTop: 5,
                  maxWidth: 230,
                  marginLeft: 'auto',
                  marginRight: 'auto',
                }}
              >
                Ask me to edit your timeline, add effects, or improve your cut.
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
                  borderRadius: 9,
                  padding: '8px 11px',
                  fontSize: 11.5,
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

        {messages.length > 0 && (
          <div style={{ fontSize: 10.5, color: colors.textGhost }}>just now</div>
        )}
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} style={{ alignSelf: 'flex-end', maxWidth: '92%' }}>
              <div
                style={{
                  background: '#1e2635',
                  border: '1px solid rgba(90,130,220,.25)',
                  borderRadius: '12px 12px 4px 12px',
                  padding: '9px 12px',
                  fontSize: 13,
                  color: '#dbe2ef',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {m.mentions?.map((men) => (
                  <span key={men.clipId} style={{ marginRight: 6 }}>
                    <MentionChip m={men} small />
                  </span>
                ))}
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
                      style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#8fb389' }}
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
            Thinking…
          </div>
        )}
      </div>

      {/* credits strip */}
      {(creditsUsed > 0 || messages.length > 0) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '5px 16px',
            fontSize: 10.5,
            color: colors.textGhost,
          }}
        >
          <span>Total Credits Used&nbsp;&nbsp;{creditsUsed.toFixed(3)}</span>
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 600,
              color: '#ffbd45',
              background: 'rgba(255,189,69,.12)',
              padding: '1px 7px',
              borderRadius: 999,
            }}
          >
            Early Beta
          </span>
        </div>
      )}

      {/* composer */}
      <div style={{ padding: '5px 13px 7px' }}>
        <div
          style={{
            background: colors.card,
            border: `1px solid ${colors.border9}`,
            borderRadius: 11,
            padding: '9px 10px',
            position: 'relative',
          }}
        >
          {/* mention chips */}
          {mentions.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 7 }}>
              {mentions.map((m) => (
                <MentionChip key={m.clipId} m={m} onRemove={() => removeMention(m.clipId)} />
              ))}
            </div>
          )}

          {/* auto suggestion: replace the attached clip with stock footage */}
          {mentions.length > 0 && (
            <button
              onClick={() => openReplace(mentions[mentions.length - 1].clipId)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                width: '100%',
                textAlign: 'left',
                marginBottom: 8,
                padding: '7px 9px',
                borderRadius: 8,
                background: 'rgba(47,107,255,.1)',
                border: '1px solid rgba(47,107,255,.32)',
                color: '#a9c3ff',
                fontSize: 11.5,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Repeat size={13} style={{ flexShrink: 0 }} />
              Find a replacement on Pexels & Pixabay
            </button>
          )}

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
              fontSize: 12,
              lineHeight: 1.45,
              minHeight: 32,
              resize: 'none',
            }}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
            <span
              title={`Which brain answers — currently ${backend ? BACKEND_LABEL[backend] ?? backend : 'hy3 (OpenRouter) → Ollama → command mode'}`}
              style={{ ...pickerChip, cursor: 'default' }}
            >
              <Bot size={14} color={colors.textDim} />
              Agent
              <ChevronDown size={12} color={colors.textGhost} />
            </span>

            {/* effort picker */}
            <span style={{ position: 'relative' }}>
              <button onClick={() => setEffortOpen((v) => !v)} style={pickerChip}>
                <span style={{ color: '#e8a33d', fontWeight: 600 }}>
                  {effort === 'fast' ? 'Fast' : 'Smart'}
                </span>
                <ChevronDown size={12} color={colors.textGhost} />
              </button>
              {effortOpen && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 30,
                    left: -8,
                    width: 230,
                    background: colors.raised,
                    border: `1px solid ${colors.border10}`,
                    borderRadius: 12,
                    padding: 6,
                    boxShadow: '0 18px 44px rgba(0,0,0,.55)',
                    zIndex: 9,
                  }}
                >
                  <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.08em', color: colors.textGhost, padding: '5px 9px 3px' }}>
                    EFFORT
                  </div>
                  {(
                    [
                      { key: 'fast', name: 'Fast', desc: 'Great for everyday edits · saves credits' },
                      { key: 'smart', name: 'Smart', desc: 'Deeper work on complex edits · costs more credits' },
                    ] as const
                  ).map((opt) => (
                    <div
                      key={opt.key}
                      className="hv-dark"
                      onClick={() => {
                        setEffort(opt.key);
                        setEffortOpen(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 8,
                        padding: '7px 9px',
                        borderRadius: 8,
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12.5, color: colors.textSoft, fontWeight: 600 }}>{opt.name}</div>
                        <div style={{ fontSize: 10.5, color: colors.textGhost, lineHeight: 1.4 }}>{opt.desc}</div>
                      </div>
                      {effort === opt.key && <span style={{ color: '#e8a33d', fontSize: 12 }}>✓</span>}
                    </div>
                  ))}
                </div>
              )}
            </span>

            <div style={{ flex: 1 }} />

            {busy ? (
              <button
                onClick={stop}
                title="Stop"
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  background: colors.raised,
                  border: `1px solid ${colors.border9}`,
                  color: colors.textMid,
                  display: 'grid',
                  placeItems: 'center',
                  cursor: 'pointer',
                }}
              >
                <Square size={12} fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={() => void send()}
                disabled={!input.trim() && mentions.length === 0}
                className="hv-blue"
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  background: colors.accent,
                  border: 'none',
                  color: '#fff',
                  display: 'grid',
                  placeItems: 'center',
                  cursor: 'pointer',
                  opacity: !input.trim() && mentions.length === 0 ? 0.45 : 1,
                }}
              >
                <ArrowUp size={15} />
              </button>
            )}
          </div>
        </div>
        <div style={{ fontSize: 9.5, color: colors.textGhost, textAlign: 'center', marginTop: 5 }}>
          Deep Video Agent is in early Beta. Results may be unstable.
        </div>
      </div>
    </div>
  );
}
