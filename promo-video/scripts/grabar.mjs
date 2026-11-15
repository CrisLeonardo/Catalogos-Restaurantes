// Graba el flujo estrella en la app LOCAL con Playwright.
//
//   npm run grabar
//
// Requisitos: Supabase local arriba, `npm run seed` recién corrido y la app
// sirviendo en http://localhost:3000 (en plataforma/: `npx next build` y
// `npx next start -p 3000`; el modo dev es demasiado lento para grabar).
// La sesión del panel se abre con /api/dev-login, que solo existe en local.
//
// Deja dos cosas:
//  · public/capturas/*.png + capturas.json — cada estado de la pantalla en alta
//    resolución (teléfono a 3×) con la caja de cada elemento que el video
//    resalta. Remotion monta el video con esto: así el texto sale nítido y el
//    dedo, el zoom y el resaltado se animan suaves en la composición.
//  · out/grabacion/*.webm — la toma corrida de cada pantalla, con el dedo
//    visible y toques lentos, como respaldo o para otros cortes.

import { mkdirSync, writeFileSync, readdirSync, renameSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import pg from 'pg';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const CAPTURAS = join(RAIZ, 'public', 'capturas');
const TOMAS = join(RAIZ, 'out', 'grabacion');
const APP = process.env.PROMO_APP_URL ?? 'http://localhost:3000';
const MENU = process.env.PROMO_MENU_URL ?? 'http://rincon502.localhost:3000';
const DUENO = 'dueno@rincon502.test'; // cuenta de prueba de la base local
const DB = process.env.PROMO_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54601/postgres';

for (const u of [APP, MENU, DB]) {
  const h = new URL(u).hostname;
  if (!(h === '127.0.0.1' || h === 'localhost' || h.endsWith('.localhost'))) {
    console.error(`Solo se graba contra la app local; ${h} no lo es.`);
    process.exit(1);
  }
}

rmSync(CAPTURAS, { recursive: true, force: true });
mkdirSync(CAPTURAS, { recursive: true });
rmSync(TOMAS, { recursive: true, force: true });
mkdirSync(TOMAS, { recursive: true });

const db = new pg.Client({ connectionString: DB });
await db.connect();
const { rows: [r] } = await db.query("select id from restaurants where slug = 'rincon502'");
if (!r) throw new Error('No existe Rincón 502: corre npm run seed.');
const RID = r.id;

// ── navegador ────────────────────────────────────────────────────────────
const browser = await chromium.launch();
const TELEFONO = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const TABLETA = { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true };

// Dedo visible en las tomas WebM (en el video final lo dibuja Remotion).
const DEDO = () => {
  const poner = () => {
    if (document.getElementById('__dedo')) return;
    const d = document.createElement('div');
    d.id = '__dedo';
    d.style.cssText = 'position:fixed;left:-60px;top:-60px;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;background:rgba(232,83,74,.35);border:2px solid rgba(255,255,255,.9);box-shadow:0 2px 10px rgba(0,0,0,.35);pointer-events:none;z-index:2147483647;transition:transform .12s';
    document.documentElement.appendChild(d);
    addEventListener('mousemove', (e) => { d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', () => { d.style.transform = 'scale(.7)'; }, true);
    addEventListener('mouseup', () => { d.style.transform = ''; }, true);
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', poner); else poner();
};

async function contexto(nombre, vista) {
  const ctx = await browser.newContext({
    ...vista,
    locale: 'es-GT',
    timezoneId: 'America/Guatemala',
    recordVideo: { dir: join(TOMAS, nombre), size: { width: vista.viewport.width * 2, height: vista.viewport.height * 2 } },
  });
  await ctx.addInitScript(DEDO);
  await ctx.addInitScript((rid) => {
    try {
      localStorage.setItem('leogin_tour_completed', 'true');
      localStorage.setItem(`google-loyalty-intro-${rid}`, '1');
    } catch {}
  }, RID);
  const page = await ctx.newPage();
  return { ctx, page, nombre };
}

const espera = (ms) => new Promise((res) => setTimeout(res, ms));
const posicion = new WeakMap();

// Mueve el dedo despacio hasta el elemento y lo toca.
async function tocar(page, loc) {
  await loc.scrollIntoViewIfNeeded();
  const b = await loc.boundingBox();
  if (!b) throw new Error('Elemento sin caja');
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  const desde = posicion.get(page) ?? { x: 195, y: 700 };
  await page.mouse.move(desde.x, desde.y);
  await page.mouse.move(x, y, { steps: 28 });
  posicion.set(page, { x, y });
  await espera(260);
  await page.mouse.down();
  await espera(90);
  await page.mouse.up();
  const soltado = Date.now();
  await espera(500);
  return soltado;
}

async function escribir(page, loc, texto) {
  await tocar(page, loc);
  await loc.pressSequentially(texto, { delay: 70 });
}

// Espera a que la pantalla deje de moverse (animaciones de entrada).
async function quieta(page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  // solo las animaciones que terminan (las de bucle infinito nunca resuelven)
  await page.evaluate(() => Promise.race([
    Promise.all(document.getAnimations()
      .filter((a) => Number.isFinite(a.effect?.getComputedTiming?.().endTime ?? Infinity))
      .map((a) => a.finished.catch(() => {}))),
    new Promise((r) => setTimeout(r, 2500)),
  ]));
  await espera(450);
}

const indice = [];
async function capturar(page, id, cajas = {}) {
  await quieta(page);
  // ocultar el dedo de la toma WebM en la captura
  await page.evaluate(() => { const d = document.getElementById('__dedo'); if (d) d.style.visibility = 'hidden'; });
  const archivo = `${id}.png`;
  await page.screenshot({ path: join(CAPTURAS, archivo) });
  await page.evaluate(() => { const d = document.getElementById('__dedo'); if (d) d.style.visibility = ''; });
  const vp = page.viewportSize();
  const dpr = await page.evaluate(() => devicePixelRatio);
  const medidas = {};
  for (const [nombre, loc] of Object.entries(cajas)) {
    const b = await loc.filter({ visible: true }).first().boundingBox({ timeout: 3000 }).catch(() => null);
    if (b) medidas[nombre] = { x: Math.round(b.x * dpr), y: Math.round(b.y * dpr), w: Math.round(b.width * dpr), h: Math.round(b.height * dpr) };
    else console.warn(`  · ${id}: no encontré «${nombre}»`);
  }
  indice.push({ id, archivo, ancho: vp.width * dpr, alto: vp.height * dpr, cajas: medidas });
  console.log(`captura ${id}`, Object.keys(medidas).join(', '));
}

// Caja del contenedor (tarjeta) que encierra un texto.
function tarjetaCon(page, texto) {
  return page.locator('article, li, section, div').filter({ hasText: texto }).filter({ has: page.locator(`text=${texto}`) }).last();
}

// ── 1. el cliente pide desde la Mesa 4 ───────────────────────────────────
const cliente = await contexto('cliente', TELEFONO);
const panel = await contexto('panel', TELEFONO);
const tableta = await contexto('cocina', TABLETA);
const c = cliente.page;
const p = panel.page;
const k = tableta.page;

// sesiones del dueño (cuenta de prueba local) en el panel y la tableta
for (const page of [p, k]) {
  await page.goto(`${APP}/api/dev-login?email=${encodeURIComponent(DUENO)}&next=/panel/rincon502/pedidos`, { waitUntil: 'networkidle' });
}

await c.goto(`${MENU}/?mesa=4`, { waitUntil: 'networkidle' });
await quieta(c);
await capturar(c, 'c0-portada');
await tocar(c, c.getByText('Ver el menú').first());
await capturar(c, 'c1-menu', {
  plato: c.locator('[aria-label="Ver Rincón Clásica"]').first(),
  mesa: c.getByText('tu pedido llega a esta mesa').first(),
});

await tocar(c, c.locator('[aria-label="Ver Rincón Clásica"]').first());
await capturar(c, 'c2-ficha', { termino: c.getByText('Medio', { exact: true }) });
await tocar(c, c.getByText('Medio', { exact: true }));
await tocar(c, c.getByRole('button', { name: 'Agregar uno', exact: true }).first());
await capturar(c, 'c3-ficha-lista', {
  termino: c.getByText('Medio', { exact: true }),
  agregar: c.locator('button:has-text("Agregar ·")'),
});
await tocar(c, c.locator('button:has-text("Agregar ·")'));
await capturar(c, 'c4-carrito', { carrito: c.locator('button:has-text("Ver carrito")') });
await tocar(c, c.locator('button:has-text("Ver carrito")'));
await quieta(c);
await tocar(c, c.locator('a:has-text("Ir a pagar")'));
await c.waitForURL(/checkout/);
await escribir(c, c.getByPlaceholder('¿Cómo te llamas?'), 'Sofía');
await c.keyboard.press('Tab');
await capturar(c, 'c5-checkout', {
  mesa: c.getByText('Detectada al escanear el QR'),
  total: c.getByText('Total', { exact: true }).first(),
});
await escribir(c, c.getByPlaceholder('Sin cebolla, extra picante…'), 'Sin cebolla');
await c.keyboard.press('Tab');
await capturar(c, 'c6-confirmar', {
  nota: c.getByPlaceholder('Sin cebolla, extra picante…'),
  confirmar: c.locator('button:has-text("Confirmar pedido")'),
});

// el panel abierto en «Pedidos en vivo», esperando
await p.goto(`${APP}/panel/rincon502/pedidos`, { waitUntil: 'networkidle' });
await quieta(p);
await capturar(p, 'p0-vivo-antes');

const confirmar = c.locator('button:has-text("Confirmar pedido")');
await confirmar.scrollIntoViewIfNeeded();
// el panel de la grabación vigila el DOM y anota el instante exacto en que
// aparece el pedido nuevo; se mide desde que el dedo suelta «Confirmar».
await p.evaluate(() => {
  window.__visto = null;
  const antes = new Set([...document.body.innerText.matchAll(/#\d+/g)].map((m) => m[0]));
  new MutationObserver(() => {
    if (window.__visto) return;
    const nuevo = [...document.body.innerText.matchAll(/#\d+/g)].map((m) => m[0]).find((x) => !antes.has(x));
    if (nuevo) window.__visto = { numero: nuevo, en: Date.now() };
  }).observe(document.body, { subtree: true, childList: true, characterData: true });
});
const t0 = await tocar(c, confirmar);
await c.getByText('¡Pedido enviado!').waitFor({ timeout: 20000 });
const numero = (await c.getByText(/ORD-\d{4}-\d+/).first().textContent()).trim();
const corto = '#' + String(Number(numero.split('-').pop()));
await p.getByText(corto, { exact: true }).first().waitFor({ timeout: 30000 });
const visto = await p.evaluate(() => window.__visto);
const latencia = ((visto?.en ?? Date.now()) - t0) / 1000;
console.log(`pedido ${numero}: del toque a la pantalla del panel en ${latencia.toFixed(1)} s`);
await capturar(c, 'c7-enviado', { titulo: c.getByText('¡Pedido enviado!') });
await capturar(p, 'p1-vivo', {
  pedido: p.getByText(corto, { exact: true }).first(),
  nota: p.getByText('Sin cebolla').first(),
  aviso: p.getByText('requiere atención').first(),
});

// ── 2. a cocina ──────────────────────────────────────────────────────────
// Rodeo SOLO para esta grabación local: un pedido recién creado nace con
// orders.updated_at vacío y el panel lo usa como versión, así que «Enviar a
// cocina» responde «Operación de pedido inválida.». Se reporta aparte; aquí
// se le pone la hora de creación para poder seguir grabando.
const { rows: [ped] } = await db.query(
  "update orders set updated_at = coalesce(updated_at, created_at) where restaurant_id = $1 and order_number = $2 returning id, public_token",
  [RID, numero],
);

await k.goto(`${APP}/panel/rincon502/pedidos`, { waitUntil: 'networkidle' });
await quieta(k);
const tarjetaK = k.locator('div').filter({ has: k.getByRole('button', { name: `Historial de ${corto}` }) }).filter({ has: k.getByRole('button', { name: 'Enviar a cocina' }) }).last();
await tocar(k, tarjetaK.getByRole('button', { name: 'Enviar a cocina' }));
await espera(1500);

await k.goto(`${APP}/panel/rincon502/cocina`, { waitUntil: 'networkidle' });
const activar = k.getByRole('button', { name: 'Activar sonido' });
if (await activar.count()) await tocar(k, activar.first());
await quieta(k);
await capturar(k, 'k1-cocina', {
  comanda: k.getByText('Mesa 4', { exact: true }).first(),
  nota: k.getByText('Sin cebolla').first(),
});

// el cliente ve su pedido en vivo
await c.goto(`${MENU}/pedido/${ped.public_token}`, { waitUntil: 'networkidle' });
await capturar(c, 't1-en-cocina', { estado: c.getByText('En preparación').first() });

// la estación marca su parte y el pedido queda listo
await tocar(k, k.getByRole('button', { name: /^Cocina caliente/ }).first());
await quieta(k);
const marcar = k.getByRole('button', { name: 'Marcar Rincón Clásica listo' });
if (await marcar.count()) await tocar(k, marcar.first());
await espera(1500);
const { rows: [st] } = await db.query('select status from orders where id = $1', [ped.id]);
if (st.status !== 'READY') {
  // Si la cocina pide además «pasarlo» en el pase, se marca listo directo
  // (solo en la base local) para mostrar lo que ve el cliente.
  await db.query("update orders set status = 'READY', ready_at = now() where id = $1", [ped.id]);
}
await c.reload({ waitUntil: 'networkidle' });
await capturar(c, 't2-listo', { estado: c.getByText('Listo', { exact: true }).first() });

// ── 3. la caja cuadra ─────────────────────────────────────────────────────
await p.goto(`${APP}/panel/rincon502/caja`, { waitUntil: 'networkidle' });
await quieta(p);
const texto = await p.evaluate(() => document.body.innerText);
const esperado = Number((texto.match(/Esperado\s*Q([\d,]+\.\d\d)/) ?? [0, '0'])[1].replace(/,/g, ''));
await capturar(p, 'q0-caja');
let resto = Math.round(esperado * 100) / 100;
let primero = true;
for (const b of [200, 100, 50, 20, 10, 5, 1]) {
  const n = Math.floor(resto / b + 1e-9);
  if (n > 0) {
    const campo = p.getByLabel(`Cuántos billetes de Q${b}`, { exact: true });
    // el pie fijo de la caja tapa las filas de abajo: solo el primer toque se ve
    if (primero) { await tocar(p, campo); primero = false; }
    await campo.fill(String(n));
    resto = Math.round((resto - n * b) * 100) / 100;
  }
}
if (resto > 0) console.warn(`  · quedan Q${resto} en monedas sin contar`);
await p.locator('body').click({ position: { x: 5, y: 300 } });
await capturar(p, 'q1-cuadra', {
  cuadra: p.locator('span, div, p, strong').filter({ hasText: /^Cuadra$/ }).last(),
  esperado: p.getByText(/^Esperado/).first(),
});

// ── 4. el dueño, desde su celular ────────────────────────────────────────
await p.goto(`${APP}/panel/rincon502`, { waitUntil: 'networkidle' });
await quieta(p);
await capturar(p, 'h1-hoy', { ventas: p.getByText('Ventas', { exact: true }).first() });

writeFileSync(join(CAPTURAS, 'capturas.json'), JSON.stringify({
  grabado: new Date().toISOString(),
  pedido: numero,
  latenciaSegundos: Math.round(latencia * 10) / 10,
  esperadoCaja: esperado,
  capturas: indice,
}, null, 2));

for (const x of [cliente, panel, tableta]) await x.ctx.close();
await browser.close();
await db.end();

// renombra las tomas WebM con el nombre de su pantalla
for (const nombre of ['cliente', 'panel', 'cocina']) {
  const dir = join(TOMAS, nombre);
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir)) renameSync(join(dir, f), join(TOMAS, `${nombre}.webm`));
  rmSync(dir, { recursive: true, force: true });
}
console.log('listo: public/capturas y out/grabacion');
