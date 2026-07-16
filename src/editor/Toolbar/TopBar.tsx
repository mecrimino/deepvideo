import { Clapperboard, Info, Loader2, PanelRight, Share2 } from 'lucide-react';
import { Avatar } from '../../components/Avatar';
import { GradientLogo } from '../../components/GradientLogo';
import { toolIcons } from '../../data/tools';
import { useAppStore } from '../../store/useAppStore';
import { useEditorStore } from '../../store/useEditorStore';
import { colors, gradients } from '../../theme';

export function TopBar() {
  const go = useAppStore((s) => s.go);
  const showChat = useAppStore((s) => s.showChat);
  const toggleChat = useAppStore((s) => s.toggleChat);
  const title = useEditorStore((s) => s.projectTitle);
  const renderJob = useEditorStore((s) => s.renderJob);
  const requestRender = useEditorStore((s) => s.requestRender);
  const rendering = renderJob?.status === 'running' || renderJob?.status === 'queued';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '7px 12px',
        borderBottom: `1px solid ${colors.border7}`,
        flexShrink: 0,
        background: colors.bgBar,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <button
          onClick={() => go('home')}
          className="hv-panel"
          style={{
            background: 'transparent',
            border: 'none',
            padding: '5px 8px 5px 4px',
            borderRadius: 8,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <GradientLogo size={20} radius={6} />
        </button>
        <div
          style={{
            width: 1,
            height: 20,
            background: colors.border10,
            margin: '0 5px',
          }}
        />
        {toolIcons.map((Icon, i) => (
          <button
            key={i}
            className="hv-rail"
            style={{
              width: 32,
              height: 32,
              borderRadius: 7,
              background: 'transparent',
              border: 'none',
              color: colors.textDim,
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <Icon size={16} />
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 7, maxWidth: 420 }}>
        <span
          style={{
            fontSize: 13,
            color: colors.textMid,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </span>
        <Info size={14} color={colors.textGhost} style={{ flexShrink: 0 }} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Avatar size={26} border={`2px solid ${colors.bgBar}`} />
        <Avatar
          size={26}
          gradient={gradients.avatar2}
          border={`2px solid ${colors.bgBar}`}
          style={{ marginLeft: -14 }}
        />
        <button
          className="hv-rail"
          style={{
            width: 32,
            height: 32,
            borderRadius: 7,
            background: 'transparent',
            border: 'none',
            color: colors.textDim,
            display: 'grid',
            placeItems: 'center',
            marginLeft: 4,
          }}
        >
          <Share2 size={16} />
        </button>
        {renderJob?.status === 'done' && renderJob.url ? (
          <a
            href={renderJob.url}
            download
            target="_blank"
            rel="noreferrer"
            className="hv-blue"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: '7px 14px',
              borderRadius: 9,
              background: '#2e8a4f',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            <Clapperboard size={15} />
            Download video
          </a>
        ) : (
          <button
            className="hv-blue"
            onClick={() => void requestRender()}
            disabled={rendering}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: '7px 14px',
              borderRadius: 9,
              background: colors.accent,
              border: 'none',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              opacity: rendering ? 0.75 : 1,
              cursor: rendering ? 'default' : 'pointer',
            }}
          >
            {rendering ? (
              <>
                <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
                Rendering {Math.round((renderJob?.progress ?? 0) * 100)}%
              </>
            ) : (
              <>
                <Clapperboard size={15} />
                Render video
              </>
            )}
          </button>
        )}
        <button
          onClick={toggleChat}
          title="Toggle Deep Video Agent panel"
          className={showChat ? undefined : 'hv-rail'}
          style={{
            width: 32,
            height: 32,
            borderRadius: 7,
            background: showChat ? 'rgba(47,107,255,.16)' : 'transparent',
            border: 'none',
            color: showChat ? '#6f9bff' : colors.textDim,
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
          }}
        >
          <PanelRight size={16} />
        </button>
      </div>
    </div>
  );
}
