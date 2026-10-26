// Graba la intro (intro.html) como video WebM, cuadro por cuadro, y su banda
// sonora como WAV.
//
// Usa el Playwright y el ffmpeg que ya trae plataforma/ (no instala nada).
// Cada cuadro se pinta con la línea de tiempo detenida en su segundo exacto,
// así el video sale fluido aunque la computadora sea lenta.
//
//   node docs/diseno/intro-animada/grabar-video.mjs                 → 16:9, 30 cps
//   node docs/diseno/intro-animada/grabar-video.mjs --formato v     → 9:16 (WhatsApp, TikTok)
//   node docs/diseno/intro-animada/grabar-video.mjs --fotos 5,20,36 → solo fotos PNG de esos segundos
//   node docs/diseno/intro-animada/grabar-video.mjs --solo-sonido   → solo la banda sonora (WAV)
//   node docs/diseno/intro-animada/grabar-video.mjs --corte 30      → versión de 30 s (Reels, TikTok); --corte 15 → estado de WhatsApp
//   opciones: --fps 30 --salida <archivo.webm> --carpeta <dir>
//
// El ffmpeg de Playwright solo escribe video WebM (VP9), sin audio. Si hay un
// ffmpeg completo en el PATH (con libx264 y aac), el script además arma un MP4
// con sonido listo para WhatsApp. Si no, Clipchamp (viene con Windows 11) junta
// el WebM y el WAV y exporta el MP4.
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
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
const soloSonido = args.includes('--solo-sonido');
const corte = { 30: 'r30', 15: 's15' }[opt('corte', '')] || 'full';
const sufijo = { full: '', r30: '-30s', s15: '-15s' }[corte];
const carpeta = path.resolve(opt('carpeta', path.join(os.tmpdir(), 'leogin-intro')));
const nombre = `intro-leogin-${formato === 'v' ? '9x16' : '16x9'}${sufijo}`;
const salida = path.resolve(opt('salida', path.join(carpeta, `${nombre}.webm`)));
const sonido = path.join(carpeta, `intro-leogin-sonido${sufijo}.wav`);
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

// ¿Hay un ffmpeg completo en el PATH, capaz de escribir MP4 con sonido?
function ffmpegCompleto() {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' });
  return r.status === 0 && /libx264/.test(r.stdout) && /\baac\b/.test(r.stdout) ? 'ffmpeg' : null;
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
await pagina.evaluate(([f, c]) => window.__intro.renderMode(f, c), [formato, corte]);
const duracion = await pagina.evaluate(() => window.__intro.duration);

const cuadro = async (t) => {
  await pagina.evaluate((s) => window.__intro.seek(s), t);
  await pagina.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
};

async function grabarSonido() {
  const b64 = await pagina.evaluate(() => window.__intro.soundtrackWav());
  if (!b64) { console.log('Este navegador no pudo generar el sonido.'); return null; }
  fs.writeFileSync(sonido, Buffer.from(b64, 'base64'));
  console.log(`Sonido: ${sonido}`);
  return sonido;
}

if (fotos) {
  for (const s of fotos.split(',').map(Number)) {
    await cuadro(s);
    const f = path.join(carpeta, `foto-${formato}-${String(s).replace('.', '_')}.png`);
    await pagina.screenshot({ path: f });
    console.log(f);
  }
} else if (soloSonido) {
  await grabarSonido();
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
  console.log(`Video: ${salida}`);

  const wav = await grabarSonido();
  const completo = wav && ffmpegCompleto();
  if (completo) {
    const mp4 = path.join(carpeta, `${nombre}.mp4`);
    const r = spawnSync(completo, ['-y', '-loglevel', 'error', '-i', salida, '-i', wav, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', mp4], { stdio: 'inherit' });
    console.log(r.status === 0 ? `MP4 con sonido: ${mp4}` : 'No se pudo armar el MP4.');
  } else if (wav) {
    console.log('Para el MP4 con sonido: abre el WebM y el WAV en Clipchamp (ambos desde el segundo 0) y exporta.');
  }
}
await navegador.close();
