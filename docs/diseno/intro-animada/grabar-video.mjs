// Graba la intro (intro.html) como video WebM, cuadro por cuadro.
//
// Usa el Playwright y el ffmpeg que ya trae plataforma/ (no instala nada).
// Cada cuadro se pinta con la línea de tiempo detenida en su segundo exacto,
// así el video sale fluido aunque la computadora sea lenta.
//
//   node docs/diseno/intro-animada/grabar-video.mjs                 → 16:9, 30 cps
//   node docs/diseno/intro-animada/grabar-video.mjs --formato v     → 9:16 (WhatsApp, TikTok)
//   node docs/diseno/intro-animada/grabar-video.mjs --fotos 5,20,36 → solo fotos PNG de esos segundos
//   opciones: --fps 30 --salida <archivo.webm> --carpeta <dir>
//
// El ffmpeg de Playwright solo escribe WebM (VP9). Para MP4 (WhatsApp) se
// convierte después: Clipchamp (viene con Windows 11) abre el WebM y exporta MP4.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, '../../..');
const require = createRequire(path.join(raiz, 'plataforma', 'package.json'));
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const formato = opt('formato', 'h') === 'v' ? 'v' : 'h';
const fps = Number(opt('fps', 30));
const fotos = opt('fotos', null);
const carpeta = path.resolve(opt('carpeta', path.join(os.tmpdir(), 'leogin-intro')));
const salida = path.resolve(opt('salida', path.join(carpeta, `intro-leogin-${formato === 'v' ? '9x16' : '16x9'}.webm`)));
fs.mkdirSync(carpeta, { recursive: true });

function buscarFfmpeg() {
  const base = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.cache'), 'ms-playwright');
  const dirs = fs.existsSync(base) ? fs.readdirSync(base).filter((d) => d.startsWith('ffmpeg')).sort().reverse() : [];
  for (const d of dirs) {
    const exe = fs.readdirSync(path.join(base, d)).find((f) => f.startsWith('ffmpeg'));
    if (exe) return path.join(base, d, exe);
  }
  throw new Error('No encontré el ffmpeg de Playwright. Corre `npx playwright install ffmpeg` dentro de plataforma/.');
}

// intro.html está escrito como contenido de Artifact (sin <!doctype>): se envuelve.
const html = fs.readFileSync(path.join(aqui, 'intro.html'), 'utf8');
const envuelto = path.join(carpeta, 'intro-envuelta.html');
fs.writeFileSync(envuelto, `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${html}</body></html>`);

const navegador = await chromium.launch();
const tam = formato === 'v' ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
const pagina = await navegador.newPage({ viewport: tam, deviceScaleFactor: 1 });
await pagina.goto(pathToFileURL(envuelto).href, { waitUntil: 'networkidle' });
await pagina.waitForFunction(() => window.__intro && window.gsap);
await pagina.evaluate(() => window.__intro.ready);
await pagina.evaluate((f) => window.__intro.renderMode(f), formato);
const duracion = await pagina.evaluate(() => window.__intro.duration);

const cuadro = async (t) => {
  await pagina.evaluate((s) => window.__intro.seek(s), t);
  await pagina.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
};

if (fotos) {
  for (const s of fotos.split(',').map(Number)) {
    await cuadro(s);
    const f = path.join(carpeta, `foto-${formato}-${String(s).replace('.', '_')}.png`);
    await pagina.screenshot({ path: f });
    console.log(f);
  }
} else {
  const ff = spawn(buscarFfmpeg(), [
    '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', 'pipe:0',
    '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '24', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '3',
    '-pix_fmt', 'yuv420p', salida,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  // Si ffmpeg se cae, se avisa en vez de seguir pintando cuadros para nadie.
  let ffSalio = null;
  const fin = new Promise((r) => ff.on('close', (c) => { ffSalio = c; r(c); }));
  const total = Math.round(duracion * fps);
  const inicio = Date.now();
  for (let i = 0; i <= total; i++) {
    if (ffSalio !== null) throw new Error(`ffmpeg se detuvo (código ${ffSalio}) en el cuadro ${i}`);
    await cuadro(i / fps);
    const jpg = await pagina.screenshot({ type: 'jpeg', quality: 94 });
    if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % (fps * 5) === 0) console.log(`cuadro ${i}/${total} · ${Math.round((Date.now() - inicio) / 1000)} s`);
  }
  ff.stdin.end();
  const codigo = await fin;
  if (codigo !== 0) throw new Error(`ffmpeg terminó con ${codigo}`);
  console.log(`Listo: ${salida}`);
}
await navegador.close();
