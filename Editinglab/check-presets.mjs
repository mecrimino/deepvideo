/**
 * Renders every preset in presets.json against a real clip AND a real still —
 * stills are the easy thing to break, since ffmpeg happily writes an empty
 * video from one. Needs the gateway running (npm run dev:backend).
 *
 *   node Editinglab/check-presets.mjs [repo-relative-source]
 */

import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const API = process.env.API || 'http://127.0.0.1:8787';

const catalog = JSON.parse(await readFile(new URL('../cache/clips.json', import.meta.url), 'utf8'));
const clip = process.argv[2] || catalog.find((c) => /\.(mp4|mov|webm)$/i.test(c.path))?.path;
assert.ok(clip, 'no video clip found — pass one as an argument');

const thumbs = await readdir(new URL('../cache/thumbnails/', import.meta.url)).catch(() => []);
const still = thumbs.find((f) => /\.(jpe?g|png|webp)$/i.test(f));
const sources = [clip, still ? `cache/thumbnails/${still}` : null].filter(Boolean);

const { presets, compositions } = await (await fetch(`${API}/api/editinglab/presets`)).json();
assert.ok(presets.length > 0, 'presets.json has no presets');

const BODY = 'On the morning of November 16 1957, Bernice Worden was reported missing from the hardware store she managed. Her son, Deputy Sheriff Frank Worden, found the cash register open and blood stains on the floor.';
const HIGHLIGHT = 'Her son, Deputy Sheriff Frank Worden';

let failed = 0;
const t0 = Date.now();

for (const src of sources) {
  const kindOf = /\.(jpe?g|png|webp)$/i.test(src) ? 'still' : 'clip ';
  console.log(`\n— ${kindOf} ${src}`);

  for (const p of presets) {
    const res = await fetch(`${API}/api/editinglab/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ presetId: p.id, src, durationSec: 2 }),
    });
    const body = await res.json();
    if (res.ok) console.log(`ok   look  ${p.id.padEnd(18)} ${body.cached ? 'cached' : `${body.ms}ms`}`);
    else {
      failed += 1;
      console.error(`FAIL look  ${p.id}\n${body.detail || body.error}`);
    }
  }

  for (const c of compositions ?? []) {
    const text = c.kind === 'article' ? BODY : c.kind === 'stat' ? '2 KG' : c.kind === 'year' ? '1957' : 'BERNICE WORDEN';
    const res = await fetch(`${API}/api/editinglab/compose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        presetId: c.id,
        image: src,
        images: [src, src, src],
        text: c.kind === 'pair' || c.kind === 'trio' || c.kind === 'compare' ? 'BEFORE | AFTER | LATER' : text,
        highlight: HIGHLIGHT,
        durationSec: 3,
      }),
    });
    const body = await res.json();
    if (res.ok) console.log(`ok   shot  ${c.id.padEnd(18)} ${body.cached ? 'cached' : `${body.ms}ms`}`);
    else {
      failed += 1;
      console.error(`FAIL shot  ${c.id}\n${body.detail || body.error}`);
    }
  }
}

assert.equal(failed, 0, `${failed} preset(s) failed to render`);
console.log(
  `\n${presets.length} looks + ${compositions?.length ?? 0} shots OK on ${sources.length} source(s) (${((Date.now() - t0) / 1000).toFixed(1)}s)`,
);
