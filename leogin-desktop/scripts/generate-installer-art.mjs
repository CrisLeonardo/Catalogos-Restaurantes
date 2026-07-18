// Genera el arte de marca del instalador NSIS (header.bmp, sidebar.bmp):
// antes el instalador usaba el wizard genérico de NSIS sin ninguna imagen.
// Sin dependencias (node puro) — dibuja a mano el mismo mark que
// src/components/leogin-logo.tsx (fondo #1C1C1E + "L" en gradiente
// E8534A→F5A030, mismas coordenadas del viewBox 100x100) y escribe BMP de
// 24 bits sin comprimir, el único formato que acepta NSIS/MUI2 para
// MUI_HEADERIMAGE_BITMAP / MUI_WELCOMEFINISHPAGE_BITMAP.
//
// Uso: node scripts/generate-installer-art.mjs
// Referenciado desde src-tauri/tauri.conf.json (bundle.windows.nsis).

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'src-tauri', 'installer');
mkdirSync(OUT_DIR, { recursive: true });

const DARK = [0x1c, 0x1c, 0x1e]; // #1C1C1E, mismo fondo del mark
const GRAD_FROM = [0xe8, 0x53, 0x4a]; // #E8534A
const GRAD_TO = [0xf5, 0xa0, 0x30]; // #F5A030
const SS = 4; // supersampling para bordes suaves sin librería de gráficos

function lerp(a, b, t) { return a + (b - a) * t; }
function mix(c1, c2, t) { return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)]; }

/** Test de "dentro del rect" con esquinas redondeadas. */
function inRoundedRect(x, y, rx0, ry0, rx1, ry1, radius) {
  if (x < rx0 || x > rx1 || y < ry0 || y > ry1) return false;
  const cx = x < rx0 + radius ? rx0 + radius : x > rx1 - radius ? rx1 - radius : x;
  const cy = y < ry0 + radius ? ry0 + radius : y > ry1 - radius ? ry1 - radius : y;
  if ((x < rx0 + radius || x > rx1 - radius) && (y < ry0 + radius || y > ry1 - radius)) {
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius * radius;
  }
  return true;
}

/** El path del mark `M27 19 h18 v44 h27 v18 H27 Z` = unión de 2 rects (viewBox 100x100). */
function inMark(x, y) {
  const stem = x >= 27 && x <= 45 && y >= 19 && y <= 81;
  const foot = x >= 45 && x <= 72 && y >= 63 && y <= 81;
  return stem || foot;
}

/** Color del gradiente lineal del mark (mismo x1,y1→x2,y2 que el SVG: 27,19 → 72,81). */
function markGradientColor(x, y) {
  const dx = 72 - 27, dy = 81 - 19;
  const t = Math.max(0, Math.min(1, ((x - 27) * dx + (y - 19) * dy) / (dx * dx + dy * dy)));
  return mix(GRAD_FROM, GRAD_TO, t);
}

/**
 * Dibuja el mark (viewBox 100x100) escalado dentro de un cuadro [bx,by,size].
 * badge=true agrega el fondo #1C1C1E propio del logo (para superficies que
 * no son ya de ese color, ej. el sidebar con degradado).
 */
function drawMark(px, x, y, bx, by, size, badge) {
  const lx = x - bx, ly = y - by;
  if (lx < 0 || lx > size || ly < 0 || ly > size) return null;
  const vx = (lx / size) * 100, vy = (ly / size) * 100;
  if (badge) {
    if (!inRoundedRect(vx, vy, 0, 0, 100, 100, 22)) return null;
    if (inMark(vx, vy)) return markGradientColor(vx, vy);
    return DARK;
  }
  if (inMark(vx, vy)) return markGradientColor(vx, vy);
  return null;
}

/** Fondo con leve resplandor radial de marca sobre un dorado oscuro (mismo lenguaje del hero del landing). */
function heroBackground(x, y, w, h) {
  const base = mix([11, 11, 12], [20, 20, 22], y / h); // #0b0b0c → #141416, top→bottom
  const gx = w * 0.5, gy = h * 0.18;
  const dist = Math.hypot(x - gx, y - gy) / (Math.max(w, h) * 0.55);
  const glow = Math.max(0, 1 - dist);
  const accent = mix(GRAD_FROM, GRAD_TO, y / h);
  return mix(base, accent, glow * 0.35);
}

function render(width, height, paint) {
  const W = width * SS, H = height * SS;
  const buf = new Float64Array(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = paint(x / SS, y / SS, width, height);
      const i = (y * W + x) * 3;
      buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2];
    }
  }
  // Downsample SSxSS → 1x1 promediando bloques.
  const out = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * W + (x * SS + sx)) * 3;
          r += buf[i]; g += buf[i + 1]; b += buf[i + 2];
        }
      }
      const n = SS * SS;
      const o = (y * width + x) * 3;
      out[o] = Math.round(r / n); out[o + 1] = Math.round(g / n); out[o + 2] = Math.round(b / n);
    }
  }
  return out;
}

/** BMP de 24 bits sin comprimir (BI_RGB), bottom-up — el formato que exige NSIS/MUI2. */
function writeBmp(path, width, height, rgb) {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelArraySize = rowSize * height;
  const fileSize = 14 + 40 + pixelArraySize;
  const buf = Buffer.alloc(fileSize);

  buf.write('BM', 0, 'ascii');
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(0, 6);
  buf.writeUInt32LE(14 + 40, 10);

  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22); // positivo = bottom-up
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(0, 30); // BI_RGB
  buf.writeUInt32LE(pixelArraySize, 34);
  buf.writeInt32LE(2835, 38);
  buf.writeInt32LE(2835, 42);
  buf.writeUInt32LE(0, 46);
  buf.writeUInt32LE(0, 50);

  let offset = 14 + 40;
  for (let y = height - 1; y >= 0; y--) { // bottom-up
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      // BMP guarda BGR, no RGB.
      buf[offset++] = rgb[i + 2];
      buf[offset++] = rgb[i + 1];
      buf[offset++] = rgb[i];
    }
    offset += rowSize - width * 3; // padding de fila a múltiplo de 4
  }

  writeFileSync(path, buf);
  console.log(`  ✓ ${path} (${width}x${height}, ${(fileSize / 1024).toFixed(1)} KB)`);
}

// ── header.bmp (150x57) — mark centrado sobre el fondo oscuro del logo ──
const HEADER_W = 150, HEADER_H = 57;
const headerSize = 38;
const headerBx = HEADER_W - headerSize - 14; // alineado a la derecha, margen 14px
const headerBy = (HEADER_H - headerSize) / 2;
const header = render(HEADER_W, HEADER_H, (x, y) => {
  const mark = drawMark(null, x, y, headerBx, headerBy, headerSize, false);
  return mark ?? DARK;
});
writeBmp(join(OUT_DIR, 'header.bmp'), HEADER_W, HEADER_H, header);

// ── sidebar.bmp (164x314) — fondo con resplandor de marca + mark en badge ──
const SIDE_W = 164, SIDE_H = 314;
const sideSize = 84;
const sideBx = (SIDE_W - sideSize) / 2;
const sideBy = 46;
const sidebar = render(SIDE_W, SIDE_H, (x, y, w, h) => {
  const mark = drawMark(null, x, y, sideBx, sideBy, sideSize, true);
  return mark ?? heroBackground(x, y, w, h);
});
writeBmp(join(OUT_DIR, 'sidebar.bmp'), SIDE_W, SIDE_H, sidebar);

console.log('\n✓ Arte del instalador generado en src-tauri/installer/.');
console.log('  Referenciado desde tauri.conf.json (bundle.windows.nsis.headerImage/sidebarImage).');
