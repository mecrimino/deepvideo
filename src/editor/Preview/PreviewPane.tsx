import { Maximize } from 'lucide-react';
import { colors, fontMono, gradients } from '../../theme';

/** Center 16:9 preview. Placeholder frame until real playback is wired in. */
export function PreviewPane() {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        display: 'grid',
        placeItems: 'center',
        padding: 22,
        background: colors.bgEditor,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 780,
          aspectRatio: '16/9',
          borderRadius: 10,
          overflow: 'hidden',
          position: 'relative',
          border: `1px solid ${colors.border8}`,
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: gradients.placeholderLg,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <div
            style={{
              fontFamily: fontMono,
              fontSize: 11,
              color: colors.textGhost,
              textAlign: 'center',
            }}
          >
            PREVIEW
            <br />
            <span style={{ color: colors.textDim }}>MIG-25 frame</span>
          </div>
        </div>
        <div
          style={{
            position: 'absolute',
            top: 11,
            right: 11,
            width: 30,
            height: 30,
            borderRadius: 8,
            background: 'rgba(0,0,0,.55)',
            display: 'grid',
            placeItems: 'center',
            pointerEvents: 'none',
          }}
        >
          <Maximize size={15} color={colors.textBright} />
        </div>
      </div>
    </div>
  );
}
