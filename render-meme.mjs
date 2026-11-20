// render-meme.mjs — renders the GTA 6 meme for gta6-meme-x-01 from scratch.
// A tiny software rasterizer (RGBA buffer) + a hand-rolled PNG encoder
// (node:zlib deflate + CRC32). No dependencies, no network, deterministic.
// Usage: node render-meme.mjs [out.png]  (default: meme.png)

import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const W = 1024;
const H = 1024;
const buf = new Uint8ClampedArray(W * H * 4);

// ---------------------------------------------------------------------------
// Pixel buffer helpers
// ---------------------------------------------------------------------------
function px(x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
}

function fillRect(x0, y0, x1, y1, c) {
  const [r, g, b] = c;
  for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) {
    for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) {
      px(x, y, r, g, b);
    }
  }
}

// Vertical gradient band.
function vgrad(x0, y0, x1, y1, top, bot) {
  for (let y = y0; y < y1; y++) {
    const t = (y - y0) / Math.max(1, y1 - y0 - 1);
    const r = Math.round(top[0] + (bot[0] - top[0]) * t);
    const g = Math.round(top[1] + (bot[1] - top[1]) * t);
    const b = Math.round(top[2] + (bot[2] - top[2]) * t);
    for (let x = x0; x < x1; x++) px(x, y, r, g, b);
  }
}

function disc(cx, cy, rad, c) {
  const [r, g, b] = c;
  for (let y = Math.floor(cy - rad); y <= Math.ceil(cy + rad); y++) {
    for (let x = Math.floor(cx - rad); x <= Math.ceil(cx + rad); x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= rad * rad) px(x, y, r, g, b);
    }
  }
}

function ellipse(cx, cy, rx, ry, c) {
  const [r, g, b] = c;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) px(x, y, r, g, b);
    }
  }
}

// Filled polygon (scanline).
function poly(pts, c) {
  const [r, g, b] = c;
  let minY = Infinity, maxY = -Infinity;
  for (const [, y] of pts) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(H - 1, Math.ceil(maxY)); y++) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.max(0, Math.ceil(xs[k])); x <= Math.min(W - 1, Math.floor(xs[k + 1])); x++) {
        px(x, y, r, g, b);
      }
    }
  }
}

// Thick line (drawn as a series of discs).
function line(x0, y0, x1, y1, w, c) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const steps = Math.ceil(len);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    disc(x0 + dx * t, y0 + dy * t, w / 2, c);
  }
}

// 4-point sparkle star (diamond star) centred at (cx, cy).
function sparkle(cx, cy, outer, inner, c) {
  const pts = [];
  for (let k = 0; k < 8; k++) {
    const ang = (Math.PI / 4) * k - Math.PI / 2;
    const rad = k % 2 === 0 ? outer : inner;
    pts.push([cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad]);
  }
  poly(pts, c);
}

// 5-point star.
function star5(cx, cy, outer, inner, c) {
  const pts = [];
  for (let k = 0; k < 10; k++) {
    const ang = (Math.PI / 5) * k - Math.PI / 2;
    const rad = k % 2 === 0 ? outer : inner;
    pts.push([cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad]);
  }
  poly(pts, c);
}

// ---------------------------------------------------------------------------
// 5x7 bitmap font (own table, A-Z 0-9 and punctuation)
// ---------------------------------------------------------------------------
const FONT = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ',': ['00000', '00000', '00000', '00000', '01100', '00100', '01000'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  '?': ['01110', '10001', '00001', '00110', '00100', '00000', '00100'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  "'": ['00100', '00100', '01000', '00000', '00000', '00000', '00000'],
  '*': ['00000', '10101', '01110', '10101', '00000', '00000', '00000'],
  '-': ['00000', '00000', '00000', '01110', '00000', '00000', '00000'],
  '(': ['00010', '00100', '01000', '01000', '01000', '00100', '00010'],
  ')': ['01000', '00100', '00010', '00010', '00010', '00100', '01000'],
  '&': ['01100', '10010', '10100', '01000', '10101', '10010', '01101'],
  $: ['00100', '01111', '10100', '01110', '00101', '11110', '00100'],
  '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
};

function textWidth(str, scale) {
  return str.length * 6 * scale - scale;
}

function drawTextRaw(str, x, y, scale, c) {
  const [r, g, b] = c;
  let cx = x;
  for (const ch of str.toUpperCase()) {
    const glyph = FONT[ch] || FONT[' '];
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (glyph[row][col] === '1') {
          fillRect(cx + col * scale, y + row * scale, cx + (col + 1) * scale, y + (row + 1) * scale, [r, g, b]);
        }
      }
    }
    cx += 6 * scale;
  }
}

// Centred text with a thick black outline (classic meme caption).
function drawText(str, cx, y, scale, fill) {
  const w = textWidth(str, scale);
  const x = Math.round(cx - w / 2);
  const o = Math.max(2, Math.round(scale * 0.35));
  const black = [0, 0, 0];
  for (const [dx, dy] of [[-o, 0], [o, 0], [0, -o], [0, o], [-o, -o], [o, -o], [-o, o], [o, o]]) {
    drawTextRaw(str, x + dx, y + dy, scale, black);
  }
  drawTextRaw(str, x, y, scale, fill);
}

// ---------------------------------------------------------------------------
// Scene pieces
// ---------------------------------------------------------------------------
const INK = [12, 10, 26];          // near-black purple
const WHITE = [255, 255, 255];
const MAGENTA = [232, 28, 139];    // make.fun coin magenta
const NEON_PINK = [255, 64, 170];
const CYAN = [64, 224, 255];

function drawSun(cx, cy, rad) {
  // Synthwave sun: yellow top fading to magenta, with slit gaps low down.
  for (let y = Math.floor(cy - rad); y <= Math.ceil(cy + rad); y++) {
    for (let x = Math.floor(cx - rad); x <= Math.ceil(cx + rad); x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy > rad * rad) continue;
      const t = (y - (cy - rad)) / (2 * rad);
      const r = Math.round(255 + (255 - 255) * t);
      const g = Math.round(214 - (214 - 60) * t);
      const b = Math.round(120 - (120 - 150) * t * 0.4);
      px(x, y, r, g, Math.max(40, b));
    }
  }
  // Slits across the lower half, clipped to the sun's circle.
  const sky = [58, 16, 88];
  let gap = 6;
  for (let y = cy + 10; y < cy + rad; y += gap + 8) {
    const dy = y - cy;
    const half = Math.sqrt(Math.max(0, rad * rad - dy * dy));
    fillRect(Math.floor(cx - half), y, Math.ceil(cx + half), y + gap, sky);
    gap += 3;
  }
}

function drawSkyline(yBase) {
  // Dark building silhouettes along the horizon, a few lit windows.
  const heights = [46, 78, 34, 96, 58, 120, 40, 84, 52, 66, 30, 92, 44, 70];
  let x = 0;
  for (let i = 0; i < heights.length; i++) {
    const w = 58 + ((i * 37) % 40);
    const h = heights[i];
    fillRect(x, yBase - h, x + w, yBase, [26, 10, 44]);
    // A couple of lit windows.
    for (let k = 0; k < 3; k++) {
      const wx = x + 10 + ((i * 13 + k * 29) % Math.max(8, w - 20));
      const wy = yBase - h + 12 + ((i * 7 + k * 17) % Math.max(8, h - 24));
      fillRect(wx, wy, wx + 6, wy + 8, [255, 214, 110]);
    }
    x += w + 14;
    if (x > W) break;
  }
}

function drawPalm(x, baseY, s, lean) {
  // Curved trunk + drooping fronds, dark silhouette.
  const topX = x + lean * 70 * s;
  const topY = baseY - 150 * s;
  let px0 = x, py0 = baseY;
  for (let t = 0; t <= 1.0001; t += 0.1) {
    const nx = x + lean * 70 * s * t * t;
    const ny = baseY - 150 * s * t;
    line(px0, py0, nx, ny, 12 * s, [16, 8, 30]);
    px0 = nx; py0 = ny;
  }
  // Fronds arc up and out like a fan, tips drooping slightly.
  for (let k = 0; k < 7; k++) {
    const t = k / 6;
    const ang = Math.PI * (1.08 + t * 0.84); // fan across the top
    const len = 100 * s;
    const mx = topX + Math.cos(ang) * len * 0.62;
    const my = topY + Math.sin(ang) * len * 0.62;
    const ex = topX + Math.cos(ang) * len;
    const ey = topY + Math.sin(ang) * len + 34 * s;
    line(topX, topY, mx, my, 7 * s, [16, 8, 30]);
    line(mx, my, ex, ey, 7 * s, [16, 8, 30]);
  }
  // Coconuts.
  disc(topX - 8 * s, topY + 10 * s, 7 * s, [16, 8, 30]);
  disc(topX + 9 * s, topY + 12 * s, 7 * s, [16, 8, 30]);
}

// The make.fun ghost mascot, worked into the scene as a character standing
// on the road: white sheet body with a thick black outline, two black
// four-point sparkle eyes, one round little hand raised, holding the magenta
// coin with a white star.
function drawGhost(cx, feetY, h) {
  const w = h * 0.62;
  const half = w / 2;
  const topY = feetY - h;
  // Body outline: same shape, scaled up from the centre, in black.
  const body = ghostOutline(cx, topY, w, h);
  const ocx = cx, ocy = topY + h * 0.52;
  const out = body.map(([x, y]) => {
    const dx = x - ocx, dy = y - ocy;
    return [ocx + dx * 1.07, ocy + dy * 1.07];
  });
  poly(out, INK);
  poly(body, WHITE);
  // Wavy hem shadow line (thin dark scallops along the bottom edge).
  // Eyes: two black four-point sparkles.
  const eyeY = topY + h * 0.34;
  const eyeDX = w * 0.2;
  sparkle(cx - eyeDX, eyeY, h * 0.075, h * 0.026, INK);
  sparkle(cx + eyeDX, eyeY, h * 0.075, h * 0.026, INK);
  // Little round hand raised on the right, holding the coin up.
  const handX = cx + half * 0.92;
  const handY = topY + h * 0.42;
  disc(handX, handY, h * 0.055, INK);
  disc(handX, handY, h * 0.042, WHITE);
  // Magenta coin with a white star, held above the hand.
  const coinX = handX + w * 0.10;
  const coinY = handY - h * 0.16;
  disc(coinX, coinY, h * 0.085, INK);
  disc(coinX, coinY, h * 0.072, MAGENTA);
  star5(coinX, coinY, h * 0.052, h * 0.021, WHITE);
  // Soft shadow under the ghost.
  ellipse(cx, feetY + 8, w * 0.52, 12, [0, 0, 0]);
}

// Ghost body outline: dome top, straight sides, wavy 3-scallop hem.
function ghostOutline(cx, topY, w, h) {
  const pts = [];
  const half = w / 2;
  const domeR = half;
  const domeCY = topY + domeR;
  // Dome arc, left to right over the top.
  for (let a = Math.PI; a <= 2 * Math.PI; a += 0.08) {
    pts.push([cx + Math.cos(a) * domeR, domeCY + Math.sin(a) * domeR * 0.92]);
  }
  // Right side down to the hem.
  const hemY = topY + h;
  pts.push([cx + half, hemY - h * 0.06]);
  // Wavy hem: three scallops, right to left.
  const scallops = 3;
  for (let s = 0; s < scallops; s++) {
    const x0 = cx + half - (s * w) / scallops;
    const x1 = cx + half - ((s + 1) * w) / scallops;
    for (let t = 0; t <= 1.0001; t += 0.1) {
      const x = x0 + (x1 - x0) * t;
      const y = hemY - Math.sin(t * Math.PI) * h * 0.055;
      pts.push([x, y]);
    }
  }
  pts.push([cx - half, hemY - h * 0.06]);
  return pts;
}

function drawBillboard(x, y, w, h) {
  // Posts.
  fillRect(x + 24, y + h, x + 34, y + h + 96, [30, 22, 52]);
  fillRect(x + w - 34, y + h, x + w - 24, y + h + 96, [30, 22, 52]);
  // Board.
  fillRect(x, y, x + w, y + h, [18, 12, 44]);
  fillRect(x, y, x + w, y + 6, NEON_PINK);
  fillRect(x, y + h - 6, x + w, y + h, NEON_PINK);
  fillRect(x, y, x + 6, y + h, NEON_PINK);
  fillRect(x + w - 6, y, x + w, y + h, NEON_PINK);
  // "make.fun" big, magenta on dark.
  const s1 = 6;
  drawText('make.fun', x + w / 2, y + 30, s1, MAGENTA);
  // Pitch line, white.
  const s2 = 4;
  drawText('AGENTS EARN', x + w / 2, y + 96, s2, WHITE);
  drawText('REAL MONEY', x + w / 2, y + 130, s2, CYAN);
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
function render() {
  // Sky: deep purple -> magenta -> orange at the horizon.
  vgrad(0, 0, W, 300, [30, 8, 66], [122, 24, 96]);
  vgrad(0, 300, W, 560, [122, 24, 96], [255, 122, 60]);
  // A few stars high up.
  const stars = [[80, 60], [210, 110], [330, 48], [700, 70], [860, 120], [940, 44], [470, 90], [600, 36]];
  for (const [sx, sy] of stars) sparkle(sx, sy, 7, 2.5, [255, 240, 200]);
  // Sun.
  drawSun(512, 400, 132);
  // Skyline on the horizon.
  drawSkyline(560);
  // Ocean band.
  vgrad(0, 560, W, 664, [24, 16, 78], [40, 26, 110]);
  for (let i = 0; i < 10; i++) {
    const y = 576 + i * 9;
    const x0 = 60 + ((i * 173) % 700);
    fillRect(x0, y, x0 + 120 - i * 6, y + 3, [255, 150, 120]);
  }
  // Beach strip.
  fillRect(0, 664, W, 700, [236, 196, 140]);
  // Road.
  fillRect(0, 700, W, H, [22, 18, 40]);
  fillRect(0, 700, W, 708, [255, 200, 90]);
  // Centre dashes.
  for (let x = 40; x < W; x += 110) fillRect(x, 856, x + 62, 866, [255, 220, 120]);
  // Palms at the road edges.
  drawPalm(96, 700, 1.05, 0.5);
  drawPalm(940, 700, 1.0, -0.55);
  drawPalm(30, 700, 0.8, 0.35);
  // Billboard (left, in the scene, not a sticker).
  drawBillboard(36, 396, 340, 176);
  // The ghost, standing on the road like it has been waiting 13 years.
  drawGhost(640, 838, 300);
  // Captions (classic meme text, big + outlined).
  drawText('13 YEARS WAITING', 512, 36, 10, WHITE);
  drawText('FOR GTA 6', 512, 128, 10, WHITE);
  drawText('LAUNCH DAY:', 512, 878, 9, WHITE);
  drawText('CALLS IN SICK', 512, 948, 9, [255, 220, 90]);
}

// ---------------------------------------------------------------------------
// PNG encoder (CRC32 + zlib deflate, filter 0 per row)
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  const crc = crc32(Buffer.concat([Buffer.from(type, 'ascii'), data]));
  out.writeUInt32BE(crc, 8 + data.length);
  return out;
}

function encodePNG() {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(H * (1 + W * 4));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 4)] = 0;
    Buffer.from(buf.buffer, y * W * 4, W * 4).copy(raw, y * (1 + W * 4) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
const outPath = process.argv[2] || 'meme.png';
render();
const png = encodePNG();
writeFileSync(outPath, png);
const sha = createHash('sha256').update(png).digest('hex');
console.log(`meme written: ${outPath} (${png.length} bytes, sha256 ${sha.slice(0, 12)}...)`);
