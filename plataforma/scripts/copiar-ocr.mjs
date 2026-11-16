/* Copia a public/ocr/ lo que necesita el lector de fotos de la carta
   (ficha 2.4, importar sin IA): el trabajador de tesseract.js, su núcleo
   en WebAssembly y los datos del español. Sale de node_modules en cada
   `npm install` (postinstall), así no se suben binarios al repositorio y
   el navegador no depende de un CDN externo: todo se sirve desde Leogin.

   public/ocr/ va en .gitignore y fuera del proxy (src/proxy.ts), para que
   el trabajador corra sin la política de scripts de las páginas. */

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const destino = join(raiz, 'public', 'ocr');
const archivos = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
  ['node_modules/@tesseract.js-data/spa/4.0.0_best_int/spa.traineddata.gz', 'spa.traineddata.gz'],
];

mkdirSync(destino, { recursive: true });
let faltan = 0;
for (const [origen, nombre] of archivos) {
  const ruta = join(raiz, origen);
  if (!existsSync(ruta)) { faltan++; console.warn(`[copiar-ocr] falta ${origen}`); continue; }
  copyFileSync(ruta, join(destino, nombre));
}
// Nunca rompe la instalación: sin estos archivos solo falla «Foto», y lo dice.
console.log(faltan ? `[copiar-ocr] copiados con ${faltan} faltantes` : '[copiar-ocr] lector de fotos listo en public/ocr');
