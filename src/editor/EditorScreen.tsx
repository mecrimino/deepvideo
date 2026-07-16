import { colors } from '../theme';
import { PreviewPane } from './Preview/PreviewPane';
import { TimelinePanel } from './Timeline/TimelinePanel';
import { AgentChat } from './Toolbar/AgentChat';
import { IconRail } from './Toolbar/IconRail';
import { SettingsPanel } from './Toolbar/SettingsPanel';
import { TopBar } from './Toolbar/TopBar';
import { TransportBar } from './Toolbar/TransportBar';

/** The full-screen editor: top bar / 3-column workspace / transport+timeline. */
export function EditorScreen() {
  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: colors.bgEditor,
        overflow: 'hidden',
      }}
    >
      <TopBar />

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <IconRail />
        <SettingsPanel />
        <PreviewPane />
        <AgentChat />
      </div>

      <div
        style={{
          flexShrink: 0,
          borderTop: `1px solid ${colors.border7}`,
          background: colors.bgBar,
        }}
      >
        <TransportBar />
        <TimelinePanel />
      </div>
    </div>
  );
}
