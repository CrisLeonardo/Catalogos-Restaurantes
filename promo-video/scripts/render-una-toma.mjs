// Exporta la serie «Una sola toma» (MP4 H.264, 30 fps).
//   npm run render:una-toma                     → los 3 videos, vertical y horizontal
//   npm run render:una-toma -- comedor          → solo ese video (los dos formatos)
//   npm run render:una-toma -- comedor V        → solo ese video en vertical (o H)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const opciones = { cwd: RAIZ, shell: process.platform === 'win32' };
const VIDEOS = ['meseros', 'comedor', 'domicilio'];
const [soloVideo, soloFormato] = process.argv.slice(2);
const licencia = process.env.REMOTION_LICENSE_KEY ? [`--license-key=${process.env.REMOTION_LICENSE_KEY}`] : [];
mkdirSync(join(RAIZ, 'out', 'una-toma'), { recursive: true });

for (const video of VIDEOS.filter((v) => !soloVideo || v === soloVideo)) {
  if (!existsSync(join(RAIZ, 'public', 'una-toma', `banda-${video}.wav`))) {
    execFileSync(process.execPath, [join(RAIZ, 'scripts', 'banda-una-toma.mjs'), video], { stdio: 'inherit' });
  }
  for (const [letra, formato] of [['V', 'vertical'], ['H', 'horizontal']].filter(([l]) => !soloFormato || l === soloFormato)) {
    const salida = `out/una-toma/leogin-${video}-${formato}.mp4`;
    execFileSync(npx, ['remotion', 'render', `UnaToma-${video}-${formato}`, salida, '--codec=h264', '--crf=17', '--log=error', ...licencia], { ...opciones, stdio: 'inherit' });
    const info = execFileSync(npx, ['remotion', 'ffprobe', '-v', 'error', '-show_entries', 'stream=codec_type,width,height:format=duration', '-of', 'default=nw=1', salida], { ...opciones, encoding: 'utf8' });
    console.log(`${letra} · ${salida} · ${info.replace(/\s+/g, ' ')}`);
  }
}
