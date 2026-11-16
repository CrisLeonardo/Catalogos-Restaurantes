// Saca fotogramas sueltos de una composición para revisarlos sin renderizar todo.
//   node scripts/otra-vez/revisar.mjs <composición> <carpeta> <cuadro,cuadro,…>
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition, openBrowser } from '@remotion/renderer';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const [ids, salida, cuadros] = process.argv.slice(2);
mkdirSync(salida, { recursive: true });
const serveUrl = await bundle({ entryPoint: join(RAIZ, 'src', 'index.ts') });
const navegador = await openBrowser('chrome');
for (const id of ids.split(',')) {
  const composition = await selectComposition({ serveUrl, id, puppeteerInstance: navegador });
  for (const c of cuadros.split(',').map(Number)) {
    await renderStill({ composition, serveUrl, frame: c, output: join(salida, `${id}-${String(c).padStart(4, '0')}.jpeg`), imageFormat: 'jpeg', jpegQuality: 80, scale: 0.5, puppeteerInstance: navegador });
  }
  console.log(id);
}
await navegador.close({ silent: true });
