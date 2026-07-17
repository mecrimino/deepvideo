/**
 * Audio track: renders the narration file's REAL waveform (decoded with the
 * Web Audio API, peaks drawn on a canvas sized by the zoom level). When the
 * timeline has no narration audio the lane says so instead of faking bars.
 */

import { useEffect, useRef, useState } from 'react';
import { fileUrl, useEditorStore } from '../../store/useEditorStore';
import { colors, fontMono } from '../../theme';

const peakCache = new Map<string, Float32Array>();

/** Decode an audio URL and reduce it to N peak buckets (cached per URL). */
function usePeaks(url: string | null, buckets: number): Float32Array | null {
  const [peaks, setPeaks] = useState<Float32Array | null>(null);

  useEffect(() => {
    if (!url) {
      setPeaks(null);
      return;
    }
    const key = `${url}#${buckets}`;
    const cached = peakCache.get(key);
    if (cached) {
      setPeaks(cached);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url);
        const buf = await res.arrayBuffer();
        const ctx = new AudioContext();
        const audio = await ctx.decodeAudioData(buf);
        void ctx.close();
        const data = audio.getChannelData(0);
        const out = new Float32Array(buckets);
        const per = Math.max(1, Math.floor(data.length / buckets));
        for (let b = 0; b < buckets; b++) {
          let max = 0;
          const from = b * per;
          for (let i = from; i < Math.min(from + per, data.length); i += 16) {
            const v = Math.abs(data[i]);
            if (v > max) max = v;
          }
          out[b] = max;
        }
        peakCache.set(key, out);
        if (!cancelled) setPeaks(out);
      } catch {
        if (!cancelled) setPeaks(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, buckets]);

  return peaks;
}

export function WaveTrack({ contentSec, height = 26 }: { contentSec: number; height?: number }) {
  const timeline = useEditorStore((s) => s.timeline);
  const pxPerSec = useEditorStore((s) => s.pxPerSec);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const width = Math.max(50, Math.round(contentSec * pxPerSec));
  const audioUrl = timeline?.audioPath ? fileUrl(timeline.audioPath) : null;
  const buckets = Math.max(10, Math.floor(width / 3));
  const peaks = usePeaks(audioUrl, buckets);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = colors.waveform;
    const mid = height / 2;
    for (let i = 0; i < peaks.length; i++) {
      const h = Math.max(1, peaks[i] * (height - 4));
      ctx.fillRect(i * 3, mid - h / 2, 2, h);
    }
  }, [peaks, width, height]);

  const label = timeline?.audioPath
    ? `Narration: ${timeline.audioPath.split('/').pop()}`
    : 'No narration audio (script-only project)';

  return (
    <div
      style={{
        position: 'relative',
        height,
        background: '#171310',
        border: '1px solid rgba(217,169,58,.18)',
        borderRadius: 5,
        overflow: 'hidden',
        width,
      }}
    >
      {peaks && <canvas ref={canvasRef} width={width} height={height} style={{ display: 'block' }} />}
      <div
        style={{
          position: 'absolute',
          left: 6,
          top: '50%',
          transform: 'translateY(-50%)',
          fontFamily: fontMono,
          fontSize: 9,
          padding: '1px 6px',
          borderRadius: 4,
          whiteSpace: 'nowrap',
          background: 'rgba(23,19,16,.85)',
          border: '1px solid rgba(217,169,58,.25)',
          color: '#d9c08a',
        }}
      >
        {label}
      </div>
    </div>
  );
}
