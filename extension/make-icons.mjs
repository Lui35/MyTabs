/**
 * Generates the extension's PNG icons with no dependencies.
 * Run from the repo root:  node extension/make-icons.mjs
 */

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "icons");
const SIZES = [16, 32, 48, 128];

// Accent violet, matching --accent in the app.
const ACCENT = [91, 70, 214, 255];
const LIGHT = [232, 229, 252, 255];

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // Each scanline is prefixed with filter byte 0.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixels(x, y);
      const at = rowStart + 1 + x * 4;
      raw[at] = r;
      raw[at + 1] = g;
      raw[at + 2] = b;
      raw[at + 3] = a;
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** A rounded card with a title bar and a dot — the Tabs mark. */
function draw(size) {
  const s = size / 24;
  const radius = 3.2 * s;
  const card = { x: 2.5 * s, y: 6.5 * s, w: 19 * s, h: 14 * s };
  const barY = card.y + 4 * s;
  const dot = { x: 6 * s, y: 8.5 * s, r: Math.max(0.9 * s, 0.6) };

  const insideRounded = (px, py) => {
    const { x, y, w, h } = card;
    if (px < x || py < y || px > x + w || py > y + h) return false;
    const cx = Math.min(Math.max(px, x + radius), x + w - radius);
    const cy = Math.min(Math.max(py, y + radius), y + h - radius);
    return (px - cx) ** 2 + (py - cy) ** 2 <= radius ** 2 + 0.0001;
  };

  return (ix, iy) => {
    // 3x3 supersample for smooth edges at 16px.
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    const samples = 3;

    for (let sy = 0; sy < samples; sy++) {
      for (let sx = 0; sx < samples; sx++) {
        const px = ix + (sx + 0.5) / samples;
        const py = iy + (sy + 0.5) / samples;

        let color = null;
        if (insideRounded(px, py)) {
          const onDot = (px - dot.x) ** 2 + (py - dot.y) ** 2 <= dot.r ** 2;
          const onBar = Math.abs(py - barY) <= 0.75 * s;
          color = onDot || onBar ? LIGHT : ACCENT;
        }

        if (color) {
          r += color[0];
          g += color[1];
          b += color[2];
          a += color[3];
        }
      }
    }

    const total = samples * samples;
    if (a === 0) return [0, 0, 0, 0];
    // Average colour over covered samples, alpha over all samples.
    const covered = a / 255;
    return [
      Math.round(r / covered),
      Math.round(g / covered),
      Math.round(b / covered),
      Math.round(a / total),
    ];
  };
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  const file = join(OUT_DIR, `icon-${size}.png`);
  writeFileSync(file, png(size, draw(size)));
  console.log(`wrote ${file}`);
}
