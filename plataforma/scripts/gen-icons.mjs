/**
 * Genera los iconos PWA on-brand (sin dependencias externas).
 * Fondo asfalto (#0b0b0c) + círculo coral (#D97757), centrado para
 * cumplir la "safe zone" de iconos maskable.
 *
 *   node scripts/gen-icons.mjs
 *
 * Salida: public/icon-192.png y public/icon-512.png
 * Reemplázalos por el logo real cuando lo tengas.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

const BG = [0x0b, 0x0b, 0x0c]; // asfalto
const FG = [0xd9, 0x77, 0x57]; // coral / acento

function crc32(buf) {
  let c = ~0 >>> 0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function makePng(size) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type 2 = RGB

  const cx = size / 2;
  const cy = size / 2;
  const rad = size * 0.32;
  const rad2 = rad * rad;

  const rowLen = size * 3 + 1;
  const raw = Buffer.alloc(rowLen * size);
  for (let y = 0; y < size; y++) {
    raw[y * rowLen] = 0; // filtro 0 (none)
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const [r, g, b] = dx * dx + dy * dy <= rad2 ? FG : BG;
      const o = y * rowLen + 1 + x * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }

  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(publicDir, { recursive: true });
for (const size of [192, 512]) {
  const out = join(publicDir, `icon-${size}.png`);
  writeFileSync(out, makePng(size));
  console.log(`✓ ${out}`);
}
