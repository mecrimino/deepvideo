/**
 * Media library panel: upload files into the local library (probed +
 * thumbnailed by the server) and click any asset to place it on the video
 * track at the playhead.
 */

import { Film, Loader2, Music, Plus, Image as ImageIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { uploadMedia } from '../../services/clips';
import { fileUrl, useEditorStore } from '../../store/useEditorStore';
import { colors } from '../../theme';
import { formatDuration } from '../../lib/format';

const IMAGE_RE = /\.(png|jpe?g|webp|bmp|gif)$/i;
const AUDIO_RE = /\.(mp3|wav|m4a|aac|ogg|flac)$/i;

export function MediaPanel() {
  const assets = useEditorStore((s) => s.assets);
  const refreshAssets = useEditorStore((s) => s.refreshAssets);
  const addAssetAtPlayhead = useEditorStore((s) => s.addAssetAtPlayhead);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refreshAssets();
  }, [refreshAssets]);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        await uploadMedia(file);
      }
      await refreshAssets();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const list = Object.values(assets).sort((a, b) => a.path.localeCompare(b.path));

  return (
    <div
      style={{
        width: 232,
        flexShrink: 0,
        borderRight: `1px solid ${colors.border7}`,
        background: colors.bgBar,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <div style={{ padding: '12px 12px 8px', fontSize: 13, fontWeight: 600 }}>Media</div>

      <div style={{ padding: '0 12px 10px' }}>
        <button
          className="hv-blue"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
            padding: '8px 0',
            borderRadius: 9,
            background: colors.accent,
            border: 'none',
            color: '#fff',
            fontSize: 12.5,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={14} />}
          {busy ? 'Uploading…' : 'Upload media'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="video/*,image/*,audio/*"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => void onFiles(e.target.files)}
        />
        {error && <div style={{ fontSize: 10.5, color: '#e46a6a', marginTop: 6 }}>{error}</div>}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px', minHeight: 0 }}>
        {list.length === 0 && (
          <div style={{ fontSize: 11.5, color: colors.textGhost, lineHeight: 1.5 }}>
            The library is empty. Upload footage, images or audio — the server probes and indexes
            every file for retrieval.
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {list.map((a) => {
            const isImage = IMAGE_RE.test(a.path);
            const isAudio = AUDIO_RE.test(a.path);
            return (
              <button
                key={a.id}
                className="hv-card"
                onClick={() => addAssetAtPlayhead(a.id)}
                title={`${a.tags.join(' ')} — click to add at playhead`}
                style={{
                  border: `1px solid ${colors.border8}`,
                  borderRadius: 8,
                  overflow: 'hidden',
                  background: colors.card,
                  padding: 0,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div
                  style={{
                    aspectRatio: '16/10',
                    background: a.thumbPath
                      ? `url(${fileUrl(a.thumbPath)}) center/cover`
                      : 'linear-gradient(160deg,#2c2c34,#4a4a56)',
                    position: 'relative',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  {!a.thumbPath &&
                    (isAudio ? (
                      <Music size={16} color={colors.textDim} />
                    ) : isImage ? (
                      <ImageIcon size={16} color={colors.textDim} />
                    ) : (
                      <Film size={16} color={colors.textDim} />
                    ))}
                  {a.durationSec > 0 && (
                    <span
                      style={{
                        position: 'absolute',
                        right: 4,
                        bottom: 4,
                        fontSize: 9.5,
                        background: 'rgba(0,0,0,.65)',
                        color: colors.textMid,
                        padding: '1px 5px',
                        borderRadius: 4,
                      }}
                    >
                      {formatDuration(a.durationSec)}
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: colors.textDim,
                    padding: '5px 7px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {a.tags.slice(0, 4).join(' ') || a.path.split('/').pop()}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
