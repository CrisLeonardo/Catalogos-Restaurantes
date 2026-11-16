// Prepara «Un solo lugar» para la portada de la web: deja en
// plataforma/public/un-lugar/ los dos MP4 livianos, las dos portadas y los dos
// bucles sin sonido que usa components/landing-intro.tsx.
//   npm run un-lugar:web      (después de npm run un-lugar:render)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DESTINO = join(RAIZ, '..', 'plataforma', 'public', 'un-lugar');
const H = join(RAIZ, 'out', 'un-lugar', 'leogin-un-solo-lugar-horizontal.mp4');
const V = join(RAIZ, 'out', 'un-lugar', 'leogin-un-solo-lugar-vertical.mp4');
if (!existsSync(H) || !existsSync(V)) {
  console.error('Faltan los videos: corre antes  npm run un-lugar:render');
  process.exit(1);
}
mkdirSync(DESTINO, { recursive: true });
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const ffmpeg = (...args) => execFileSync(npx, ['remotion', 'ffmpeg', '-y', '-v', 'error', ...args], { cwd: RAIZ, stdio: 'inherit', shell: process.platform === 'win32' });
const a = (nombre) => join(DESTINO, nombre);

// El video completo, con sonido, para la ventana.
const mp4 = ['-c:v', 'libx264', '-crf', '27', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart'];
ffmpeg('-i', H, '-vf', 'scale=1280:720', ...mp4, a('horizontal.mp4'));
ffmpeg('-i', V, '-vf', 'scale=720:1280', ...mp4, a('vertical.mp4'));
// La tarjeta: el gancho completo («8 lugares») como imagen fija…
const CUADRO = 'crop=1080:1080:0:90'; // la versión vertical, recortada arriba
ffmpeg('-ss', '5', '-i', H, '-frames:v', '1', '-q:v', '4', a('portada.jpg'));
ffmpeg('-ss', '5', '-i', V, '-frames:v', '1', '-vf', CUADRO, '-q:v', '4', a('portada-cuadrada.jpg'));
// …y encima un bucle sin sonido: la cuenta de lugares (y, en ancho, hasta el título).
const webm = ['-an', '-c:v', 'libvpx-vp9', '-crf', '40', '-b:v', '0', '-row-mt', '1'];
ffmpeg('-t', '9.6', '-i', H, '-vf', 'scale=960:540', ...webm, a('bucle.webm'));
ffmpeg('-t', '5.4', '-i', V, '-vf', `${CUADRO},scale=640:640`, ...webm, a('bucle-cuadrado.webm'));

for (const n of ['horizontal.mp4', 'vertical.mp4', 'portada.jpg', 'portada-cuadrada.jpg', 'bucle.webm', 'bucle-cuadrado.webm']) {
  console.log(`${n} · ${(statSync(a(n)).size / 1024).toFixed(0)} KB`);
}
