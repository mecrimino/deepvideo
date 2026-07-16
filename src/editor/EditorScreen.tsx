/**
 * The full-screen editor. Layout matches the reference: below the top bar the
 * screen splits into a left column (icon rail / panels / preview, then the
 * transport + timeline strip) and a FULL-HEIGHT Deep Video Agent column on
 * the right that runs from the top bar to the bottom of the window. The
 * agent panel is toggled only from the top bar's panel button.
 * Owns global keyboard shortcuts (space, S, Delete, Ctrl+Z/Y) and guarantees
 * an open document (a blank timeline when none was produced by the pipeline).
 */

import { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { emptyTimeline, useEditorStore } from '../store/useEditorStore';
import { colors } from '../theme';
import { PreviewPane } from './Preview/PreviewPane';
import { TimelinePanel } from './Timeline/TimelinePanel';
import { AgentChat } from './Toolbar/AgentChat';
import { IconRail } from './Toolbar/IconRail';
import { MediaPanel } from './Toolbar/MediaPanel';
import { SettingsPanel } from './Toolbar/SettingsPanel';
import { TextPanel } from './Toolbar/TextPanel';
import { TopBar } from './Toolbar/TopBar';
import { TransportBar } from './Toolbar/TransportBar';

export function EditorScreen() {
  const showSettings = useAppStore((s) => s.showSettings);
  const showChat = useAppStore((s) => s.showChat);
  const activePanel = useEditorStore((s) => s.activePanel);
  const timeline = useEditorStore((s) => s.timeline);
  const openTimeline = useEditorStore((s) => s.openTimeline);

  // Always have a document open (e.g. the user jumped straight to the editor).
  useEffect(() => {
    if (!timeline) openTimeline(emptyTimeline(), { title: 'Untitled project' });
  }, [timeline, openTimeline]);

  // Global shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable)) {
        return;
      }
      const s = useEditorStore.getState();
      if (e.code === 'Space') {
        e.preventDefault();
        s.togglePlay();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        s.deleteSelected();
      } else if (e.key.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey) {
        s.splitAtPlayhead();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
        // Ctrl+L — attach the selected clip to the agent prompt as a mention.
        e.preventDefault();
        s.addMentionFromSelection();
        if (!useAppStore.getState().showChat) useAppStore.getState().toggleChat();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        s.undo();
      } else if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z')
      ) {
        e.preventDefault();
        s.redo();
      } else if (e.key === 'ArrowLeft') {
        s.setPlayhead(s.playheadSec - (e.shiftKey ? 1 : 1 / 30));
      } else if (e.key === 'ArrowRight') {
        s.setPlayhead(s.playheadSec + (e.shiftKey ? 1 : 1 / 30));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
        {/* left column: workspace on top, transport + timeline below */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
            <IconRail />
            {activePanel === 'media' && <MediaPanel />}
            {activePanel === 'text' && <TextPanel />}
            <div style={{ flex: 1, minWidth: 0, position: 'relative', display: 'flex', minHeight: 0 }}>
              {showSettings && <SettingsPanel />}
              <PreviewPane />
            </div>
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

        {/* right column: the agent, full height from top bar to window bottom */}
        {showChat && <AgentChat />}
      </div>
    </div>
  );
}
