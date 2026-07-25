/**
 * Director planning chat — the pre-production conversation. You describe the
 * idea, the Director proposes a concept (angle, length, style, hook, script),
 * and you refine it together. Nothing is produced until you say "generate"; only
 * then does the agreed script hand off to the pipeline (verbatim, no re-writing).
 */

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUp, Clapperboard, Sparkles } from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';
import { colors, gradients } from '../styles/theme';

export function PlanScreen() {
  const messages = useAppStore((s) => s.planMessages);
  const plan = useAppStore((s) => s.plan);
  const planReady = useAppStore((s) => s.planReady);
  const planBusy = useAppStore((s) => s.planBusy);
  const planError = useAppStore((s) => s.planError);
  const send = useAppStore((s) => s.sendPlanMessage);
  const generate = useAppStore((s) => s.generateFromPlan);
  const cancel = useAppStore((s) => s.cancelPlanning);

  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // keep the newest message in view — after layout settles (plan cards are tall)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() =>
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }),
    );
    return () => cancelAnimationFrame(id);
  }, [messages, plan, planBusy]);

  void planReady; // production is an explicit action (the Generate button) now
  const canGenerate = !!plan?.script && !planBusy;

  const pick = (topic: string) => send(topic);

  const submit = () => {
    const t = draft.trim();
    if (!t) return;
    send(t);
    setDraft('');
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        height: '100dvh',
        background: gradients.homeHero,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        overflow: 'hidden',
      }}
    >
      {/* header */}
      <div
        style={{
          flexShrink: 0,
          width: '100%',
          maxWidth: 900,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '20px 24px 8px',
        }}
      >
        <button
          onClick={cancel}
          className="hv-dark"
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: colors.control,
            border: `1px solid ${colors.border9}`,
            color: colors.textSoft,
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
          }}
          title="Back"
        >
          <ArrowLeft size={18} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{ width: 22, height: 22, borderRadius: 7, background: gradients.brand }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
            <span style={{ fontWeight: 600, fontSize: 15, color: colors.text }}>
              Plan with the Director
            </span>
            <span style={{ fontSize: 12, color: colors.textFaint }}>
              Talk it through — it generates only when you say so
            </span>
          </div>
        </div>
      </div>

      {/* conversation */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          minHeight: 0,
          width: '100%',
          maxWidth: 900,
          overflowY: 'auto',
          padding: '12px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} style={{ alignSelf: 'flex-end', maxWidth: '78%' }}>
              <div
                style={{
                  background: colors.raised,
                  border: `1px solid ${colors.border9}`,
                  borderRadius: 16,
                  padding: '12px 16px',
                  color: colors.text,
                  fontSize: 15,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {m.content}
              </div>
            </div>
          ) : (
            <div key={i} style={{ alignSelf: 'flex-start', maxWidth: '86%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                <Sparkles size={14} color={colors.gold} />
                <span style={{ fontSize: 12.5, color: colors.textFaint }}>Director</span>
              </div>
              <div
                style={{
                  color: colors.textSoft,
                  fontSize: 15,
                  lineHeight: 1.55,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {m.content}
              </div>
            </div>
          ),
        )}

        {planBusy && (
          <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={14} color={colors.gold} />
            <span style={{ fontSize: 13, color: colors.textFaint }}>Director is thinking…</span>
          </div>
        )}

        {planError && (
          <div style={{ alignSelf: 'flex-start', fontSize: 13, color: colors.playhead }}>
            {planError}
          </div>
        )}

        {/* the evolving plan */}
        {plan && <PlanCard plan={plan} onPick={pick} />}
      </div>

      {/* composer */}
      <div style={{ flexShrink: 0, width: '100%', maxWidth: 900, padding: '8px 24px 24px' }}>
        {canGenerate && (
          <button
            onClick={generate}
            className="hv-blue"
            style={{
              width: '100%',
              marginBottom: 10,
              padding: '13px',
              borderRadius: 14,
              border: 'none',
              background: gradients.brand,
              color: '#fff',
              fontSize: 15,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              cursor: 'pointer',
            }}
          >
            <Clapperboard size={18} /> Generate this video
          </button>
        )}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 10,
            background: colors.panel,
            border: `1px solid ${colors.border9}`,
            borderRadius: 18,
            padding: 12,
          }}
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={placeholderFor(plan?.stage)}
            rows={1}
            style={{
              flex: 1,
              resize: 'none',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: colors.text,
              fontSize: 15,
              lineHeight: 1.5,
              maxHeight: 140,
              fontFamily: 'inherit',
            }}
          />
          <button
            onClick={submit}
            disabled={!draft.trim() || planBusy}
            className="hv-blue"
            style={{
              width: 38,
              height: 38,
              borderRadius: '50%',
              background: draft.trim() ? colors.accent : colors.control,
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
              border: 'none',
              cursor: draft.trim() ? 'pointer' : 'default',
              flexShrink: 0,
            }}
          >
            <ArrowUp size={19} />
          </button>
        </div>
      </div>
    </div>
  );
}

type Plan = NonNullable<ReturnType<typeof useAppStore.getState>['plan']>;

function placeholderFor(stage: Plan['stage'] | undefined): string {
  switch (stage) {
    case 'topic':
      return 'Pick a topic above — or type your own';
    case 'length':
      return 'How long? e.g. “24 minutes” or “~18000 characters”';
    case 'outline':
      return 'Say “looks good” to write the script — or ask for changes';
    case 'script':
      return 'Tweak the script, or hit Generate this video';
    default:
      return 'Describe your video…';
  }
}

function fmtLen(plan: Plan): string | null {
  if (plan.lengthSec == null && plan.targetChars == null) return null;
  const bits: string[] = [];
  if (plan.lengthSec != null) {
    bits.push(plan.lengthSec >= 90 ? `~${Math.round(plan.lengthSec / 60)} min` : `~${plan.lengthSec}s`);
  }
  if (plan.targetChars != null) bits.push(`${plan.targetChars.toLocaleString()} chars`);
  return bits.join(' · ');
}

function PlanCard({ plan, onPick }: { plan: Plan; onPick: (t: string) => void }) {
  // Stage 1 — a row of clickable topic suggestions.
  if (plan.stage === 'topic' && plan.topicOptions.length > 0) {
    return (
      <div style={cardStyle}>
        <div style={{ fontSize: 11.5, color: colors.textFaint, marginBottom: 10, letterSpacing: 0.4 }}>
          PICK A TOPIC
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {plan.topicOptions.map((t, i) => (
            <button
              key={i}
              onClick={() => onPick(t)}
              className="hv-dark"
              style={{
                textAlign: 'left',
                background: colors.raised,
                border: `1px solid ${colors.border9}`,
                borderRadius: 12,
                padding: '12px 14px',
                color: colors.textSoft,
                fontSize: 14.5,
                cursor: 'pointer',
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const len = fmtLen(plan);
  const showOutline = plan.outline.length > 0;
  const showScript = plan.script.length > 0;
  if (!plan.title && !len && !showOutline && !showScript) return null;

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Clapperboard size={16} color={colors.accent} />
        <span style={{ fontSize: 14.5, fontWeight: 600, color: colors.text }}>
          {plan.title || 'Video plan'}
        </span>
        <div style={{ flex: 1 }} />
        {len && <Meta label={len} />}
        {showOutline && <Meta label={`${plan.outline.length} sections`} />}
      </div>

      {(plan.angle || plan.style || plan.hook) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: showOutline ? 14 : 0 }}>
          {plan.angle && <Field label="Angle" value={plan.angle} />}
          {plan.style && <Field label="Style" value={plan.style} />}
          {plan.hook && <Field label="Hook" value={plan.hook} />}
        </div>
      )}

      {showOutline && (
        <div>
          <div style={{ fontSize: 11.5, color: colors.textFaint, marginBottom: 7, letterSpacing: 0.4 }}>
            OUTLINE
          </div>
          <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 5 }}>
            {plan.outline.map((b, i) => (
              <li key={i} style={{ fontSize: 13.5, color: colors.textMid, lineHeight: 1.45 }}>
                {b}
              </li>
            ))}
          </ol>
        </div>
      )}

      {showScript && (
        <div style={{ marginTop: 16 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 7,
            }}
          >
            <span style={{ fontSize: 11.5, color: colors.textFaint, letterSpacing: 0.4 }}>SCRIPT</span>
            <span style={{ fontSize: 11.5, color: colors.textFaint, fontFamily: 'ui-monospace,monospace' }}>
              {plan.script.length.toLocaleString()} chars
            </span>
          </div>
          <div
            style={{
              maxHeight: 220,
              overflowY: 'auto',
              background: colors.raised,
              border: `1px solid ${colors.border8}`,
              borderRadius: 12,
              padding: 14,
              fontSize: 13.5,
              lineHeight: 1.6,
              color: colors.textSoft,
              whiteSpace: 'pre-wrap',
            }}
          >
            {plan.script}
          </div>
        </div>
      )}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  alignSelf: 'stretch',
  background: colors.card,
  border: `1px solid ${colors.border8}`,
  borderRadius: 16,
  padding: 18,
  marginTop: 4,
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <span style={{ fontSize: 12.5, color: colors.textFaint, width: 52, flexShrink: 0, paddingTop: 1 }}>
        {label}
      </span>
      <span style={{ fontSize: 13.5, color: colors.textSoft, lineHeight: 1.45 }}>{value}</span>
    </div>
  );
}

function Meta({ label }: { label: string }) {
  return (
    <span
      style={{
        fontSize: 11.5,
        color: colors.textMid,
        background: colors.control,
        border: `1px solid ${colors.border8}`,
        borderRadius: 20,
        padding: '3px 10px',
        fontFamily: 'ui-monospace,monospace',
      }}
    >
      {label}
    </span>
  );
}
