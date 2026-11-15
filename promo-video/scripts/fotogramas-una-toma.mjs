// Saca fotogramas sueltos de «Una sola toma» para revisarlos sin exportar el
// video entero.  node scripts/fotogramas-una-toma.mjs <meseros|comedor|domicilio> [V|H] [cuadro …]
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const [video = 'meseros', formato = 'V', ...resto] = process.argv.slice(2);
const cuadros = resto.length ? resto.map(Number) : [0, 20, 45, 95, 108, 116, 135, 175, 215, 245, 270, 305, 345, 400, 415, 445, 470, 495, 525, 545, 590, 630, 680, 760, 800, 850, 880, 940, 1010];
const id = `UnaToma-${video}-${formato === 'H' ? 'horizontal' : 'vertical'}`;
const salida = join(RAIZ, 'out', 'una-toma', 'revision');
mkdirSync(salida, { recursive: true });

const serveUrl = await bundle({ entryPoint: join(RAIZ, 'src', 'index.ts'), publicDir: join(RAIZ, 'public') });
const composition = await selectComposition({ serveUrl, id });
for (const frame of cuadros) {
  const output = join(salida, `${video}-${formato}-${String(frame).padStart(4, '0')}.jpeg`);
  await renderStill({ serveUrl, composition, frame, output, imageFormat: 'jpeg', jpegQuality: 80, scale: 0.5 });
  console.log(output);
}

// Hoja de contacto: todos los fotogramas en una sola imagen, con su número.
const navegador = await chromium.launch();
const pagina = await navegador.newPage({ viewport: { width: formato === 'H' ? 2000 : 2200, height: 600 } });
const ancho = formato === 'H' ? 390 : 270;
const celdas = cuadros.map((fr) => `<figure><img src="data:image/jpeg;base64,${readFileSync(join(salida, `${video}-${formato}-${String(fr).padStart(4, '0')}.jpeg`)).toString('base64')}" width="${ancho}"><figcaption>${fr}</figcaption></figure>`).join('');
await pagina.setContent(`<body style="margin:0;background:#333;display:flex;flex-wrap:wrap;gap:6px;padding:6px;font:16px sans-serif;color:#fff">${celdas.replaceAll('<figure>', '<figure style="margin:0">')}</body>`, { waitUntil: 'load' });
const hoja = join(salida, `hoja-${video}-${formato}.jpeg`);
await pagina.screenshot({ path: hoja, fullPage: true, type: 'jpeg', quality: 80 });
await navegador.close();
console.log(hoja);
