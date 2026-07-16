import { Image } from 'lucide-react';
import type { FilmCell } from '../../data/timeline-mock';
import { colors } from '../../theme';

/**
 * One cell in the film-strip track. Selected cells show the blue ring and
 * white trim handles; badge cells mark clips with an image overlay attached.
 */
export function ClipBlock({ cell }: { cell: FilmCell }) {
  return (
    <div
      style={{
        position: 'relative',
        width: cell.w,
        flexShrink: 0,
        borderRadius: 4,
        background: cell.grad,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg,rgba(0,0,0,.05),rgba(0,0,0,.35))',
        }}
      />
      {cell.badge && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%,-50%)',
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: 'rgba(47,107,255,.92)',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <Image size={10} color="#fff" />
        </div>
      )}
      {cell.selected && (
        <>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              border: `2px solid ${colors.accentHover}`,
              borderRadius: 4,
              boxShadow: '0 0 0 1px rgba(0,0,0,.4)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: 4,
              background: '#fff',
              borderRadius: '4px 0 0 4px',
            }}
          />
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              bottom: 0,
              width: 4,
              background: '#fff',
              borderRadius: '0 4px 4px 0',
            }}
          />
        </>
      )}
    </div>
  );
}
