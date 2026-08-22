/**
 * Generates the installable-app icons from code so the repository carries no
 * binary asset that cannot be reproduced. Run with `npm run icons -w
 * @bwinkeler-lists/frontend` after changing the artwork.
 *
 * The artwork is the Listly checklist mark, expressed in the same 32-unit
 * coordinate space as the inline favicon in `index.html`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const iconsDirectory = resolve(frontendRoot, 'public', 'icons');

const gradientStops = [
  [0, [99, 102, 241]],
  [0.45, [79, 70, 229]],
  [1, [124, 58, 237]],
];
const markColor = [255, 255, 255];

/** Checklist strokes in the 32-unit artwork space, as polylines. */
const strokes = [
  [
    [13, 10],
    [22, 10],
  ],
  [
    [13, 16],
    [22, 16],
  ],
  [
    [13, 22],
    [22, 22],
  ],
  [
    [7, 10],
    [8.4, 11.4],
    [11, 9],
  ],
  [
    [7, 16],
    [8.4, 17.4],
    [11, 15],
  ],
  [
    [7, 22],
    [8.4, 23.4],
    [11, 21],
  ],
];
const strokeWidth = 2.2;
const artBounds = { minX: 5.9, minY: 7.9, maxX: 23.1, maxY: 24.5 };

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed), 0);
  return Buffer.concat([length, typed, crc]);
}

function encodePng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.writeUInt8(8, 8); // bit depth
  header.writeUInt8(6, 9); // RGBA
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(size * stride);
  for (let y = 0; y < size; y += 1) {
    raw[y * stride] = 0; // no per-row filter
    for (let x = 0; x < size * 4; x += 1) {
      raw[y * stride + 1 + x] = pixels[y * size * 4 + x];
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function createCanvas(size) {
  return { size, pixels: new Uint8ClampedArray(size * size * 4) };
}

function blend(canvas, x, y, color, alpha) {
  if (alpha <= 0) return;
  const index = (y * canvas.size + x) * 4;
  const inverse = 1 - alpha;
  canvas.pixels[index] = color[0] * alpha + canvas.pixels[index] * inverse;
  canvas.pixels[index + 1] = color[1] * alpha + canvas.pixels[index + 1] * inverse;
  canvas.pixels[index + 2] = color[2] * alpha + canvas.pixels[index + 2] * inverse;
  canvas.pixels[index + 3] = Math.max(canvas.pixels[index + 3], alpha * 255);
}

const samplesPerAxis = 4;

function coverage(inside, x, y) {
  let hits = 0;
  for (let sy = 0; sy < samplesPerAxis; sy += 1) {
    for (let sx = 0; sx < samplesPerAxis; sx += 1) {
      if (inside(x + (sx + 0.5) / samplesPerAxis, y + (sy + 0.5) / samplesPerAxis)) {
        hits += 1;
      }
    }
  }
  return hits / (samplesPerAxis * samplesPerAxis);
}

function fill(canvas, inside, colorAt) {
  for (let y = 0; y < canvas.size; y += 1) {
    for (let x = 0; x < canvas.size; x += 1) {
      const alpha = coverage(inside, x, y);
      if (alpha > 0) blend(canvas, x, y, colorAt(x, y), alpha);
    }
  }
}

function roundedRect(cx, cy, width, height, radius) {
  return (x, y) => {
    const qx = Math.abs(x - cx) - (width / 2 - radius);
    const qy = Math.abs(y - cy) - (height / 2 - radius);
    const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
    return outside + Math.min(Math.max(qx, qy), 0) - radius <= 0;
  };
}

/** A line segment with round caps, i.e. every point within `radius` of it. */
function capsule(ax, ay, bx, by, radius) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  return (x, y) => {
    const t =
      lengthSquared === 0
        ? 0
        : Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / lengthSquared));
    return Math.hypot(x - (ax + t * dx), y - (ay + t * dy)) <= radius;
  };
}

function gradientColor(size) {
  return (x, y) => {
    const t = Math.min(1, (x + y) / (2 * size));
    let previous = gradientStops[0];
    for (const stop of gradientStops) {
      if (t <= stop[0]) {
        const span = stop[0] - previous[0];
        const local = span === 0 ? 0 : (t - previous[0]) / span;
        return [
          previous[1][0] + (stop[1][0] - previous[1][0]) * local,
          previous[1][1] + (stop[1][1] - previous[1][1]) * local,
          previous[1][2] + (stop[1][2] - previous[1][2]) * local,
        ];
      }
      previous = stop;
    }
    return previous[1];
  };
}

function drawIcon(size, { cornerRatio, contentScale }) {
  const canvas = createCanvas(size);

  fill(
    canvas,
    roundedRect(size / 2, size / 2, size, size, size * cornerRatio),
    gradientColor(size),
  );

  const artWidth = artBounds.maxX - artBounds.minX;
  const artHeight = artBounds.maxY - artBounds.minY;
  const scale = (size * contentScale) / Math.max(artWidth, artHeight);
  const offsetX = size / 2 - ((artBounds.minX + artBounds.maxX) / 2) * scale;
  const offsetY = size / 2 - ((artBounds.minY + artBounds.maxY) / 2) * scale;
  const radius = (strokeWidth / 2) * scale;

  for (const polyline of strokes) {
    for (let index = 0; index < polyline.length - 1; index += 1) {
      const [ax, ay] = polyline[index];
      const [bx, by] = polyline[index + 1];
      fill(
        canvas,
        capsule(
          offsetX + ax * scale,
          offsetY + ay * scale,
          offsetX + bx * scale,
          offsetY + by * scale,
          radius,
        ),
        () => markColor,
      );
    }
  }

  return encodePng(size, canvas.pixels);
}

const targets = [
  { file: 'icon-192.png', size: 192, options: { cornerRatio: 0.22, contentScale: 0.72 } },
  { file: 'icon-512.png', size: 512, options: { cornerRatio: 0.22, contentScale: 0.72 } },
  { file: 'icon-maskable-512.png', size: 512, options: { cornerRatio: 0, contentScale: 0.55 } },
  { file: 'apple-touch-icon.png', size: 180, options: { cornerRatio: 0, contentScale: 0.66 } },
];

mkdirSync(iconsDirectory, { recursive: true });
for (const target of targets) {
  writeFileSync(resolve(iconsDirectory, target.file), drawIcon(target.size, target.options));
  process.stdout.write(`generated icons/${target.file}\n`);
}
