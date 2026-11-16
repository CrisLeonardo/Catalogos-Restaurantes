// Exporta «Un solo lugar» a out/un-lugar/ (MP4 H.264, 30 fps).
//   npm run un-lugar:render               → vertical y horizontal
//   npm run un-lugar:render -- vertical   → solo ese formato
// Usa las capturas y el QR de «Otra vez»: corre antes  npm run otra-vez:grabar.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const publico = join(RAIZ, 'public', 'otra-vez');

if (!existsSync(join(publico, 'capturas', 'capturas.json'))) {
  console.error('Faltan las capturas: corre antes  npm run otra-vez:grabar  (ver README).');
  process.exit(1);
}
for (const [archivo, guion] of [['banda-un-lugar.wav', 'un-lugar/sonido.mjs'], ['qr.svg', 'otra-vez/qr.mjs']]) {
  if (!existsSync(join(publico, archivo))) execFileSync(process.execPath, [join(RAIZ, 'scripts', guion)], { stdio: 'inherit' });
}
mkdirSync(join(RAIZ, 'out', 'un-lugar'), { recursive: true });

const filtros = process.argv.slice(2);
const licencia = process.env.REMOTION_LICENSE_KEY ? [`--license-key=${process.env.REMOTION_LICENSE_KEY}`] : [];
for (const formato of ['vertical', 'horizontal']) {
  if (filtros.length && !filtros.includes(formato)) continue;
  execFileSync(npx, ['remotion', 'render', `UnSoloLugar-${formato}`, `out/un-lugar/leogin-un-solo-lugar-${formato}.mp4`, '--codec=h264', '--crf=18', ...licencia], { cwd: RAIZ, stdio: 'inherit', shell: process.platform === 'win32' });
}
