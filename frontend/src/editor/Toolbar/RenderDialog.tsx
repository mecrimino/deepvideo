/**
 * Render options dialog — opens from the "Render video" / export buttons.
 * Pick the output resolution and whether captions are burned into the video;
 * "Captions Off" renders a clean video with no subtitles.
 */

import { Captions, Clapperboard, X } from 'lucide-react';
import { useState } from 'react';
import { useEditorStore } from '../../stores/useEditorStore';
import { colors } from '../../styles/theme';

const RESOLUTIONS = [
  { label: '480p', sub: '854 × 480 · small file', width: 854, height: 480 },
  { label: '720p', sub: '1280 × 720 · recommended', width: 1280, height: 720 },
  { label: '1080p', sub: '1920 × 1080 · best quality', width: 1920, height: 1080 },
] as const;

export function RenderDialog() {
  const open = useEditorStore((s) => s.renderDialogOpen);
  const setOpen = useEditorStore((s) => s.setRenderDialogOpen);
  const requestRender = useEditorStore((s) => s.requestRender);
  const captionCount = useEditorStore((s) => s.timeline?.captions.length ?? 0);

  const [resIdx, setResIdx] = useState(1);
  const [burnCaptions, setBurnCaptions] = useState(true);

  if (!open) return null;
  const res = RESOLUTIONS[resIdx];

  return (
    <div
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.6)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 40,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(420px, 92vw)',
          background: colors.panel,
          border: `1px solid ${colors.border9}`,
          borderRadius: 16,
          padding: 18,
          boxShadow: '0 26px 70px rgba(0,0,0,.6)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clapperboard size={16} color={colors.textDim} />
            Render video
          </div>
          <button
            onClick={() => setOpen(false)}
            style={{ background: 'transparent', border: 'none', color: colors.textDim, cursor: 'pointer', padding: 2 }}
          >
            <X size={16} />
          </button>
        </div>

        {/* resolution */}
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: colors.textGhost, marginBottom: 7 }}>
          RESOLUTION
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
          {RESOLUTIONS.map((r, i) => (
            <button
              key={r.label}
              onClick={() => setResIdx(i)}
              style={{
                textAlign: 'left',
                background: i === resIdx ? 'rgba(47,107,255,.14)' : colors.card,
                border: `1px solid ${i === resIdx ? colors.accent : colors.border8}`,
                borderRadius: 10,
                padding: '9px 10px',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 13.5, fontWeight: 700, color: i === resIdx ? '#9db9ff' : colors.textSoft }}>
                {r.label}
              </div>
              <div style={{ fontSize: 9.5, color: colors.textGhost, marginTop: 3, lineHeight: 1.35 }}>{r.sub}</div>
            </button>
          ))}
        </div>

        {/* captions */}
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: colors.textGhost, marginBottom: 7 }}>
          CAPTIONS
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: colors.card,
            border: `1px solid ${colors.border8}`,
            borderRadius: 10,
            padding: '10px 12px',
            marginBottom: 18,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <Captions size={15} color={colors.textDim} />
            <div>
              <div style={{ fontSize: 12.5, color: colors.textSoft, fontWeight: 600 }}>
                Burn captions into the video
              </div>
              <div style={{ fontSize: 10.5, color: colors.textGhost, marginTop: 2 }}>
                {captionCount > 0
                  ? burnCaptions
                    ? `${captionCount} caption${captionCount === 1 ? '' : 's'} will appear in the export`
                    : 'Off — the export will have no subtitles'
                  : 'This timeline has no captions'}
              </div>
            </div>
          </div>
          <button
            onClick={() => setBurnCaptions((v) => !v)}
            title={burnCaptions ? 'Turn captions off' : 'Turn captions on'}
            style={{
              width: 40,
              height: 22,
              borderRadius: 999,
              border: 'none',
              background: burnCaptions ? colors.accent : '#3a3a44',
              position: 'relative',
              cursor: 'pointer',
              flexShrink: 0,
              transition: 'background .15s',
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: 2,
                left: burnCaptions ? 20 : 2,
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: '#fff',
                transition: 'left .15s',
              }}
            />
          </button>
        </div>

        {/* actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            onClick={() => setOpen(false)}
            className="hv-dark"
            style={{
              padding: '9px 16px',
              borderRadius: 9,
              background: colors.control,
              border: `1px solid ${colors.border9}`,
              color: colors.textSoft,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => void requestRender({ width: res.width, height: res.height, burnCaptions })}
            className="hv-blue"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: '9px 18px',
              borderRadius: 9,
              background: colors.accent,
              border: 'none',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Clapperboard size={14} />
            Render {res.label}
            {!burnCaptions && ' · no captions'}
          </button>
        </div>
      </div>
    </div>
  );
}
