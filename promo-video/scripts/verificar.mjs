// Revisión del video ya exportado:
//   npm run verificar [archivo]   (por defecto out/leogin-40s-A-dolor.mp4)
// Saca los fotogramas de los segundos 0, 1, 3, 10, 20 y el final en
// out/verificacion/ para mirarlos en tamaño de teléfono, y confirma con
// ffprobe la duración, la resolución y los cuadros por segundo.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const video = process.argv[2] ?? 'out/leogin-40s-A-dolor.mp4';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const opciones = { cwd: RAIZ, encoding: 'utf8', shell: process.platform === 'win32' };
const correr = (args) => execFileSync(npx, args, opciones);

const info = JSON.parse(correr(['remotion', 'ffprobe', '-v', 'error', '-show_entries',
  'stream=codec_type,codec_name,width,height,r_frame_rate,pix_fmt:format=duration', '-of', 'json', video]));
const v = info.streams.find((s) => s.codec_type === 'video');
const a = info.streams.find((s) => s.codec_type === 'audio');
const dur = Number(info.format.duration);
const [n, d] = v.r_frame_rate.split('/').map(Number);
console.log(`${video}: ${v.codec_name} ${v.width}×${v.height} · ${n / d} fps · ${v.pix_fmt} · ${dur.toFixed(2)} s · audio ${a ? a.codec_name : 'NO'}`);

const fallas = [];
if (v.width !== 1080 || v.height !== 1920) fallas.push('la resolución no es 1080×1920');
if (n / d !== 30) fallas.push('no está a 30 fps');
if (v.codec_name !== 'h264') fallas.push('no es H.264');
if (dur < 29 || dur > 46) fallas.push('la duración no está entre 30 y 45 s');

const dir = join(RAIZ, 'out', 'verificacion');
mkdirSync(dir, { recursive: true });
for (const s of [0, 1, 3, 10, 20, Math.max(0, dur - 0.1)]) {
  const nombre = `s${String(Math.floor(s)).padStart(2, '0')}.png`;
  correr(['remotion', 'ffmpeg', '-v', 'error', '-y', '-ss', String(s), '-i', video, '-frames:v', '1', '-vf', 'scale=540:-1', join('out', 'verificacion', nombre)]);
}
console.log('fotogramas en out/verificacion/ (a 540 px de ancho, como se ve en un teléfono)');
if (fallas.length) {
  console.error('FALLA: ' + fallas.join('; '));
  process.exit(1);
}
console.log('OK');
