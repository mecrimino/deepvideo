/**
 * Static maps for the map preset — type a place name, get a PNG centred on it.
 *
 * Geocoding is Nominatim and tiles are the OSM raster set: both free, no key,
 * in keeping with the rest of the stack. Both are cached on disk (cache/maps),
 * so a place is fetched once and every later render is local. OSM asks for a
 * real User-Agent and light use; attribution is burned into the composition.
 *
 * Tiles are stitched with ffmpeg's xstack rather than an image library — one
 * less dependency for something we already have.
 */

import { spawn } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../config/index.ts';

const UA = 'DeepVideo/0.1 (local editing lab; contact: local user)';
const MAP_DIR = join(config.paths.cache, 'maps');
const TILE_DIR = join(MAP_DIR, 'tiles');
const GEO_FILE = join(MAP_DIR, 'geocode.json');
const TILE = 256;

export interface Place {
  lat: number;
  lon: number;
  name: string;
  /** Outline rings of the place (lon/lat pairs), when Nominatim has one. */
  rings?: number[][][];
}

/** GeoJSON Polygon/MultiPolygon → a flat list of rings. */
function toRings(geo: { type?: string; coordinates?: unknown } | undefined): number[][][] {
  if (!geo?.coordinates) return [];
  if (geo.type === 'Polygon') return geo.coordinates as number[][][];
  if (geo.type === 'MultiPolygon') return (geo.coordinates as number[][][][]).flat();
  return [];
}

async function readGeoCache(): Promise<Record<string, Place>> {
  return JSON.parse(await readFile(GEO_FILE, 'utf8').catch(() => '{}')) as Record<string, Place>;
}

/** Place name → coordinates + outline. Cached forever; a name rarely moves. */
export async function geocode(query: string): Promise<Place> {
  const key = query.trim().toLowerCase();
  const cache = await readGeoCache();
  if (cache[key]?.rings) return cache[key];

  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&polygon_geojson=1`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`geocoding failed (${res.status}) for "${query}"`);
  const hits = (await res.json()) as Array<{
    lat: string;
    lon: string;
    display_name: string;
    geojson?: { type?: string; coordinates?: unknown };
  }>;
  if (!hits.length) throw new Error(`no place found for "${query}"`);

  const place: Place = {
    lat: Number(hits[0].lat),
    lon: Number(hits[0].lon),
    name: hits[0].display_name,
    rings: toRings(hits[0].geojson),
  };
  await mkdir(MAP_DIR, { recursive: true });
  await writeFile(GEO_FILE, JSON.stringify({ ...cache, [key]: place }, null, 2), 'utf8');
  return place;
}

/** Slippy-map projection: world pixel coordinates at a zoom level. */
export function project(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const n = TILE * 2 ** zoom;
  const latRad = (lat * Math.PI) / 180;
  return {
    x: ((lon + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  };
}

async function fetchTile(z: number, x: number, y: number): Promise<string> {
  const rel = join(TILE_DIR, `${z}_${x}_${y}.png`);
  if (await stat(rel).catch(() => null)) return rel;
  const res = await fetch(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`tile ${z}/${x}/${y} failed (${res.status})`);
  await mkdir(TILE_DIR, { recursive: true });
  await writeFile(rel, Buffer.from(await res.arrayBuffer()));
  return rel;
}

function run(cmd: string, args: string[]): Promise<number> {
  return new Promise((res) => {
    const p = spawn(cmd, args, { windowsHide: true, cwd: config.root });
    p.on('close', (code) => res(code ?? 1));
    p.on('error', () => res(1));
  });
}

export type MapStyle = 'plain' | 'navy' | 'noir' | 'blueprint';

/**
 * Recolour classes by pixel: OSM water is markedly bluer than land, and admin
 * borders / motorways are the only pinks and oranges. Keying on those three
 * gives the documentary's navy plate with yellow routes. Runs once per map
 * (it's a still), so geq's cost never reaches the video render.
 */
function styleFilter(style: MapStyle): string {
  if (style === 'plain') return '';
  const px = (c: 'r' | 'g' | 'b') => `${c}(X\\,Y)`;
  const isBorder = `gt(${px('r')}-${px('g')}\\,16)*gt(${px('b')}-${px('g')}\\,16)`;
  const isWater = `gt(${px('b')}-${px('r')}\\,25)`;
  const paint = (border: number, water: number, land: number, chan: 'r' | 'g' | 'b') =>
    `if(${isBorder}\\,${border}\\,if(${isWater}\\,${water}\\,${land}+0.14*(${px(chan)}-200)))`;
  const map: Record<Exclude<MapStyle, 'plain'>, [number[], number[], number[]]> = {
    // [border rgb, water rgb, land rgb]
    navy: [[232, 212, 77], [11, 34, 60], [26, 56, 88]],
    noir: [[210, 210, 210], [8, 8, 8], [34, 34, 34]],
    blueprint: [[240, 240, 240], [18, 52, 120], [10, 34, 88]],
  };
  const [b, wtr, land] = map[style];
  return `,format=gbrp,geq=r='${paint(b[0], wtr[0], land[0], 'r')}':g='${paint(b[1], wtr[1], land[1], 'g')}':b='${paint(b[2], wtr[2], land[2], 'b')}'`;
}

/**
 * A `w`×`h` PNG centred on lat/lon at `zoom`, returned as a repo-relative path.
 * Cached by every argument, so re-rendering a shot never re-fetches.
 */
export async function staticMap(
  lat: number,
  lon: number,
  zoom: number,
  w: number,
  h: number,
  style: MapStyle = 'plain',
): Promise<string> {
  const z = Math.max(1, Math.min(16, Math.round(zoom)));
  const key = createHash('sha1').update(`${lat}|${lon}|${z}|${w}|${h}|${style}`).digest('hex').slice(0, 16);
  const outRel = `cache/maps/map_${key}.png`;
  const outAbs = join(config.root, outRel);
  if (await stat(outAbs).catch(() => null)) return outRel;

  const centre = project(lat, lon, z);
  const left = centre.x - w / 2;
  const top = centre.y - h / 2;
  const x0 = Math.floor(left / TILE);
  const y0 = Math.floor(top / TILE);
  const x1 = Math.floor((left + w) / TILE);
  const y1 = Math.floor((top + h) / TILE);
  const maxTile = 2 ** z - 1;

  const inputs: string[] = [];
  const layout: string[] = [];
  let n = 0;
  for (let ty = y0; ty <= y1; ty += 1) {
    for (let tx = x0; tx <= x1; tx += 1) {
      // Wrap horizontally, clamp vertically — the poles have no tiles.
      const wrapped = ((tx % (maxTile + 1)) + maxTile + 1) % (maxTile + 1);
      const clamped = Math.max(0, Math.min(maxTile, ty));
      inputs.push('-i', await fetchTile(z, wrapped, clamped));
      layout.push(`${(tx - x0) * TILE}_${(ty - y0) * TILE}`);
      n += 1;
    }
  }

  await mkdir(MAP_DIR, { recursive: true });
  const cropX = Math.round(left - x0 * TILE);
  const cropY = Math.round(top - y0 * TILE);
  const crop = `crop=${w}:${h}:${cropX}:${cropY}${styleFilter(style)}`;
  const graph =
    n === 1
      ? `[0:v]${crop}[out]`
      : `${inputs.filter((_, i) => i % 2 === 1).map((_, i) => `[${i}:v]`).join('')}xstack=inputs=${n}:layout=${layout.join('|')}[grid];[grid]${crop}[out]`;

  const code = await run('ffmpeg', ['-y', '-v', 'error', ...inputs, '-filter_complex', graph, '-map', '[out]', '-frames:v', '1', outRel]);
  if (code !== 0) throw new Error(`stitching the map failed (${n} tiles at z${z})`);
  return outRel;
}

/**
 * The planet as seen from space, turned so `lat`/`lon` faces the camera.
 * v360 reprojects the stitched Mercator world (`mercator` in, `og` out) and
 * `alpha_mask` leaves everything outside the disc transparent, so the caller
 * can drop it on any backdrop. Cached like everything else here.
 */
export async function globeMap(lat: number, lon: number, size: number, style: MapStyle = 'navy'): Promise<string> {
  const key = createHash('sha1').update(`globe|${lat.toFixed(3)}|${lon.toFixed(3)}|${size}|${style}`).digest('hex').slice(0, 16);
  const outRel = `cache/maps/globe_${key}.png`;
  if (await stat(join(config.root, outRel)).catch(() => null)) return outRel;

  // z3 is the whole world in 64 tiles — plenty of detail once it is a sphere.
  const world = await staticMap(0, 0, 3, 2048, 2048, style);
  await mkdir(MAP_DIR, { recursive: true });
  const code = await run('ffmpeg', [
    '-y', '-v', 'error', '-i', world,
    '-vf', `v360=input=mercator:output=og:yaw=${lon.toFixed(4)}:pitch=${lat.toFixed(4)}:alpha_mask=1,scale=${size}:${size}`,
    '-frames:v', '1', outRel,
  ]);
  if (code !== 0) throw new Error('globe projection failed');
  return outRel;
}

// ---------------------------------------------------------------------------
// Region mask — the coloured-in state/country. Nominatim gives the outline as
// GeoJSON; it is projected with the same slippy maths as the tiles and filled
// here rather than pulling in an image library for two hundred lines of work.
// ---------------------------------------------------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** 8-bit greyscale PNG from raw rows. */
function greyPng(pixels: Uint8Array, w: number, h: number): Buffer {
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y += 1) {
    raw[y * (w + 1)] = 0; // filter: none
    Buffer.from(pixels.subarray(y * w, (y + 1) * w)).copy(raw, y * (w + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // colour type: greyscale
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * White where the place's outline covers the frame, black elsewhere — the
 * frame being the same window staticMap() renders. Even-odd scanline fill, so
 * holes (a lake inside a county) come out correctly.
 */
export async function regionMask(
  place: Place,
  zoom: number,
  w: number,
  h: number,
): Promise<string | null> {
  if (!place.rings?.length) return null;
  const z = Math.max(1, Math.min(16, Math.round(zoom)));
  const key = createHash('sha1')
    .update(`${place.lat}|${place.lon}|${z}|${w}|${h}|${place.rings.length}`)
    .digest('hex')
    .slice(0, 16);
  const outRel = `cache/maps/mask_${key}.png`;
  const outAbs = join(config.root, outRel);
  if (await stat(outAbs).catch(() => null)) return outRel;

  const centre = project(place.lat, place.lon, z);
  const left = centre.x - w / 2;
  const top = centre.y - h / 2;
  // Rings in frame pixels.
  const rings = place.rings.map((ring) =>
    ring.map(([lon, lat]) => {
      const p = project(lat, lon, z);
      return [p.x - left, p.y - top] as [number, number];
    }),
  );

  const px = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    const xs: number[] = [];
    const scan = y + 0.5;
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i += 1) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[(i + 1) % ring.length];
        if (y1 === y2) continue;
        if (scan >= Math.min(y1, y2) && scan < Math.max(y1, y2)) {
          xs.push(x1 + ((scan - y1) / (y2 - y1)) * (x2 - x1));
        }
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const from = Math.max(0, Math.ceil(xs[i]));
      const to = Math.min(w - 1, Math.floor(xs[i + 1]));
      for (let x = from; x <= to; x += 1) px[y * w + x] = 255;
    }
  }

  await mkdir(MAP_DIR, { recursive: true });
  await writeFile(outAbs, greyPng(px, w, h));
  return outRel;
}

/** Zoom level that frames a place: 3 = continent, 10 = town, 13 = streets. */
export const ZOOM = { world: 2, continent: 4, country: 5, region: 7, town: 10, street: 13 } as const;
