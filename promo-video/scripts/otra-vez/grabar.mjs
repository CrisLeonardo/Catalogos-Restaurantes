// Graba las pantallas reales de Leogin para la serie «Otra vez».
//
//   npm run otra-vez:grabar            (todas las secciones)
//   npm run otra-vez:grabar -- meseros (solo una: meseros, comedor, domicilio, cierre, extras)
//
// Requisitos: Supabase local arriba y la app sirviendo en http://localhost:3000
// en modo producción (en plataforma/: `npx next build` y `npx next start -p 3000`).
// Todo ocurre en la base LOCAL, con Rincón 502, el restaurante ficticio de la
// demo. La sesión del panel se abre con /api/dev-login, que solo existe en local.
//
// Deja public/otra-vez/capturas/*.png y capturas.json: cada pantalla en alta
// resolución con la caja (posición y tamaño) de lo que el video toca o resalta.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import pg from 'pg';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SALIDA = join(RAIZ, 'public', 'otra-vez', 'capturas');
const INDICE = join(SALIDA, 'capturas.json');
const APP = process.env.PROMO_APP_URL ?? 'http://localhost:3000';
const MENU = process.env.PROMO_MENU_URL ?? 'http://rincon502.localhost:3000';
const DUENO = 'dueno@rincon502.test'; // cuenta de prueba de la base local
const DB = process.env.PROMO_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54601/postgres';
const SECCIONES = ['meseros', 'comedor', 'domicilio', 'cierre', 'extras'];
const pedidas = process.argv.slice(2).filter((a) => SECCIONES.includes(a));
const correr = pedidas.length ? pedidas : SECCIONES;

for (const u of [APP, MENU, DB]) {
  const h = new URL(u).hostname;
  if (!(h === '127.0.0.1' || h === 'localhost' || h.endsWith('.localhost'))) {
    console.error(`Solo se graba contra la app local; ${h} no lo es.`);
    process.exit(1);
  }
}
mkdirSync(SALIDA, { recursive: true });

const db = new pg.Client({ connectionString: DB });
await db.connect();
const { rows: [r] } = await db.query("select id from restaurants where slug = 'rincon502' and name = 'Rincón 502'");
if (!r) throw new Error('No existe Rincón 502: corre npm run seed.');
const RID = r.id;

// ── datos de la demo (solo base local) ────────────────────────────────────
if (correr.length === SECCIONES.length) {
  // el día de ventas ficticio de siempre…
  await db.query(readFileSync(join(RAIZ, 'seed', 'preparar-demo.sql'), 'utf8'));
  // …sin pedidos colgados de días anteriores,
  await db.query(
    `update orders set status = 'DELIVERED', delivered_at = coalesce(delivered_at, created_at + interval '30 minutes')
     where restaurant_id = $1 and status in ('NEW','PREP','READY','TRANSIT','SERVED') and created_at < now() - interval '3 hours'`, [RID]);
  // …como un restaurante que ya paga su plan (sin avisos de prueba),
  await db.query('update restaurant_billing set active = true, trial_ends_at = null where restaurant_id = $1', [RID]);
  // …y con la ubicación del local, para que el cliente marque su casa en el mapa.
  await db.query('update restaurants set location_lat = 14.3539, location_lng = -89.8493, delivery_radius_km = 6 where id = $1', [RID]);
}

// ── navegador ─────────────────────────────────────────────────────────────
const browser = await chromium.launch();
const TELEFONO = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const TABLETA = { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true };

async function abrir(vista, sesion) {
  const ctx = await browser.newContext({
    ...vista, locale: 'es-GT', timezoneId: 'America/Guatemala',
    geolocation: { latitude: 14.3478, longitude: -89.8441 }, permissions: ['geolocation'],
  });
  await ctx.addInitScript((rid) => {
    try {
      localStorage.setItem('leogin_tour_completed', 'true');
      localStorage.setItem(`google-loyalty-intro-${rid}`, '1');
    } catch { /* sin almacenamiento */ }
  }, RID);
  const page = await ctx.newPage();
  page.setDefaultTimeout(12000);
  if (sesion) await page.goto(`${APP}/api/dev-login?email=${encodeURIComponent(DUENO)}&next=/panel/rincon502`, { waitUntil: 'networkidle' });
  return page;
}

const espera = (ms) => new Promise((res) => setTimeout(res, ms));

async function quieta(page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.evaluate(() => Promise.race([
    Promise.all(document.getAnimations()
      .filter((a) => Number.isFinite(a.effect?.getComputedTiming?.().endTime ?? Infinity))
      .map((a) => a.finished.catch(() => {}))),
    new Promise((res) => setTimeout(res, 2500)),
  ]));
  await espera(450);
}

const indice = existsSync(INDICE) ? JSON.parse(readFileSync(INDICE, 'utf8')) : { capturas: [] };
const datos = indice.datos ?? {};

async function capturar(page, id, cajas = {}) {
  await quieta(page);
  const archivo = `${id}.png`;
  await page.screenshot({ path: join(SALIDA, archivo) });
  const vp = page.viewportSize();
  const dpr = await page.evaluate(() => devicePixelRatio);
  const medidas = {};
  for (const [nombre, loc] of Object.entries(cajas)) {
    const b = await loc.filter({ visible: true }).first().boundingBox({ timeout: 3000 }).catch(() => null);
    if (b) medidas[nombre] = { x: Math.round(b.x * dpr), y: Math.round(b.y * dpr), w: Math.round(b.width * dpr), h: Math.round(b.height * dpr) };
    else console.warn(`  · ${id}: no encontré «${nombre}»`);
  }
  indice.capturas = indice.capturas.filter((c) => c.id !== id);
  indice.capturas.push({ id, archivo, ancho: vp.width * dpr, alto: vp.height * dpr, cajas: medidas });
  console.log(`captura ${id}`, Object.keys(medidas).join(', '));
}

async function seccion(nombre, fn) {
  if (!correr.includes(nombre)) return;
  console.log(`\n── ${nombre} ──`);
  try {
    await fn();
  } catch (e) {
    console.error(`✗ ${nombre}: ${e.message.split('\n')[0]}`);
    process.exitCode = 1;
  }
}

// «Enviar a cocina» usa orders.updated_at como versión; antes de la migración
// 181 nacía vacío. Con la 181 aplicada esto no cambia nada.
const versionar = (numero) => db.query(
  'update orders set updated_at = coalesce(updated_at, created_at) where restaurant_id = $1 and order_number = $2 returning id, public_token', [RID, numero]);

// ── MESEROS: el mesero toma la orden, cocina la ve, la mesa se cobra ──────
await seccion('meseros', async () => {
  const m = await abrir(TELEFONO, true);
  await m.goto(`${APP}/panel/rincon502/mesero`, { waitUntil: 'networkidle' });
  await m.getByRole('button', { name: 'Plano' }).click();
  await capturar(m, 'm0-plano', { mesa: m.getByRole('button', { name: /^Mesa 9 ·/ }) });
  await m.getByRole('button', { name: /^Mesa 9 ·/ }).first().click();
  await capturar(m, 'm1-carta', { plato: m.getByRole('button', { name: /^Rincón Clásica, Q/ }) });
  await m.getByRole('button', { name: /^Rincón Clásica, Q/ }).click();
  await m.getByRole('button', { name: 'Medio', exact: true }).click();
  await m.getByLabel('Nota para cocina').fill('Sin cebolla');
  await capturar(m, 'm2-termino', {
    termino: m.getByRole('button', { name: 'Medio', exact: true }),
    nota: m.getByLabel('Nota para cocina'),
    agregar: m.getByRole('button', { name: /^Agregar ·/ }),
  });
  await m.getByRole('button', { name: /^Agregar ·/ }).click();
  await m.getByRole('button', { name: /^Pepperoni \(mediana\), Q/ }).click();
  await m.getByRole('button', { name: /^Doble Bacon, Q/ }).click();
  const tresCuartos = m.getByRole('button', { name: 'Tres cuartos', exact: true });
  if (await tresCuartos.isVisible().catch(() => false)) {
    await tresCuartos.click();
    await m.getByRole('button', { name: /^Agregar ·/ }).click();
  }
  await quieta(m);
  await capturar(m, 'm3-comanda', {
    enviar: m.getByRole('button', { name: /^Enviar a cocina/ }),
    plato: m.getByRole('button', { name: /^Pepperoni \(mediana\), Q/ }),
  });
  await m.getByRole('button', { name: /^Enviar a cocina/ }).click();
  await m.getByText(/a cocina · Mesa 9/).first().waitFor({ timeout: 8000 }).catch(() => {});
  await m.screenshot({ path: join(SALIDA, 'm4-enviado.png') });
  indice.capturas = indice.capturas.filter((c) => c.id !== 'm4-enviado');
  indice.capturas.push({ id: 'm4-enviado', archivo: 'm4-enviado.png', ancho: 1170, alto: 2532, cajas: {} });
  console.log('captura m4-enviado');

  // la cocina lo ve, por estación
  const k = await abrir(TABLETA, true);
  await k.goto(`${APP}/panel/rincon502/cocina`, { waitUntil: 'networkidle' });
  const sonido = k.getByRole('button', { name: 'Activar sonido' });
  if (await sonido.count()) await sonido.first().click();
  await capturar(k, 'k1-cocina', {
    comanda: k.getByText('Mesa 9', { exact: true }).first(),
    nota: k.getByText('Sin cebolla').first(),
    estacion: k.getByRole('button', { name: /^Cocina caliente/ }).first(),
  });
  await k.context().close();

  // la cuenta: se divide y se cobra desde el mismo teléfono
  await m.goto(`${APP}/panel/rincon502/mesero`, { waitUntil: 'networkidle' });
  await m.getByRole('button', { name: /^Mesa 9 ·/ }).first().click();
  await capturar(m, 'm5-mesa', { cobrar: m.getByRole('button', { name: 'Cobrar mesa' }) });
  await m.getByRole('button', { name: 'Cobrar mesa' }).click();
  await capturar(m, 'm6-cobrar', { partes: m.getByText('Partes iguales', { exact: true }) });
  await m.getByText('Partes iguales', { exact: true }).click();
  await capturar(m, 'm7-partes', { partes: m.getByText('Partes iguales', { exact: true }) });
  await m.context().close();
});

// ── COMEDOR: el cliente pide solo desde su mesa, sin mesero ───────────────
await seccion('comedor', async () => {
  const c = await abrir(TELEFONO, false);
  const p = await abrir(TELEFONO, true);
  await p.goto(`${APP}/panel/rincon502/pedidos`, { waitUntil: 'networkidle' });

  await c.goto(`${MENU}/?mesa=4`, { waitUntil: 'networkidle' });
  await capturar(c, 'c0-portada', { ver: c.getByText('Ver el menú').first() });
  await c.getByText('Ver el menú').first().click();
  await capturar(c, 'c1-menu', {
    plato: c.locator('[aria-label="Ver Rincón Clásica"]').first(),
    mesa: c.getByText('tu pedido llega a esta mesa').first(),
  });
  await c.locator('[aria-label="Ver Rincón Clásica"]').first().click();
  await c.getByText('Medio', { exact: true }).click();
  await capturar(c, 'c2-ficha', {
    termino: c.getByText('Medio', { exact: true }),
    agregar: c.locator('button:has-text("Agregar ·")'),
  });
  await c.locator('button:has-text("Agregar ·")').click();
  await c.locator('[aria-label="Agregar Limonada con Menta a tu pedido"]').first().click().catch(() => {});
  await capturar(c, 'c3-carrito', { carrito: c.locator('button:has-text("Ver carrito")') });
  await c.locator('button:has-text("Ver carrito")').click();
  await quieta(c);
  await c.locator('a:has-text("Ir a pagar")').click();
  await c.waitForURL(/checkout/);
  await c.getByPlaceholder('¿Cómo te llamas?').fill('Sofía');
  await c.getByPlaceholder('Sin cebolla, extra picante…').fill('Sin cebolla');
  await c.keyboard.press('Tab');
  const confirmar = c.locator('button:has-text("Confirmar pedido")');
  await confirmar.scrollIntoViewIfNeeded();
  await capturar(c, 'c4-confirmar', { confirmar, mesa: c.getByText('Detectada al escanear el QR') });
  await confirmar.click();
  await c.getByText('¡Pedido enviado!').waitFor({ timeout: 20000 });
  const numero = (await c.getByText(/ORD-\d{4}-\d+/).first().textContent()).trim();
  const corto = '#' + String(Number(numero.split('-').pop()));
  await capturar(c, 'c5-enviado', { titulo: c.getByText('¡Pedido enviado!') });

  await p.getByText(corto, { exact: true }).first().waitFor({ timeout: 30000 });
  await p.getByText(corto, { exact: true }).first().scrollIntoViewIfNeeded();
  await p.evaluate(() => window.scrollBy(0, -260));
  await capturar(p, 'p1-vivo', {
    pedido: p.getByText(corto, { exact: true }).first(),
    nota: p.getByText('Sin cebolla').first(),
  });

  const { rows: [ped] } = await versionar(numero);
  datos.pedidoComedor = corto;
  await db.query("update orders set status = 'PREP', accepted_at = now() where id = $1", [ped.id]);
  await c.goto(`${MENU}/pedido/${ped.public_token}`, { waitUntil: 'networkidle' });
  await capturar(c, 't1-en-cocina', { estado: c.getByText('En preparación').first() });
  await db.query("update orders set status = 'READY', ready_at = now() where id = $1", [ped.id]);
  await c.reload({ waitUntil: 'networkidle' });
  await capturar(c, 't2-listo', { estado: c.getByText('Listo', { exact: true }).first() });

  // así lo ve quien cocina, en su tableta
  const k = await abrir(TABLETA, true);
  await db.query("update orders set status = 'PREP', ready_at = null where id = $1", [ped.id]);
  await k.goto(`${APP}/panel/rincon502/cocina`, { waitUntil: 'networkidle' });
  const sonido = k.getByRole('button', { name: 'Activar sonido' });
  if (await sonido.count()) await sonido.first().click();
  await capturar(k, 'k2-cocina', {
    comanda: k.getByText('Mesa 4', { exact: true }).first(),
    nota: k.getByText('Sin cebolla').first(),
  });
  await db.query("update orders set status = 'READY', ready_at = now() where id = $1", [ped.id]);
  for (const x of [c, p, k]) await x.context().close();
});

// ── DOMICILIO: el cliente pide desde tu enlace, sin escribirte ────────────
await seccion('domicilio', async () => {
  const c = await abrir(TELEFONO, false);
  const p = await abrir(TELEFONO, true);

  await c.goto(`${MENU}/`, { waitUntil: 'networkidle' });
  await capturar(c, 'd0-portada', { ver: c.getByText('Ver el menú').first() });
  await c.getByText('Ver el menú').first().click();
  await capturar(c, 'd1-menu', { plato: c.locator('[aria-label="Ver Pepperoni (mediana)"]').first() });
  await c.locator('[aria-label="Ver Pepperoni (mediana)"]').first().click();
  await capturar(c, 'd2-ficha', { agregar: c.locator('button:has-text("Agregar ·")') });
  await c.locator('button:has-text("Agregar ·")').click();
  await c.locator('[aria-label="Agregar Alitas BBQ 8 unidades a tu pedido"]').first().click().catch(() => {});
  await capturar(c, 'd3-carrito', { carrito: c.locator('button:has-text("Ver carrito")') });
  await c.locator('button:has-text("Ver carrito")').click();
  await quieta(c);
  await c.locator('a:has-text("Ir a pagar")').click();
  await c.waitForURL(/checkout/);
  await quieta(c);
  await c.getByText('A domicilio').first().click();
  await c.getByPlaceholder('¿Cómo te llamas?').fill('Don Julio');
  await c.getByPlaceholder('5xxx xxxx').fill('5555 0147'); // número ficticio
  const mapa = c.locator('.leaflet-container').first();
  await mapa.scrollIntoViewIfNeeded();
  await c.evaluate(() => window.scrollBy(0, 150));
  await c.waitForFunction(() => [...document.querySelectorAll('.leaflet-tile')].length > 3 && [...document.querySelectorAll('.leaflet-tile')].every((t) => t.complete), null, { timeout: 20000 }).catch(() => console.warn('  · el mapa no terminó de cargar'));
  await espera(1200);
  await c.getByPlaceholder(/Portón azul/).fill('Portón azul, frente al parque');
  await c.keyboard.press('Tab');
  await capturar(c, 'd4-mapa', { mapa, rango: c.getByText(/Dentro del rango/).first() });
  const confirmar = c.locator('button:has-text("Confirmar pedido")');
  await confirmar.scrollIntoViewIfNeeded();
  await c.getByPlaceholder(/^Mínimo Q/).fill('200');
  await c.keyboard.press('Tab');
  await capturar(c, 'd5-confirmar', { confirmar });
  // el dueño está en «Hoy» cuando entra el pedido: así le avisa su teléfono
  await p.goto(`${APP}/panel/rincon502`, { waitUntil: 'networkidle' });
  await quieta(p);
  await confirmar.click();
  await c.getByText('¡Pedido enviado!').waitFor({ timeout: 20000 });
  await espera(1500);
  const { rows: [nuevo] } = await db.query("select order_number from orders where restaurant_id = $1 and order_type = 'DELIVERY' order by created_at desc limit 1", [RID]);
  const numero = nuevo.order_number;
  const corto = '#' + String(Number(numero.split('-').pop()));
  await capturar(c, 'd6-enviado', { titulo: c.getByText('¡Pedido enviado!') });
  const aviso = p.getByText(new RegExp('Pedido nuevo · ' + corto)).first();
  await aviso.waitFor({ timeout: 30000 }).catch(() => console.warn('  · no salió el aviso de pedido nuevo'));
  await capturar(p, 'p0-aviso', { aviso });

  await p.goto(`${APP}/panel/rincon502/pedidos`, { waitUntil: 'networkidle' });
  await p.getByText(corto, { exact: true }).first().waitFor({ timeout: 30000 });
  await p.getByRole('button', { name: /^Domicilio/ }).first().click().catch(() => console.warn('  · sin filtro Domicilio'));
  await capturar(p, 'p2-vivo', { pedido: p.getByText(corto, { exact: true }).first() });

  const { rows: [ped] } = await versionar(numero);
  await db.query("update orders set status = 'PREP', accepted_at = now() where id = $1", [ped.id]);
  await c.goto(`${MENU}/pedido/${ped.public_token}`, { waitUntil: 'networkidle' });
  await capturar(c, 't3-en-cocina', {});
  await db.query("update orders set status = 'TRANSIT', ready_at = now() where id = $1", [ped.id]);
  await c.reload({ waitUntil: 'networkidle' });
  await capturar(c, 't4-en-camino', { estado: c.getByText(/En camino/).first() });
  for (const x of [c, p]) await x.context().close();
});

// ── CIERRE: la caja cuadra y el dueño ve su día ───────────────────────────
await seccion('cierre', async () => {
  await db.query('delete from caja_borradores where restaurant_id = $1', [RID]);
  const p = await abrir(TELEFONO, true);
  await p.goto(`${APP}/panel/rincon502/caja`, { waitUntil: 'networkidle' });
  await espera(2500);
  await quieta(p);
  const texto = await p.evaluate(() => document.body.innerText);
  const esperado = Number((texto.match(/[Ee]sperado\s{0,6}Q([\d,]+\.\d\d)/) ?? [0, '0'])[1].replace(/,/g, ''));
  datos.esperadoCaja = esperado;
  console.log('  esperado en caja:', esperado);
  await capturar(p, 'q0-caja', {});
  for (let intento = 0; intento < 3; intento++) {
    let resto = Math.round(esperado * 100) / 100;
    for (const b of [200, 100, 50, 20, 10, 5, 1]) {
      const n = Math.floor(resto / b + 1e-9);
      const campo = p.getByLabel(`Cuántos billetes de Q${b}`, { exact: true });
      await campo.click();
      await campo.fill(n > 0 ? String(n) : '');
      resto = Math.round((resto - n * b) * 100) / 100;
    }
    if (resto > 0) console.warn(`  · quedan Q${resto} en monedas sin contar`);
    await espera(1500);
    console.log('  conteo:', await p.evaluate(() => [...document.querySelectorAll('input[aria-label^="Cuántos billetes"]')].map((x) => x.value || 0).join(',')));
    if (await p.getByText('Cuadra', { exact: true }).last().isVisible().catch(() => false)) break;
  }
  await p.locator('body').click({ position: { x: 5, y: 300 } });
  await p.getByRole('button', { name: 'Visto' }).click({ timeout: 1500 }).catch(() => {});
  await p.evaluate(() => window.scrollTo(0, 0));
  await capturar(p, 'q1-cuadra', {
    cuadra: p.getByText('Cuadra', { exact: true }).last(),
    esperado: p.getByText(/^Esperado/).first(),
  });

  await p.goto(`${APP}/panel/rincon502`, { waitUntil: 'networkidle' });
  await quieta(p);
  await p.getByRole('button', { name: 'Visto' }).click({ timeout: 1500 }).catch(() => {});
  // el aviso de «te falta un paso» es del alta del restaurante, no del día a día
  await p.evaluate(() => {
    const t = [...document.querySelectorAll('button, div, section, article')].filter((e) => e.textContent.includes('Te falta 1 paso') && e.textContent.length < 160);
    const el = t[0];
    if (el) el.style.display = 'none';
  });
  await capturar(p, 'h1-hoy', { ventas: p.getByText('Ventas', { exact: true }).first() });
  await p.context().close();
});

// ── EXTRAS: lo demás que también trae ─────────────────────────────────────
await seccion('extras', async () => {
  const p = await abrir(TELEFONO, true);
  for (const [id, ruta] of [['x-inventario', 'inventario'], ['x-cupones', 'cupones'], ['x-reservas', 'reservaciones'], ['x-analitica', 'analitica'], ['x-negocio', 'metricas'], ['x-lealtad', 'lealtad'], ['x-qr', 'qr'], ['x-menu', 'menu'], ['x-finanzas', 'finanzas'], ['x-mesas', 'mesas']]) {
    await p.goto(`${APP}/panel/rincon502/${ruta}`, { waitUntil: 'networkidle' });
    await capturar(p, id, {});
  }
  await p.context().close();
});

writeFileSync(INDICE, JSON.stringify({ grabado: new Date().toISOString(), datos, capturas: indice.capturas }, null, 2));
await browser.close();
await db.end();
console.log('\nlisto: public/otra-vez/capturas');
