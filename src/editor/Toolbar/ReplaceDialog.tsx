/**
 * Stock replacement picker. Opens for a selected timeline clip: derives a
 * search keyword from the clip, live-searches Pexels + Pixabay, shows the
 * results as a thumbnail grid, and on "Replace" downloads the chosen clip
 * into the local library and swaps it into the timeline (undoable).
 */

import { Check, Download, Film, Loader2, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { StockResult } from '@deep-video/shared';
import { importStock, searchStock } from '../../services/stock';
import { useEditorStore } from '../../store/useEditorStore';
import { colors } from '../../theme';

const STOPWORDS = new Set(
  ('a an the and or but of in on at to for from by with without into onto over under is are was ' +
    'were be been being do does did have has had will would can could may might it its this that ' +
    'these those there here they them his her their our your my we you i as if then than so such ' +
    'not no yes about after before between down during each few more most some only very just also ' +
    'when where which who why how what while out up off once footage video clip stock scene shot')
    .split(/\s+/),
);

/** Turn a clip label/sentence into a short stock-search keyword. */
function deriveKeyword(text: string): string {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  return words.slice(0, 4).join(' ') || text.trim().split(/\s+/).slice(0, 3).join(' ');
}

export function ReplaceDialog() {
  const clipId = useEditorStore((s) => s.replaceTargetClipId);
  const timeline = useEditorStore((s) => s.timeline);
  const assets = useEditorStore((s) => s.assets);
  const closeReplace = useEditorStore((s) => s.closeReplace);
  const replaceClipWithAsset = useEditorStore((s) => s.replaceClipWithAsset);

  const clip = useMemo(
    () => timeline?.tracks.flatMap((t) => t.clips).find((c) => c.id === clipId),
    [timeline, clipId],
  );
  const currentAsset = clip?.source.kind === 'asset' ? assets[clip.source.assetId] : undefined;
  const seed = clip?.label || currentAsset?.tags.join(' ') || '';

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StockResult[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSeed = useRef<string | null>(null);

  const runSearch = async (q: string) => {
    const query2 = q.trim();
    if (!query2) return;
    setSearching(true);
    setError(null);
    setResults([]);
    setSelected(null);
    try {
      const res = await searchStock({ query: query2, perSource: 8 });
      setResults(res.results);
      if (res.results.length === 0) setError('No stock footage found — try different words.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSearching(false);
    }
  };

  // Auto-search with the derived keyword each time the dialog opens for a clip.
  useEffect(() => {
    if (!clipId) {
      lastSeed.current = null;
      return;
    }
    if (lastSeed.current === clipId) return;
    lastSeed.current = clipId;
    const kw = deriveKeyword(seed);
    setQuery(kw);
    setResults([]);
    setSelected(null);
    void runSearch(kw);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipId]);

  if (!clipId || !clip) return null;

  const doReplace = async () => {
    const pick = results.find((r) => r.id === selected);
    if (!pick || importing) return;
    setImporting(true);
    setError(null);
    try {
      const { asset } = await importStock({ result: pick, tags: query.split(/\s+/).filter(Boolean) });
      replaceClipWithAsset(clip.id, asset, 0);
      closeReplace();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div
      onClick={() => !importing && closeReplace()}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.62)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 45,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(720px, 94vw)',
          maxHeight: '86vh',
          display: 'flex',
          flexDirection: 'column',
          background: colors.panel,
          border: `1px solid ${colors.border9}`,
          borderRadius: 16,
          boxShadow: '0 26px 70px rgba(0,0,0,.6)',
          overflow: 'hidden',
        }}
      >
        {/* header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '14px 18px',
            borderBottom: `1px solid ${colors.border7}`,
          }}
        >
          <div
            style={{
              width: 54,
              height: 32,
              borderRadius: 6,
              flexShrink: 0,
              background: currentAsset?.thumbPath
                ? `url(/files/${currentAsset.thumbPath.split('\\').join('/')}) center/cover`
                : 'linear-gradient(160deg,#2c2c34,#4a4a56)',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            {!currentAsset?.thumbPath && <Film size={14} color={colors.textDim} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Replace clip with stock footage</div>
            <div
              style={{
                fontSize: 11.5,
                color: colors.textGhost,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              Replacing: {clip.label || '(unlabeled clip)'}
            </div>
          </div>
          <button
            onClick={() => !importing && closeReplace()}
            style={{ background: 'transparent', border: 'none', color: colors.textDim, cursor: 'pointer', padding: 2 }}
          >
            <X size={17} />
          </button>
        </div>

        {/* search bar */}
        <div style={{ display: 'flex', gap: 8, padding: '12px 18px' }}>
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: colors.card,
              border: `1px solid ${colors.border8}`,
              borderRadius: 9,
              padding: '0 11px',
            }}
          >
            <Search size={15} color={colors.textDim} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void runSearch(query);
              }}
              placeholder="Search Pexels & Pixabay…"
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                color: colors.text,
                fontSize: 13,
                padding: '9px 0',
              }}
            />
          </div>
          <button
            onClick={() => void runSearch(query)}
            disabled={searching || !query.trim()}
            className="hv-dark"
            style={{
              padding: '0 16px',
              borderRadius: 9,
              background: colors.control,
              border: `1px solid ${colors.border9}`,
              color: colors.textSoft,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Search
          </button>
        </div>

        {/* results grid */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 18px 14px', minHeight: 180 }}>
          {searching && (
            <div style={{ display: 'grid', placeItems: 'center', height: 200, color: colors.textFaint, gap: 10 }}>
              <Loader2 size={22} style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: 12.5 }}>Searching Pexels & Pixabay for “{query}”…</span>
            </div>
          )}

          {!searching && error && (
            <div style={{ display: 'grid', placeItems: 'center', height: 160, color: '#e46a6a', fontSize: 13, textAlign: 'center', padding: 20 }}>
              {error}
            </div>
          )}

          {!searching && !error && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {results.map((r) => {
                const active = r.id === selected;
                return (
                  <button
                    key={r.id}
                    onClick={() => setSelected(r.id)}
                    onDoubleClick={() => {
                      setSelected(r.id);
                      void doReplace();
                    }}
                    style={{
                      position: 'relative',
                      padding: 0,
                      borderRadius: 10,
                      overflow: 'hidden',
                      border: `2px solid ${active ? colors.accent : colors.border8}`,
                      background: '#15161b',
                      cursor: 'pointer',
                      aspectRatio: '16/10',
                    }}
                  >
                    <img
                      src={r.thumbUrl}
                      alt=""
                      referrerPolicy="no-referrer"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                    <span
                      style={{
                        position: 'absolute',
                        left: 5,
                        top: 5,
                        fontSize: 8.5,
                        fontWeight: 700,
                        letterSpacing: '.05em',
                        padding: '1px 6px',
                        borderRadius: 4,
                        color: '#fff',
                        background: r.source === 'pexels' ? 'rgba(5,160,129,.9)' : 'rgba(72,178,80,.9)',
                      }}
                    >
                      {r.source.toUpperCase()}
                    </span>
                    {r.durationSec ? (
                      <span
                        style={{
                          position: 'absolute',
                          right: 5,
                          bottom: 5,
                          fontSize: 9.5,
                          background: 'rgba(0,0,0,.7)',
                          color: '#fff',
                          padding: '1px 5px',
                          borderRadius: 4,
                        }}
                      >
                        {Math.round(r.durationSec)}s
                      </span>
                    ) : null}
                    {active && (
                      <span
                        style={{
                          position: 'absolute',
                          top: 5,
                          right: 5,
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
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            padding: '12px 18px',
            borderTop: `1px solid ${colors.border7}`,
          }}
        >
          <span style={{ fontSize: 11, color: colors.textGhost }}>
            {results.length > 0 ? `${results.length} results · double-click to replace instantly` : 'Free stock footage'}
          </span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => !importing && closeReplace()}
              className="hv-dark"
              style={{
                padding: '9px 16px',
                borderRadius: 9,
                background: colors.control,
                border: `1px solid ${colors.border9}`,
                color: colors.textSoft,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => void doReplace()}
              disabled={!selected || importing}
              className="hv-blue"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: '9px 18px',
                borderRadius: 9,
                background: colors.accent,
                border: 'none',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                opacity: !selected || importing ? 0.5 : 1,
              }}
            >
              {importing ? (
                <>
                  <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                  Downloading…
                </>
              ) : (
                <>
                  <Download size={14} />
                  Replace clip
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
