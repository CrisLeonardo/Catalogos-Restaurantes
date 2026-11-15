// Exporta la serie «Otra vez» a out/otra-vez/ (MP4 H.264, 30 fps).
//   npm run otra-vez:render                → los 6 (3 públicos × vertical y horizontal)
//   npm run otra-vez:render -- meseros     → solo ese público
//   npm run otra-vez:render -- vertical    → solo ese formato
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const correr = (args) => execFileSync(npx, args, { cwd: RAIZ, stdio: 'inherit', shell: process.platform === 'win32' });

if (!existsSync(join(RAIZ, 'public', 'otra-vez', 'capturas', 'capturas.json'))) {
  console.error('Faltan las capturas: corre antes  npm run otra-vez:grabar  (ver README).');
  process.exit(1);
}
for (const [archivo, guion] of [['banda.wav', 'sonido.mjs'], ['qr.svg', 'qr.mjs']]) {
  if (!existsSync(join(RAIZ, 'public', 'otra-vez', archivo))) execFileSync(process.execPath, [join(RAIZ, 'scripts', 'otra-vez', guion)], { stdio: 'inherit' });
}
mkdirSync(join(RAIZ, 'out', 'otra-vez'), { recursive: true });

const filtros = process.argv.slice(2);
const licencia = process.env.REMOTION_LICENSE_KEY ? [`--license-key=${process.env.REMOTION_LICENSE_KEY}`] : [];
for (const publico of ['meseros', 'comedor', 'domicilio']) {
  for (const formato of ['vertical', 'horizontal']) {
    if (filtros.length && !filtros.every((x) => x === publico || x === formato)) continue;
    correr(['remotion', 'render', `OtraVez-${publico}-${formato}`, `out/otra-vez/leogin-otra-vez-${publico}-${formato}.mp4`, '--codec=h264', '--crf=18', ...licencia]);
  }
}
