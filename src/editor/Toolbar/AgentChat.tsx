import { ArrowUp, Bot, ChevronDown, Info, Plus } from 'lucide-react';
import { colors, gradients } from '../../theme';

/** Right-hand "Rush Agent" chat column. */
export function AgentChat() {
  const iconBtn: React.CSSProperties = {
    width: 28,
    height: 28,
    borderRadius: 7,
    background: 'transparent',
    border: 'none',
    color: colors.textDim,
    display: 'grid',
    placeItems: 'center',
  };

  return (
    <div
      style={{
        width: 312,
        flexShrink: 0,
        borderLeft: `1px solid ${colors.border7}`,
        display: 'flex',
        flexDirection: 'column',
        background: colors.bgBar,
        minHeight: 0,
      }}
    >
      {/* header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '12px 14px',
          borderBottom: `1px solid ${colors.border7}`,
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          Regenerate image with chart removal and…
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <button className="hv-rail" style={iconBtn}>
            <Plus size={16} />
          </button>
          <button className="hv-rail" style={iconBtn}>
            <Info size={15} />
          </button>
        </div>
      </div>

      {/* messages */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          minHeight: 0,
        }}
      >
        <div style={{ alignSelf: 'flex-end', maxWidth: '88%' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              justifyContent: 'flex-end',
              marginBottom: 6,
            }}
          >
            <span style={{ fontSize: 11, color: colors.textFaint }}>jet-mig-25</span>
            <span
              style={{
                width: 20,
                height: 20,
                borderRadius: 5,
                background: gradients.chatThumb,
                display: 'inline-block',
              }}
            />
          </div>
          <div
            style={{
              background: '#1e2635',
              border: '1px solid rgba(90,130,220,.25)',
              borderRadius: '12px 12px 4px 12px',
              padding: '10px 12px',
              fontSize: 13,
              color: '#dbe2ef',
              lineHeight: 1.5,
            }}
          >
            regenerate this image, remove the charts onto the plane, and make the image colored
          </div>
        </div>

        <div style={{ alignSelf: 'flex-start', maxWidth: '92%' }}>
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
            <span style={{ fontSize: 11, color: colors.textFaint }}>Rush Agent</span>
          </div>
          <div style={{ fontSize: 13, color: colors.textMid, lineHeight: 1.6 }}>
            I've updated the image overlay for you. I generated a new, full-color version of the
            MIG-25 aircraft flying through the clouds, with the technical charts and annotations
            removed. The updated image is now in place on your timeline.
          </div>
        </div>
      </div>

      {/* composer */}
      <div style={{ padding: '12px 14px', borderTop: `1px solid ${colors.border7}` }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: colors.panel,
            border: `1px solid ${colors.border8}`,
            borderRadius: 9,
            padding: '7px 10px',
            marginBottom: 9,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              fontSize: 11.5,
              color: colors.textMid,
            }}
          >
            <span
              style={{
                width: 9,
                height: 9,
                background: '#7b5cff',
                display: 'inline-block',
                transform: 'rotate(45deg)',
              }}
            />
            Rush Creative Level · 4,321
          </div>
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              color: '#ffbd45',
              background: 'rgba(255,189,69,.12)',
              padding: '2px 8px',
              borderRadius: 999,
            }}
          >
            Early Bee
          </span>
        </div>
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
            placeholder="Ask Rush Agent to edit your video…"
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              color: colors.text,
              fontSize: 13,
              lineHeight: 1.45,
              minHeight: 38,
            }}
          />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 6,
            }}
          >
            <button
              className="hv-row"
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
              Agent
              <ChevronDown size={13} color={colors.textFaint} />
            </button>
            <button
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
              }}
            >
              <ArrowUp size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
