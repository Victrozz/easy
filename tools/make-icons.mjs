// Generates the app icons. No dependencies — raw pixel buffer, hand-rolled
// PNG chunks, 4x supersampling for clean edges.
//
//   node tools/make-icons.mjs
//
// The mark is "E." — cream paper, ink-brown letter, terracotta full stop.
// The dot is the brand, so it gets the only colour.

import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

const PAPER = [0xF4, 0xED, 0xDF];
const INK = [0x33, 0x29, 0x1F];
const ACCENT = [0xB0, 0x60, 0x2B];

const SS = 4; // supersampling factor

// ------------------------------------------------------------------- shapes --

/** Distance from point to line segment, for capsule (rounded-cap bar) fills. */
function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function capsule(x1, y1, x2, y2, r, color) {
  return {
    color,
    bbox: [Math.min(x1, x2) - r, Math.min(y1, y2) - r, Math.max(x1, x2) + r, Math.max(y1, y2) + r],
    hit: (x, y) => segDist(x, y, x1, y1, x2, y2) <= r,
  };
}

function circle(cx, cy, r, color) {
  return {
    color,
    bbox: [cx - r, cy - r, cx + r, cy + r],
    hit: (x, y) => Math.hypot(x - cx, y - cy) <= r,
  };
}

/** The "E." mark, drawn in a nominal 512 box. Returned with its bounds. */
function mark() {
  const r = 27;
  const left = 170;
  const top = 156;
  const bottom = 366;
  const armEnd = 322;
  const shapes = [
    capsule(left, top, left, bottom, r, INK),        // spine
    capsule(left, top, armEnd, top, r, INK),         // top arm
    capsule(left, 261, armEnd - 32, 261, r, INK),    // middle arm, a touch short
    capsule(left, bottom, armEnd, bottom, r, INK),   // bottom arm
    circle(armEnd + 62, bottom - 2, 31, ACCENT),     // the full stop
  ];

  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of shapes) {
    x0 = Math.min(x0, s.bbox[0]); y0 = Math.min(y0, s.bbox[1]);
    x1 = Math.max(x1, s.bbox[2]); y1 = Math.max(y1, s.bbox[3]);
  }
  return { shapes, bounds: { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 } };
}

// ------------------------------------------------------------------ raster --

/**
 * @param size    output pixels
 * @param inset   fraction of the canvas the mark may occupy (maskable wants
 *                the content inside the middle ~80% so a circular crop is safe)
 */
function raster(size, inset) {
  const { shapes, bounds } = mark();
  const S = size * SS;

  // Fit the mark's bounding box into the inset area, centred.
  const target = S * inset;
  const scale = Math.min(target / bounds.w, target / bounds.h);
  const offX = (S - bounds.w * scale) / 2 - bounds.x0 * scale;
  const offY = (S - bounds.h * scale) / 2 - bounds.y0 * scale;

  // Accumulate at supersampled resolution, then box-filter down.
  const acc = new Float32Array(size * size * 3);
  const big = new Uint8Array(S * S * 3);

  for (let i = 0; i < S * S; i++) {
    big[i * 3] = PAPER[0]; big[i * 3 + 1] = PAPER[1]; big[i * 3 + 2] = PAPER[2];
  }

  for (const s of shapes) {
    const bx0 = Math.max(0, Math.floor(s.bbox[0] * scale + offX));
    const by0 = Math.max(0, Math.floor(s.bbox[1] * scale + offY));
    const bx1 = Math.min(S - 1, Math.ceil(s.bbox[2] * scale + offX));
    const by1 = Math.min(S - 1, Math.ceil(s.bbox[3] * scale + offY));
    for (let y = by0; y <= by1; y++) {
      const uy = (y + 0.5 - offY) / scale;
      for (let x = bx0; x <= bx1; x++) {
        const ux = (x + 0.5 - offX) / scale;
        if (!s.hit(ux, uy)) continue;
        const i = (y * S + x) * 3;
        big[i] = s.color[0]; big[i + 1] = s.color[1]; big[i + 2] = s.color[2];
      }
    }
  }

  for (let y = 0; y < S; y++) {
    const oy = (y / SS) | 0;
    for (let x = 0; x < S; x++) {
      const ox = (x / SS) | 0;
      const si = (y * S + x) * 3;
      const di = (oy * size + ox) * 3;
      acc[di] += big[si]; acc[di + 1] += big[si + 1]; acc[di + 2] += big[si + 2];
    }
  }

  const n = SS * SS;
  const out = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    out[i * 4] = Math.round(acc[i * 3] / n);
    out[i * 4 + 1] = Math.round(acc[i * 3 + 1] / n);
    out[i * 4 + 2] = Math.round(acc[i * 3 + 2] / n);
    out[i * 4 + 3] = 255;
  }
  return out;
}

// -------------------------------------------------------------------- PNG --

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // Each scanline gets a leading filter byte (0 = none).
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------- write --

const dir = path.join(process.cwd(), 'icons');
fs.mkdirSync(dir, { recursive: true });

const jobs = [
  ['icon-192.png', 192, 0.62],
  ['icon-512.png', 512, 0.62],
  ['apple-touch-icon.png', 180, 0.62],
  ['favicon.png', 64, 0.68],
  ['icon-maskable-512.png', 512, 0.46], // content well inside the safe circle
];

for (const [name, size, inset] of jobs) {
  const buf = png(size, raster(size, inset));
  fs.writeFileSync(path.join(dir, name), buf);
  console.log(name.padEnd(24), size + 'px', (buf.length / 1024).toFixed(1) + ' KB');
}
