// Hoja de contactos: junta varias imágenes en una sola para revisarlas de un vistazo.
//   node scripts/otra-vez/hoja.mjs <carpeta> <salida.png> [columnas] [ancho de celda] [filtro]
import { readdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
const [dir, out, cols = '7', w = '270', filtro = ''] = process.argv.slice(2);
const fs = readdirSync(dir).filter((f) => /\.(png|jpe?g)$/.test(f) && f.includes(filtro)).sort();
const html = `<body style="margin:0;background:#222;display:grid;grid-template-columns:repeat(${cols},${w}px);gap:6px;padding:6px;font:12px sans-serif;color:#fff">${fs.map((f) => `<div><div>${f}</div><img src="${pathToFileURL(resolve(join(dir, f)))}" style="width:${w}px;display:block"></div>`).join('')}</body>`;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: Number(cols) * (Number(w) + 6) + 6, height: 600 } });
const tmp = resolve(join(dir, '__hoja.html'));
writeFileSync(tmp, html);
await p.goto(pathToFileURL(tmp).href, { waitUntil: 'load' });
await p.screenshot({ path: out, fullPage: true });
await b.close();
rmSync(tmp);
