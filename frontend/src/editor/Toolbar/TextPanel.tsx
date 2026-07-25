/**
 * Captions panel: add a caption at the playhead, edit the selected caption's
 * text, jump to / delete any cue.
 */

import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useEditorStore } from '../../stores/useEditorStore';
import { colors, fontMono } from '../../styles/theme';
import { formatDuration } from '../../utils/format';

export function TextPanel() {
  const timeline = useEditorStore((s) => s.timeline);
  const selectedCueId = useEditorStore((s) => s.selectedCueId);
  const selectCue = useEditorStore((s) => s.selectCue);
  const setPlayhead = useEditorStore((s) => s.setPlayhead);
  const addCaptionAtPlayhead = useEditorStore((s) => s.addCaptionAtPlayhead);
  const updateCaption = useEditorStore((s) => s.updateCaption);
  const deleteCaption = useEditorStore((s) => s.deleteCaption);
  const [draft, setDraft] = useState('');

  const cues = timeline?.captions ?? [];
  const selected = cues.find((c) => c.id === selectedCueId) ?? null;

  return (
    <div
      style={{
        width: 232,
        flexShrink: 0,
        borderRight: `1px solid ${colors.border7}`,
        background: colors.bgBar,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <div style={{ padding: '12px 12px 8px', fontSize: 13, fontWeight: 600 }}>Captions</div>

      <div style={{ padding: '0 12px 10px', display: 'flex', gap: 6 }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && draft.trim()) {
              addCaptionAtPlayhead(draft.trim());
              setDraft('');
            }
          }}
          placeholder="New caption text…"
          style={{
            flex: 1,
            background: colors.card,
            border: `1px solid ${colors.border8}`,
            borderRadius: 8,
            color: colors.text,
            fontSize: 12,
            padding: '7px 9px',
          }}
        />
        <button
          className="hv-blue"
          onClick={() => {
            if (draft.trim()) {
              addCaptionAtPlayhead(draft.trim());
              setDraft('');
            }
          }}
          title="Add at playhead"
          style={{
            width: 32,
            borderRadius: 8,
            background: colors.accent,
            border: 'none',
            color: '#fff',
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
          }}
        >
          <Plus size={14} />
        </button>
      </div>

      {selected && (
        <div style={{ padding: '0 12px 10px' }}>
          <div style={{ fontSize: 10.5, color: colors.textGhost, marginBottom: 4 }}>Edit selected</div>
          <textarea
            value={selected.text}
            onChange={(e) => updateCaption(selected.id, e.target.value)}
            rows={2}
            style={{
              width: '100%',
              background: colors.card,
              border: `1px solid ${colors.accent}`,
              borderRadius: 8,
              color: colors.text,
              fontSize: 12,
              padding: '7px 9px',
              resize: 'vertical',
            }}
          />
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px', minHeight: 0 }}>
        {cues.length === 0 && (
          <div style={{ fontSize: 11.5, color: colors.textGhost, lineHeight: 1.5 }}>
            No captions yet. Type above and press Enter to add one at the playhead.
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {cues.map((cue) => (
            <div
              key={cue.id}
              onClick={() => {
                selectCue(cue.id);
                setPlayhead(cue.range.startSec);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                background: cue.id === selectedCueId ? 'rgba(47,107,255,.14)' : colors.card,
                border: `1px solid ${cue.id === selectedCueId ? colors.accent : colors.border8}`,
                borderRadius: 8,
                padding: '6px 8px',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontFamily: fontMono, fontSize: 9.5, color: colors.textMono, flexShrink: 0 }}>
                {formatDuration(cue.range.startSec)}
              </span>
              <span
                style={{
                  flex: 1,
                  fontSize: 11,
                  color: colors.textDim,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {cue.text}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteCaption(cue.id);
                }}
                title="Delete caption"
                style={{ background: 'transparent', border: 'none', color: colors.textGhost, cursor: 'pointer', padding: 2 }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
