// Exporta «Una sola toma» en sus dos formatos (MP4 H.264, 30 fps).
//   npm run render:una-toma          → vertical y horizontal
//   npm run render:una-toma -- V     → solo vertical (o H)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const opciones = { cwd: RAIZ, shell: process.platform === 'win32' };
if (!existsSync(join(RAIZ, 'public', 'una-toma', 'banda.wav'))) {
  execFileSync(process.execPath, [join(RAIZ, 'scripts', 'banda-una-toma.mjs')], { stdio: 'inherit' });
}
mkdirSync(join(RAIZ, 'out', 'una-toma'), { recursive: true });
const licencia = process.env.REMOTION_LICENSE_KEY ? [`--license-key=${process.env.REMOTION_LICENSE_KEY}`] : [];
const pedido = process.argv[2];
const TODOS = [['V', 'UnaToma-Vertical', 'leogin-una-toma-vertical.mp4'], ['H', 'UnaToma-Horizontal', 'leogin-una-toma-horizontal.mp4']];
for (const [letra, id, archivo] of TODOS.filter(([l]) => !pedido || l === pedido)) {
  const salida = `out/una-toma/${archivo}`;
  execFileSync(npx, ['remotion', 'render', id, salida, '--codec=h264', '--crf=17', ...licencia], { ...opciones, stdio: 'inherit' });
  const info = execFileSync(npx, ['remotion', 'ffprobe', '-v', 'error', '-show_entries', 'stream=codec_type,width,height,r_frame_rate:format=duration', '-of', 'default=nw=1', salida], { ...opciones, encoding: 'utf8' });
  console.log(`\n${letra} · ${archivo}\n${info}`);
}
