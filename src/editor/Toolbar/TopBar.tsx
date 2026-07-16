import { Clapperboard, Info, PanelRight, Share2 } from 'lucide-react';
import { Avatar } from '../../components/Avatar';
import { GradientLogo } from '../../components/GradientLogo';
import { toolIcons } from '../../data/tools';
import { useAppStore } from '../../store/useAppStore';
import { colors, gradients } from '../../theme';

const PROJECT_TITLE = 'Fastest Fighter Jets Ever: Countdown of the Top 7 Supersonic Legends';

export function TopBar() {
  const go = useAppStore((s) => s.go);

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
          {PROJECT_TITLE}
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
        <button
          className="hv-blue"
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
          }}
        >
          <Clapperboard size={15} />
          Render video
        </button>
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
          }}
        >
          <PanelRight size={16} />
        </button>
      </div>
    </div>
  );
}
