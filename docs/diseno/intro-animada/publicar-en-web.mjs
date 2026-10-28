// Publica la intro en la portada de distleogin.com.
//
// La fuente sigue siendo intro.html (la misma de la página de prueba). Este
// script la adapta a la CSP de la app y deja en plataforma/:
//   · src/app/intro/intro-html.ts → el HTML que sirve la ruta /intro (scripts con nonce)
//   · public/intro/gsap.min.js    → GSAP servido desde el sitio, no desde un CDN
//   · public/intro/sonido.webm    → la banda sonora ya grabada (Opus, ~0.6 MB)
//   · public/intro/portada.jpg    → el cuadro que se ve antes de tocar «play»
//   · public/intro/bucle.webm     → los primeros 7.5 s sin sonido, en bucle en la tarjeta
//   · public/intro/portada-cuadrada.jpg y bucle-cuadrado.webm → lo mismo para la
//     tarjeta cuadrada del teléfono (la versión vertical, recortada arriba)
//
//   node docs/diseno/intro-animada/publicar-en-web.mjs
//
// Se vuelve a correr cada vez que cambie intro.html.
//
// «Del chat al pedido» (en-linea.html, solo 9:16) va igual a su propia ruta:
//   node docs/diseno/intro-animada/publicar-en-web.mjs --archivo en-linea.html
//   → src/app/intro-en-linea/intro-html.ts y public/intro-en-linea/{sonido.webm,portada.jpg,bucle.webm}
//   (GSAP se comparte: /intro/gsap.min.js)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const plataforma = path.resolve(aqui, '../../../plataforma');
const require = createRequire(path.join(plataforma, 'package.json'));
const { chromium } = require('playwright');
const QRCode = require('qrcode');

const URL_QR = 'https://distleogin.com';
const args = process.argv.slice(2);
const archivo = (() => { const i = args.indexOf('--archivo'); return i >= 0 ? args[i + 1] : 'intro.html'; })();
// Qué se publica y dónde. `portadaT` es el segundo del póster; el bucle va
// sin sonido en la tarjeta (`escala` = deviceScaleFactor del navegador).
const CONF = {
  'intro.html': { ruta: 'intro', formato: 'h', ancho: 1920, alto: 1080, qr: true, portadaT: 1.6, cuadrada: true, bucle: { desde: 0, hasta: 7.5, fps: 15, escala: 0.4 } },
  'en-linea.html': { ruta: 'intro-en-linea', formato: 'v', ancho: 1080, alto: 1920, qr: false, portadaT: 1.2, bucle: { desde: 0, hasta: 6, fps: 15, escala: 0.3 } },
}[archivo];
if (!CONF) throw new Error(`No sé publicar ${archivo}`);
// En Windows, con core.autocrlf, Git deja el archivo con CRLF: se normaliza
// para que los reemplazos de abajo (que buscan saltos de línea simples)
// encuentren su texto.
const original = fs.readFileSync(path.join(aqui, archivo), 'utf8').replace(/\r\n/g, '\n');

// ── 1 · El QR, calculado una vez (en la web no se carga la librería) ──
function qrSvg() {
  const m = QRCode.create(URL_QR, { errorCorrectionLevel: 'M' }).modules;
  let d = '';
  for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) if (m.get(r, c)) d += `M${c} ${r}h1v1h-1z`;
  const n = m.size;
  return `<svg viewBox="-1 -1 ${n + 2} ${n + 2}" width="100%" height="100%" shape-rendering="crispEdges" aria-label="Código QR de distleogin.com"><rect x="-1" y="-1" width="${n + 2}" height="${n + 2}" fill="#fff"/><path d="${d}" fill="#1C1C1E"/></svg>`;
}

// ── 2 · El HTML para la CSP de la app: scripts propios y con nonce ──
let html = original;
const cambiar = (a, b) => {
  const veces = html.split(a).length - 1;
  if (veces !== 1) throw new Error(`Esperaba 1 vez y hay ${veces}: ${a.slice(0, 70)}`);
  html = html.replace(a, b);
};
cambiar('<meta name="claude:viewport-fit-sides" content="cover">\n', '');
cambiar('<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>',
  `<script nonce="__NONCE__">window.__INTRO_SONIDO__ = '/${CONF.ruta}/sonido.webm';</script>\n<script nonce="__NONCE__" src="/intro/gsap.min.js"></script>`);
if (CONF.qr) {
  cambiar('<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"></script>\n', '');
  cambiar('  const qrSvg = qrPath();', `  const qrSvg = ${JSON.stringify(qrSvg())};`);
}
html = html.replaceAll('<script>', '<script nonce="__NONCE__">');
if (/cdnjs|unpkg|jsdelivr/.test(html)) throw new Error('Quedó un script de un CDN externo.');
html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
${html}
</html>
`;
const ts = `/* eslint-disable */
// Generado por docs/diseno/intro-animada/publicar-en-web.mjs a partir de
// docs/diseno/intro-animada/${archivo}. No se edita a mano: se cambia el
// video y se vuelve a correr el script.
export const INTRO_HTML = ${JSON.stringify(html)};
`;
fs.mkdirSync(path.join(plataforma, `src/app/${CONF.ruta}`), { recursive: true });
fs.writeFileSync(path.join(plataforma, `src/app/${CONF.ruta}/intro-html.ts`), ts);
console.log(`intro-html.ts · ${(ts.length / 1024).toFixed(0)} KB`);

// ── 3 · GSAP desde el propio sitio (uno solo para los dos videos) ──
const publico = path.join(plataforma, `public/${CONF.ruta}`);
fs.mkdirSync(publico, { recursive: true });
if (CONF.ruta === 'intro') {
  fs.copyFileSync(require.resolve('gsap/dist/gsap.min.js'), path.join(publico, 'gsap.min.js'));
  console.log('gsap.min.js copiado');
}

// ── 4 · Portada y sonido, con la intro de prueba en un navegador sin ventana ──
const tmp = path.join(os.tmpdir(), 'leogin-intro-web');
fs.mkdirSync(tmp, { recursive: true });
const envuelto = path.join(tmp, archivo);
fs.writeFileSync(envuelto, `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${original}</body></html>`);
const navegador = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const pagina = await navegador.newPage({ viewport: { width: CONF.ancho, height: CONF.alto } });
await pagina.goto(pathToFileURL(envuelto).href, { waitUntil: 'networkidle' });
await pagina.waitForFunction(() => window.__intro && window.gsap);
await pagina.evaluate(() => window.__intro.ready);
await pagina.evaluate((f) => window.__intro.renderMode(f, 'full'), CONF.formato);
// El gancho ya dicho («se te fue» subrayado; «¿precio?» en el de en línea):
// la pregunta invita a darle «play»
await pagina.evaluate((t) => window.__intro.seek(t), CONF.portadaT);
await pagina.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
await pagina.screenshot({ path: path.join(publico, 'portada.jpg'), type: 'jpeg', quality: 80 });
console.log('portada.jpg lista');
const webm = await pagina.evaluate(() => window.__intro.soundtrackWebm(96));
if (!webm) throw new Error('El navegador no pudo grabar la banda sonora.');
fs.writeFileSync(path.join(publico, 'sonido.webm'), Buffer.from(webm, 'base64'));
console.log(`sonido.webm · ${(Buffer.from(webm, 'base64').length / 1024).toFixed(0)} KB`);

// ── 5 · El bucle de la tarjeta (PLAN_MOMENTOS_PICO W3) ──
// El caos y la cuenta de lo que se fue, 7.5 s sin sonido, a 768 × 432 y 15
// cuadros: la tarjeta se mueve desde el primer segundo sin pesar lo que pesa
// la intro. La portada.jpg sigue siendo su póster.
function buscarFfmpeg() {
  // El mismo lugar que mira grabar-video.mjs.
  const base = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.cache'), 'ms-playwright');
  const dirs = fs.existsSync(base) ? fs.readdirSync(base).filter((d) => d.startsWith('ffmpeg')).sort().reverse() : [];
  for (const d of dirs) {
    const exe = fs.readdirSync(path.join(base, d)).find((f) => f.startsWith('ffmpeg'));
    if (exe) return path.join(base, d, exe);
  }
  throw new Error('No encontré el ffmpeg de Playwright. Corre `npx playwright install ffmpeg` dentro de plataforma/.');
}
const BUCLE = CONF.bucle;
// Una página del video ya en modo grabación, en el formato y la escala que se pidan.
async function abrir(formato, ancho, alto, escala = 1) {
  const p = await navegador.newPage({ viewport: { width: ancho, height: alto }, deviceScaleFactor: escala });
  await p.goto(pathToFileURL(envuelto).href, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__intro && window.gsap);
  await p.evaluate(() => window.__intro.ready);
  await p.evaluate((f) => window.__intro.renderMode(f, 'full'), formato);
  return p;
}
// El bucle sin sonido: cuadro por cuadro a ffmpeg (VP9), recortado si se pide.
async function grabarBucle(p, nombre, clip) {
  const salida = path.join(publico, nombre);
  const ff = spawn(buscarFfmpeg(), [
    '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(BUCLE.fps), '-c:v', 'mjpeg', '-i', 'pipe:0',
    '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '42', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '3', '-an',
    salida,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const terminado = new Promise((r) => ff.on('close', r));
  const cuadros = Math.round((BUCLE.hasta - BUCLE.desde) * BUCLE.fps);
  for (let i = 0; i < cuadros; i++) {
    await p.evaluate((t) => window.__intro.seek(t), BUCLE.desde + i / BUCLE.fps);
    const jpg = await p.screenshot({ type: 'jpeg', quality: 90, ...(clip ? { clip } : {}) });
    if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  const codigo = await terminado;
  if (codigo !== 0) throw new Error(`ffmpeg terminó con ${codigo}`);
  console.log(`${nombre} · ${(fs.statSync(salida).size / 1024).toFixed(0)} KB`);
}
await grabarBucle(await abrir(CONF.formato, CONF.ancho, CONF.alto, BUCLE.escala), 'bucle.webm');

// ── 6 · En el teléfono, la tarjeta es cuadrada (PLAN_PORTADA_Y_VENDE_EN_LINEA §2) ──
// La versión vertical recortada arriba: el gancho sale casi al doble de
// tamaño que en el 16:9 de 335 px, y la tarjeta cabe con los botones en la
// primera pantalla (un 9:16 completo los empujaba fuera).
if (CONF.cuadrada) {
  const clip = { x: 0, y: 0, width: 1080, height: 1080 };
  const grande = await abrir('v', 1080, 1920);
  await grande.evaluate((t) => window.__intro.seek(t), CONF.portadaT);
  await grande.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await grande.screenshot({ path: path.join(publico, 'portada-cuadrada.jpg'), type: 'jpeg', quality: 80, clip });
  console.log('portada-cuadrada.jpg lista');
  await grabarBucle(await abrir('v', 1080, 1920, BUCLE.escala), 'bucle-cuadrado.webm', clip);
}
await navegador.close();
