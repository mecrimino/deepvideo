/**
 * Right-hand scene inspector (Rive-style): sectioned property rows for the
 * open timeline. Everything here edits the REAL document — frame size and fps
 * drive both the preview aspect and the ffmpeg render, and every change is
 * undoable through the store's history.
 */

import { Clock, Frame, Layers } from 'lucide-react';
import { useEffect, useState } from 'react';
import { audioLanes, laneTracks, useEditorStore } from '../../stores/useEditorStore';
import { colors } from '../../styles/theme';

const PRESETS: { label: string; w: number; h: number }[] = [
  { label: '1920 x 1080', w: 1920, h: 1080 },
  { label: '1280 x 720', w: 1280, h: 720 },
  { label: '1080 x 1920', w: 1080, h: 1920 },
  { label: '1080 x 1080', w: 1080, h: 1080 },
  { label: '854 x 480', w: 854, h: 480 },
];

const boxStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  background: colors.card,
  border: `1px solid ${colors.border7}`,
  borderRadius: 6,
  height: 30,
  overflow: 'hidden',
};

const fieldStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  background: 'transparent',
  border: 'none',
  outline: 'none',
  color: colors.textBright,
  fontSize: 12,
  fontWeight: 500,
  padding: '0 9px',
  height: '100%',
};

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ padding: '13px 12px', borderBottom: `1px solid ${colors.border7}` }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 11,
          fontSize: 12.5,
          fontWeight: 700,
          color: colors.textBright,
        }}
      >
        <span style={{ color: colors.textFaint, display: 'grid', placeItems: 'center' }}>{icon}</span>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </div>
  );
}

/** Label + value line for read-only facts. */
function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11.5 }}>
      <span style={{ color: colors.textFaint }}>{k}</span>
      <span style={{ color: colors.textMid, fontWeight: 500 }}>{v}</span>
    </div>
  );
}

/** A number field that only commits on blur/Enter, so typing never fights you. */
function NumField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (n: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = Number(draft);
    if (Number.isFinite(n) && n > 0) onCommit(n);
    else setDraft(String(value));
  };
  return (
    <>
      <span style={{ fontSize: 11, color: colors.textGhost, paddingLeft: 9 }}>{label}</span>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit();
            (e.target as HTMLInputElement).blur();
          }
        }}
        style={{ ...fieldStyle, paddingLeft: 6 }}
      />
    </>
  );
}

export function Inspector() {
  const timeline = useEditorStore((s) => s.timeline);
  const title = useEditorStore((s) => s.projectTitle);
  const setProjectTitle = useEditorStore((s) => s.setProjectTitle);
  const setSceneSize = useEditorStore((s) => s.setSceneSize);
  const setFps = useEditorStore((s) => s.setFps);

  const [titleDraft, setTitleDraft] = useState(title);
  useEffect(() => setTitleDraft(title), [title]);

  if (!timeline) return null;

  const { width, height, fps, durationSec } = timeline;
  const preset = PRESETS.find((p) => p.w === width && p.h === height)?.label ?? 'Custom';
  const visual = laneTracks(timeline);
  const audio = audioLanes(timeline);
  const clips = timeline.tracks.reduce((n, t) => n + t.clips.length, 0);
  const mins = Math.floor(durationSec / 60);
  const secs = Math.floor(durationSec % 60);

  return (
    <div
      style={{
        width: 232,
        flexShrink: 0,
        borderLeft: `1px solid ${colors.border7}`,
        background: colors.bgBar,
        overflowY: 'auto',
        minHeight: 0,
      }}
    >
      <Section icon={<Frame size={13} />} title="Scene">
        <div style={boxStyle}>
          <input
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => setProjectTitle(titleDraft)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            title="Project name"
            style={fieldStyle}
          />
        </div>

        <select
          value={preset}
          onChange={(e) => {
            const p = PRESETS.find((x) => x.label === e.target.value);
            if (p) setSceneSize(p.w, p.h);
          }}
          style={{
            ...boxStyle,
            ...fieldStyle,
            width: '100%',
            appearance: 'none',
            cursor: 'pointer',
            padding: '0 9px',
          }}
        >
          {preset === 'Custom' && <option>Custom</option>}
          {PRESETS.map((p) => (
            <option key={p.label} value={p.label}>
              {p.label}
            </option>
          ))}
        </select>

        <div style={boxStyle}>
          <NumField label="W" value={width} onCommit={(n) => setSceneSize(n, height)} />
          <div style={{ width: 1, height: '100%', background: colors.border8 }} />
          <NumField label="H" value={height} onCommit={(n) => setSceneSize(width, n)} />
        </div>
      </Section>

      <Section icon={<Clock size={13} />} title="Time">
        <div style={boxStyle}>
          <span style={{ fontSize: 11, color: colors.textGhost, paddingLeft: 9 }}>Duration</span>
          <span
            style={{
              flex: 1,
              textAlign: 'right',
              paddingRight: 9,
              fontSize: 12,
              color: colors.textBright,
              fontWeight: 500,
            }}
          >
            {mins}:{String(secs).padStart(2, '0')}
          </span>
          <div style={{ width: 1, height: '100%', background: colors.border8 }} />
          <NumField label="FPS" value={fps} onCommit={setFps} />
        </div>
      </Section>

      <Section icon={<Layers size={13} />} title="Content">
        <Stat k="Visual layers" v={String(visual.length)} />
        <Stat k="Audio lanes" v={String(audio.length)} />
        <Stat k="Clips" v={String(clips)} />
        <Stat k="Captions" v={String(timeline.captions.length)} />
        <Stat k="Frames" v={String(Math.round(durationSec * fps))} />
      </Section>
    </div>
  );
}
