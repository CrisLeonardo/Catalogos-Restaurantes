/**
 * Revisión automática de accesibilidad de las páginas públicas (LZ-12).
 * ------------------------------------------------------------
 * Auditoría de lanzamiento 2026-11-23, LZ-12: «completar el recorrido
 * accesible». Inyecta axe-core (ya instalado: lo trae eslint-plugin-jsx-a11y)
 * en cada página, en teléfono (390 px) y en PC (1280 px), y lista las
 * violaciones WCAG 2.2 A/AA con su regla, su impacto y dónde están.
 *
 * No reemplaza el recorrido con lector de pantalla y teclado en un aparato:
 * axe encuentra cerca de un tercio de los problemas (nombres, contraste,
 * etiquetas, roles), no si el orden o los anuncios tienen sentido.
 *
 * Solo lee páginas: se puede correr contra producción.
 *   node scripts/revisar-accesibilidad.mjs https://distleogin.com https://rincon502.distleogin.com
 *   node scripts/revisar-accesibilidad.mjs --rutas /,/planes,/registro https://distleogin.com
 *   node scripts/revisar-accesibilidad.mjs --solo-movil ...
 *
 * El panel necesita sesión: en local, `--sesion <correo>` entra con dev-login
 * (solo existe en desarrollo) y `--panel <slug>` revisa sus pantallas diarias.
 *   node scripts/revisar-accesibilidad.mjs --sesion ana.prueba@ejemplo.test --panel comedor-ana http://localhost:3000
 *
 * Sale con 1 si hay alguna violación grave o crítica.
 */
import { chromium, devices } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const axe = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const args = process.argv.slice(2);
const opcion = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const rutasPedidas = opcion('--rutas')?.split(',');
const soloMovil = args.includes('--solo-movil');
const sesion = opcion('--sesion');
const panel = opcion('--panel');
const bases = args.filter((a, i) => /^https?:\/\//.test(a) && !['--rutas', '--sesion', '--panel'].includes(args[i - 1]));
if (sesion && bases.some((b) => !['localhost', '127.0.0.1'].includes(new URL(b).hostname))) {
  console.error('--sesion usa dev-login: solo contra localhost.');
  process.exit(2);
}
if (bases.length === 0) {
  console.error('Uso: node scripts/revisar-accesibilidad.mjs <url-base> [más bases] [--rutas /,/planes] [--solo-movil]');
  process.exit(2);
}

/** Qué revisar según el tipo de sitio: la web comercial o la carta de un local. */
function rutasDe(base) {
  if (rutasPedidas) return rutasPedidas;
  if (panel) {
    return ['', '/pedidos', '/menu', '/categorias', '/clientes', '/metricas', '/caja', '/perfil', '/ajustes/restaurante',
      '/ajustes/pedidos', '/qr', '/personal', '/suscripcion', '/respaldo'].map((r) => `/panel/${panel}${r}`);
  }
  const host = new URL(base).hostname;
  const esCarta = host.split('.').length > 2 && !host.startsWith('www.') && !host.startsWith('demo.');
  return esCarta ? ['/', '/checkout'] : ['/', '/planes', '/vende-en-linea', '/registro', '/admin/login', '/descargas'];
}

const aparatos = [
  { nombre: 'teléfono', ctx: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
  ...(soloMovil ? [] : [{ nombre: 'PC', ctx: { viewport: { width: 1280, height: 900 } } }]),
];

const browser = await chromium.launch();
let graves = 0;
const porRegla = new Map();
try {
  for (const base of bases) {
    for (const ruta of rutasDe(base)) {
      for (const ap of aparatos) {
        const ctx = await browser.newContext(ap.ctx);
        const page = await ctx.newPage();
        const url = new URL(ruta, base).toString();
        if (sesion) {
          await page.goto(`${base}/api/dev-login?email=${encodeURIComponent(sesion)}&next=${encodeURIComponent(ruta)}`, { waitUntil: 'load', timeout: 120_000 });
        }
        try {
          await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
        } catch {
          await page.goto(url, { waitUntil: 'load', timeout: 60_000 }).catch(() => null);
        }
        await page.waitForTimeout(800);
        await page.addScriptTag({ content: axe });
        const res = await page.evaluate(async () => {
          const r = await window.axe.run(document, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
            resultTypes: ['violations'],
          });
          return r.violations.map((v) => ({
            id: v.id, impacto: v.impact, ayuda: v.help,
            nodos: v.nodes.map((n) => ({ selector: n.target.join(' '), html: n.html.slice(0, 160), resumen: n.failureSummary?.split('\n').slice(1, 3).join(' ').trim() })),
          }));
        });
        const etiqueta = `${url} · ${ap.nombre}`;
        if (res.length === 0) {
          console.log(`✓ ${etiqueta}`);
        } else {
          console.log(`✗ ${etiqueta}`);
          for (const v of res) {
            if (v.impacto === 'serious' || v.impacto === 'critical') graves++;
            console.log(`   [${v.impacto}] ${v.id}: ${v.ayuda} (${v.nodos.length})`);
            for (const n of v.nodos.slice(0, 4)) {
              console.log(`      ${n.selector}\n        ${n.html}${n.resumen ? `\n        → ${n.resumen}` : ''}`);
            }
            const r = porRegla.get(v.id) ?? { impacto: v.impacto, paginas: new Set() };
            r.paginas.add(etiqueta);
            porRegla.set(v.id, r);
          }
        }
        await ctx.close();
      }
    }
  }
} finally {
  await browser.close();
}

console.log('\nResumen por regla');
for (const [id, r] of [...porRegla].sort((a, b) => b[1].paginas.size - a[1].paginas.size)) {
  console.log(`  ${id} [${r.impacto}] en ${r.paginas.size} vista(s)`);
}
console.log(graves === 0 ? '\nSin violaciones graves ni críticas.' : `\n${graves} violación(es) grave(s) o crítica(s).`);
process.exitCode = graves === 0 ? 0 : 1;
