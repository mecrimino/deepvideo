/**
 * Narrow icon rail on the editor's far left. Toggles the media library,
 * captions panel, animation settings card, and the Agent v1 chat.
 */

import { Film, Music, SlidersHorizontal, Type, WandSparkles, X } from 'lucide-react';
import { useAppStore } from '../../stores/useAppStore';
import { useEditorStore } from '../../stores/useEditorStore';
import { colors } from '../../styles/theme';

export function IconRail() {
  const showSettings = useAppStore((s) => s.showSettings);
  const toggleSettings = useAppStore((s) => s.toggleSettings);
  const closeSettings = useAppStore((s) => s.closeSettings);
  const toggleChat = useAppStore((s) => s.toggleChat);
  const activePanel = useEditorStore((s) => s.activePanel);
  const setActivePanel = useEditorStore((s) => s.setActivePanel);

  const base: React.CSSProperties = {
    width: 30,
    height: 30,
    borderRadius: 8,
    background: 'transparent',
    border: 'none',
    color: colors.textFaint,
    display: 'grid',
    placeItems: 'center',
    cursor: 'pointer',
  };
  const active: React.CSSProperties = {
    ...base,
    background: 'rgba(12,176,142,.18)',
    color: '#11f9b0',
  };

  return (
    <div
      style={{
        width: 44,
        flexShrink: 0,
        borderRight: `1px solid ${colors.border7}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        padding: '10px 0',
        background: colors.bgBar,
      }}
    >
      <button
        onClick={() => {
          setActivePanel('none');
          closeSettings();
        }}
        className="hv-rail"
        style={base}
        title="Close panels"
      >
        <X size={17} />
      </button>
      <button
        onClick={() => setActivePanel(activePanel === 'media' ? 'none' : 'media')}
        className={activePanel === 'media' ? undefined : 'hv-rail'}
        style={activePanel === 'media' ? active : base}
        title="Media library"
      >
        <Film size={17} />
      </button>
      <button
        onClick={() => setActivePanel(activePanel === 'text' ? 'none' : 'text')}
        className={activePanel === 'text' ? undefined : 'hv-rail'}
        style={activePanel === 'text' ? active : base}
        title="Captions"
      >
        <Type size={17} />
      </button>
      <button
        onClick={() => setActivePanel(activePanel === 'sfx' ? 'none' : 'sfx')}
        className={activePanel === 'sfx' ? undefined : 'hv-rail'}
        style={activePanel === 'sfx' ? active : base}
        title="Sound effects & music"
      >
        <Music size={17} />
      </button>
      <button
        onClick={toggleSettings}
        className={showSettings ? undefined : 'hv-rail'}
        style={showSettings ? active : base}
        title="Animation settings"
      >
        <SlidersHorizontal size={17} />
      </button>
      <button onClick={toggleChat} className="hv-rail" style={base} title="Agent v1">
        <WandSparkles size={17} />
      </button>
    </div>
  );
}
