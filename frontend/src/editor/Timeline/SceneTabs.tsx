/**
 * Scene tab strip above the timeline (Rive-style): a collapse chevron plus the
 * open scene's tab. The chevron really collapses the timeline down to this
 * strip and restores it to the height you had.
 */

import { ChevronDown, ChevronUp, Frame } from 'lucide-react';
import { useRef } from 'react';
import { useEditorStore } from '../../stores/useEditorStore';
import { colors } from '../../styles/theme';

export const SCENE_TABS_H = 30;
/** Timeline height when collapsed: just the strip. */
export const COLLAPSED_H = SCENE_TABS_H;

export function SceneTabs() {
  const title = useEditorStore((s) => s.projectTitle);
  const timelineH = useEditorStore((s) => s.timelineH);
  const setTimelineH = useEditorStore((s) => s.setTimelineH);
  const restoreTo = useRef(timelineH);

  const collapsed = timelineH <= COLLAPSED_H + 1;
  const toggle = () => {
    if (collapsed) setTimelineH(restoreTo.current > COLLAPSED_H + 1 ? restoreTo.current : 192);
    else {
      restoreTo.current = timelineH;
      setTimelineH(COLLAPSED_H);
    }
  };

  return (
    <div
      style={{
        height: SCENE_TABS_H,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'stretch',
        gap: 2,
        paddingLeft: 4,
        background: colors.tabActive,
        borderBottom: `1px solid ${colors.border7}`,
      }}
    >
      <button
        onClick={toggle}
        title={collapsed ? 'Expand the timeline' : 'Collapse the timeline'}
        className="hv-rail"
        style={{
          width: 26,
          alignSelf: 'center',
          height: 22,
          display: 'grid',
          placeItems: 'center',
          borderRadius: 5,
          border: 'none',
          background: 'transparent',
          color: colors.textFaint,
          cursor: 'pointer',
          padding: 0,
        }}
      >
        {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      <div
        title={title}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          padding: '0 14px',
          background: colors.bgBar,
          borderTopLeftRadius: 6,
          borderTopRightRadius: 6,
          fontSize: 11.5,
          fontWeight: 600,
          color: colors.textSoft,
          maxWidth: 260,
        }}
      >
        <Frame size={12} color={colors.textFaint} style={{ flexShrink: 0 }} />
        <span
          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {title}
        </span>
      </div>
    </div>
  );
}
