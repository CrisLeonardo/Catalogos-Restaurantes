// Exporta los videos a out/ (MP4 H.264, 30 fps) y los revisa con ffprobe.
//   npm run render            → los 3 videos completos y los 3 ganchos sueltos
//   npm run render -- A       → solo el principal (gancho A)
// Licencia de Remotion: gratis para personas y equipos de hasta 3; si aplica
// otra, pon la clave en REMOTION_LICENSE_KEY y se pasa sola.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const correr = (args) => execFileSync(npx, args, { cwd: RAIZ, stdio: 'inherit', shell: process.platform === 'win32' });
const leer = (args) => execFileSync(npx, args, { cwd: RAIZ, encoding: 'utf8', shell: process.platform === 'win32' });

if (!existsSync(join(RAIZ, 'public', 'capturas', 'capturas.json'))) {
  console.error('Faltan las capturas: corre antes  npm run seed  y  npm run grabar  (ver README).');
  process.exit(1);
}
if (!existsSync(join(RAIZ, 'public', 'audio', 'musica.wav'))) {
  execFileSync(process.execPath, [join(RAIZ, 'scripts', 'musica.mjs')], { stdio: 'inherit' });
}
mkdirSync(join(RAIZ, 'out'), { recursive: true });

const TODOS = [
  ['Leogin-40s-A', 'leogin-40s-A-dolor.mp4'],
  ['Leogin-40s-B', 'leogin-40s-B-resultado.mp4'],
  ['Leogin-40s-C', 'leogin-40s-C-cronometro.mp4'],
  ['Gancho-A-dolor', 'gancho-A-dolor-3s.mp4'],
  ['Gancho-B-resultado', 'gancho-B-resultado-3s.mp4'],
  ['Gancho-C-cronometro', 'gancho-C-cronometro-3s.mp4'],
];
const pedidos = process.argv.slice(2);
const lista = pedidos.length ? TODOS.filter(([id]) => pedidos.some((p) => id.includes(`-${p}`) || id === p)) : TODOS;
const licencia = process.env.REMOTION_LICENSE_KEY ? [`--license-key=${process.env.REMOTION_LICENSE_KEY}`] : [];

for (const [id, archivo] of lista) {
  correr(['remotion', 'render', id, `out/${archivo}`, '--codec=h264', ...licencia]);
  const info = leer(['remotion', 'ffprobe', '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,r_frame_rate,pix_fmt:format=duration', '-of', 'default=nw=1', `out/${archivo}`]);
  console.log(`\n${archivo}\n${info}`);
}
