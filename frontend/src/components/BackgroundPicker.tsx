/**
 * Background image picker — real images from assets/background_image, listed
 * live by GET /api/backgrounds and previewed via /files/<path>. Used on the
 * Brand profile (per-channel default) and the Creative Setup screen
 * (per-generation override).
 */

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import type { ListBackgroundsResponse } from '@deep-vision/shared';
import { fetchJson } from '../utils/fetchJson';
import { colors } from '../styles/theme';

/** Pretty label from "assets/background_image/blue2-background.png" → "Blue 2". */
export function bgLabel(path: string): string {
  const base = path.split('/').pop()?.replace(/-background\.\w+$/i, '') ?? path;
  return base.replace(/(\d+)$/, ' $1').replace(/^./, (c) => c.toUpperCase());
}

export function BackgroundPicker({
  value,
  onSelect,
}: {
  /** Selected repo-relative path ('' = none/black). */
  value: string;
  onSelect: (path: string) => void;
}) {
  const [backgrounds, setBackgrounds] = useState<string[]>([]);

  useEffect(() => {
    fetchJson<ListBackgroundsResponse>('/api/backgrounds')
      .then((r) => setBackgrounds(r.backgrounds))
      .catch(() => setBackgrounds([]));
  }, []);

  const tile: React.CSSProperties = {
    position: 'relative',
    aspectRatio: '16/9',
    borderRadius: 10,
    overflow: 'hidden',
    cursor: 'pointer',
    padding: 0,
    background: colors.card,
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: 10 }}>
      {/* none — plain black */}
      <button
        onClick={() => onSelect('')}
        title="No background (black)"
        style={{
          ...tile,
          border: `2px solid ${value === '' ? colors.accent : colors.border8}`,
          background: '#000',
        }}
      >
        <span style={{ fontSize: 11, color: colors.textFaint }}>None</span>
        {value === '' && <SelectedMark />}
      </button>
      {backgrounds.map((p) => {
        const active = value === p;
        return (
          <button
            key={p}
            onClick={() => onSelect(p)}
            title={bgLabel(p)}
            style={{ ...tile, border: `2px solid ${active ? colors.accent : colors.border8}` }}
          >
            <img
              src={`/files/${p}`}
              alt={bgLabel(p)}
              loading="lazy"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
            <span
              style={{
                position: 'absolute',
                left: 6,
                bottom: 5,
                fontSize: 10.5,
                fontWeight: 600,
                color: '#fff',
                textShadow: '0 1px 4px rgba(0,0,0,.9)',
              }}
            >
              {bgLabel(p)}
            </span>
            {active && <SelectedMark />}
          </button>
        );
      })}
    </div>
  );
}

function SelectedMark() {
  return (
    <span
      style={{
        position: 'absolute',
        top: 6,
        right: 6,
        width: 20,
        height: 20,
        borderRadius: '50%',
        background: colors.accent,
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <Check size={12} color="#fff" />
    </span>
  );
}
