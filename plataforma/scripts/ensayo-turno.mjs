/**
 * Ensayo del primer turno de pedidos en línea (LZ-02).
 * ------------------------------------------------------------
 * Auditoría de lanzamiento 2026-11-23, LZ-02 (P0): «simular 10 pedidos con
 * dos aparatos, reintento y aviso silenciado; conciliar estados y totales
 * con un registro independiente». Este script hace la parte que se puede
 * automatizar. El aviso con el teléfono en silencio se ensaya a mano.
 *
 * Aparatos:
 *   · dos PANELES del dueño abiertos a la vez en Pedidos: una PC (1280 px) y
 *     un teléfono (390 px), como la caja y el teléfono del encargado;
 *   · dos TELÉFONOS de comensal que piden por el checkout real.
 *
 * Los 10 pedidos van rotando cuatro maneras de enviar:
 *   · normal: un toque en «Confirmar pedido»;
 *   · doble toque: dos toques seguidos, como quien no ve reacción;
 *   · respuesta perdida: el pedido LLEGA al servidor, pero la conexión se
 *     corta antes de que el teléfono reciba la respuesta. Es el caso
 *     peligroso: el comensal no sabe que pidió y el teléfono reintenta;
 *   · sin señal: el teléfono está sin red al tocar; el pedido queda en
 *     «Aún no se envía» y sale solo cuando vuelve la señal.
 *
 * Al final concilia tres fuentes contra el registro propio del script
 * (cantidad y total esperados de cada pedido): la base, el panel de la PC y
 * el del teléfono. Exige un pedido por comensal, ni perdidos ni duplicados,
 * el total exacto y que los dos paneles vean los mismos estados después de
 * avanzar tres pedidos desde la PC. Borra lo que creó.
 *
 * Uso (desde plataforma/, con `npm run dev` y Supabase local arriba):
 *   node scripts/ensayo-turno.mjs
 *   node scripts/ensayo-turno.mjs --slug cafe-prueba-alta --dueno ana.prueba@ejemplo.test --pedidos 10
 *   node scripts/ensayo-turno.mjs --misma-red   (los dos teléfonos en el mismo wifi)
 *
 * Con `--misma-red` el 7.º pedido del mismo minuto choca con el límite
 * antiabuso (6 por minuto por IP y local): el comensal ve «Has enviado
 * varios pedidos muy seguido» y el pedido no entra. Es lo esperado del
 * límite, no un pedido perdido en silencio.
 *
 * Solo corre contra localhost: crea pedidos de verdad.
 */
import { chromium, devices } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opcion = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const base = opcion('--base', 'http://localhost:3000');
const slug = opcion('--slug', 'cafe-prueba-alta');
const dueno = opcion('--dueno', 'ana.prueba@ejemplo.test');
const totalPedidos = Math.max(4, Number(opcion('--pedidos', 10)));
const ESPERA_PANEL_MS = 30_000;

const url = new URL(base);
if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
  console.error('Solo contra localhost: este script crea pedidos de verdad.');
  process.exit(2);
}

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n')
  .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
if (!/127\.0\.0\.1|localhost/.test(env.NEXT_PUBLIC_SUPABASE_URL)) {
  console.error('El Supabase de .env.local no es local.');
  process.exit(2);
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: rest } = await db.from('restaurants').select('id').eq('slug', slug).single();
if (!rest) { console.error(`No existe el local «${slug}».`); process.exit(2); }
const { data: productos } = await db.from('products').select('id, name, price, options, is_available')
  .eq('restaurant_id', rest.id).eq('is_available', true);
const producto = (productos ?? []).find((p) => !p.options || (Array.isArray(p.options) && p.options.length === 0));
if (!producto) { console.error(`«${slug}» no tiene un platillo disponible sin opciones.`); process.exit(2); }
const precio = Number(producto.price);

const MODOS = ['normal', 'doble toque', 'respuesta perdida', 'sin señal'];
const host = `${url.protocol}//${slug}.${url.host}`;
const centavos = (n) => Math.round(Number(n) * 100);
const q = (n) => `Q${Number(n).toFixed(2)}`;

/** El registro independiente: lo que el script sabe que pidió. */
const registro = [];
const fallas = [];
const falla = (msg) => { fallas.push(msg); console.log(`   ✗ ${msg}`); };

const browser = await chromium.launch();
try {
  // ── Dos paneles del dueño, a la vez ──────────────────────────
  const abrirPanel = async (viewport, extra = {}) => {
    const ctx = await browser.newContext({ viewport, ...extra });
    const page = await ctx.newPage();
    await page.goto(`${base}/api/dev-login?email=${encodeURIComponent(dueno)}&next=/panel/${slug}/pedidos`, { waitUntil: 'networkidle', timeout: 120_000 });
    return page;
  };
  const panelPC = await abrirPanel({ width: 1280, height: 900 });
  const { viewport: _vp, ...pixel } = devices['Pixel 7'];
  const panelTel = await abrirPanel({ width: 390, height: 844 }, { ...pixel });
  await panelPC.waitForTimeout(4000); // que se suscriban los canales en vivo

  // ── Dos teléfonos de comensal ────────────────────────────────
  // Cada uno con su IP, como dos clientes en redes distintas: en local todos
  // salen por 127.0.0.1 y el límite de 6 pedidos por minuto por IP y local
  // (createOrder) rechazaría el 7.º. Con la misma red, ver `--misma-red`.
  const mismaRed = args.includes('--misma-red');
  const telefonos = [];
  for (const [n, nombreAparato] of ['Pixel 7', 'Galaxy S9+'].entries()) {
    const { viewport: _v, ...d } = devices[nombreAparato];
    const ctx = await browser.newContext({
      ...d, viewport: { width: 390, height: 844 },
      extraHTTPHeaders: mismaRed ? {} : { 'cf-connecting-ip': `198.51.100.${10 + n}` },
    });
    telefonos.push({ ctx, page: await ctx.newPage(), nombre: nombreAparato });
  }

  const tarjeta = (panel, nombre) => panel.locator('article.adm-pedido').filter({ hasText: nombre });

  for (let i = 0; i < totalPedidos; i++) {
    const modo = MODOS[i % MODOS.length];
    const tel = telefonos[i % telefonos.length];
    const cantidad = 1 + (i % 3);
    const nombre = `Ensayo ${String(i + 1).padStart(2, '0')} ${Date.now().toString(36)}`;
    registro.push({ nombre, modo, cantidad, total: precio * cantidad });
    console.log(`#${i + 1}  ${tel.nombre} · ${modo} · ${cantidad}× ${producto.name} = ${q(precio * cantidad)}`);

    const page = tel.page;
    await page.goto(`${host}/`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.evaluate(([rid, p, n]) => {
      localStorage.setItem(`cart-${rid}`, JSON.stringify([{ lineId: p.id, productId: p.id, name: p.name, price: Number(p.price), quantity: n, image_url: null }]));
    }, [rest.id, producto, cantidad]);
    await page.goto(`${host}/checkout`, { waitUntil: 'networkidle', timeout: 120_000 });
    const llevar = page.getByRole('button', { name: 'Para llevar' });
    if (await llevar.count()) await llevar.click();
    await page.getByPlaceholder('¿Cómo te llamas?').fill(nombre);
    await page.getByPlaceholder('5xxx xxxx').fill(`5555${String(1000 + i).slice(-4)}`);
    const confirmar = page.getByRole('button', { name: 'Confirmar pedido' });

    if (modo === 'normal') {
      await confirmar.click();
    } else if (modo === 'doble toque') {
      await confirmar.click({ clickCount: 2, delay: 40 });
    } else if (modo === 'respuesta perdida') {
      // Deja pasar la petición que lleva este pedido y corta la respuesta.
      let cortada = false;
      await page.route('**/*', async (route) => {
        const req = route.request();
        if (!cortada && req.method() === 'POST' && (req.postData() ?? '').includes(nombre)) {
          cortada = true;
          await route.fetch().catch(() => null); // el servidor sí lo recibe
          await route.abort('connectionreset');
          return;
        }
        await route.continue();
      });
      await confirmar.click();
      await page.waitForTimeout(1500);
      await page.unroute('**/*');
      if (!cortada) falla(`«${nombre}»: no se encontró la petición del pedido para cortarla`);
      // El teléfono lo reintenta solo (cada 15 s o al volver la señal).
      await tel.ctx.setOffline(true);
      await page.waitForTimeout(300);
      await tel.ctx.setOffline(false);
    } else if (modo === 'sin señal') {
      await tel.ctx.setOffline(true);
      await confirmar.click();
      const enCola = await page.getByRole('heading', { name: 'Aún no se envía' })
        .waitFor({ timeout: 10_000 }).then(() => true, () => false);
      if (!enCola) falla(`«${nombre}»: sin señal no mostró «Aún no se envía»`);
      await page.waitForTimeout(2000);
      await tel.ctx.setOffline(false);
    }

    // Los dos paneles deben verlo, sin recargar.
    for (const [cual, panel] of [['PC', panelPC], ['teléfono', panelTel]]) {
      const llego = await tarjeta(panel, nombre).first()
        .waitFor({ timeout: ESPERA_PANEL_MS }).then(() => true, () => false);
      if (!llego) falla(`«${nombre}» no apareció en el panel del ${cual} en ${ESPERA_PANEL_MS / 1000} s`);
    }
    // Lo que le quedó en pantalla al comensal, si fue un error.
    const aviso = page.getByRole('alert').filter({ hasText: /\S/ });
    if (await aviso.count()) {
      const texto = (await aviso.first().innerText()).trim().replace(/\s+/g, ' ');
      console.log(`   el comensal ve: «${texto}»`);
    }
  }

  // Margen para un reintento tardío que pudiera duplicar.
  await panelPC.waitForTimeout(5000);

  // ── Avanzar tres pedidos desde la PC; el teléfono debe verlo ──
  for (const r of registro.slice(0, 3)) {
    const t = tarjeta(panelPC, r.nombre).first();
    const boton = t.getByRole('button', { name: 'Enviar a cocina' });
    if (!(await boton.count())) { falla(`«${r.nombre}»: la PC no ofrece «Enviar a cocina»`); continue; }
    await boton.click();
    const enTel = await panelTel.waitForFunction(
      (n) => [...document.querySelectorAll('article.adm-pedido')]
        .some((a) => a.textContent?.includes(n) && a.getAttribute('data-estado') === 'PREP'),
      r.nombre, { timeout: 15_000 },
    ).then(() => true, () => false);
    if (!enTel) falla(`«${r.nombre}»: el panel del teléfono no pasó a «En cocina»`);
  }

  // ── Conciliación ─────────────────────────────────────────────
  const { data: enBase } = await db.from('orders').select('id, customer_name, status, total, subtotal')
    .eq('restaurant_id', rest.id).in('customer_name', registro.map((r) => r.nombre));
  console.log('\nConciliación (registro del script · base · panel PC · panel teléfono)');
  for (const [i, r] of registro.entries()) {
    const filas = (enBase ?? []).filter((o) => o.customer_name === r.nombre);
    const nPC = await tarjeta(panelPC, r.nombre).count();
    const nTel = await tarjeta(panelTel, r.nombre).count();
    const totalBase = filas[0] ? Number(filas[0].total) : null;
    const esperado = i < 3 ? 'PREP' : 'NEW';
    const estadoPC = nPC ? await tarjeta(panelPC, r.nombre).first().getAttribute('data-estado') : null;
    const estadoTel = nTel ? await tarjeta(panelTel, r.nombre).first().getAttribute('data-estado') : null;
    console.log(`#${String(i + 1).padStart(2)}  ${r.modo.padEnd(17)} base ${filas.length} · PC ${nPC} · tel ${nTel} · ${totalBase == null ? '—' : q(totalBase)} · ${filas[0]?.status ?? '—'}`);
    if (filas.length !== 1) falla(`«${r.nombre}» (${r.modo}): ${filas.length} pedidos en la base, se esperaba 1`);
    if (nPC !== 1) falla(`«${r.nombre}» (${r.modo}): ${nPC} tarjetas en el panel de la PC`);
    if (nTel !== 1) falla(`«${r.nombre}» (${r.modo}): ${nTel} tarjetas en el panel del teléfono`);
    if (totalBase != null && centavos(totalBase) !== centavos(r.total)) falla(`«${r.nombre}»: total ${q(totalBase)}, se esperaba ${q(r.total)}`);
    if (filas[0] && filas[0].status !== esperado) falla(`«${r.nombre}»: estado ${filas[0].status} en la base, se esperaba ${esperado}`);
    if (estadoPC && estadoTel && estadoPC !== estadoTel) falla(`«${r.nombre}»: la PC dice ${estadoPC} y el teléfono ${estadoTel}`);
  }
  const sumaRegistro = registro.reduce((s, r) => s + centavos(r.total), 0);
  const sumaBase = (enBase ?? []).reduce((s, o) => s + centavos(o.total), 0);
  console.log(`\nTotal del turno: registro ${q(sumaRegistro / 100)} · base ${q(sumaBase / 100)}`);
  if (sumaRegistro !== sumaBase) falla(`la suma del turno no cuadra: ${q(sumaBase / 100)} en la base frente a ${q(sumaRegistro / 100)}`);
} finally {
  await browser.close();
  // Limpieza: los pedidos y clientes de este ensayo.
  const nombres = registro.map((r) => r.nombre);
  const { data: pedidos } = nombres.length
    ? await db.from('orders').select('id, customer_id').eq('restaurant_id', rest.id).in('customer_name', nombres)
    : { data: [] };
  const ids = (pedidos ?? []).map((p) => p.id);
  if (ids.length) {
    await db.from('order_items').delete().in('order_id', ids);
    const { error } = await db.from('orders').delete().in('id', ids);
    if (error) console.log(`Limpieza incompleta: ${error.message}`);
    const clientes = [...new Set((pedidos ?? []).map((p) => p.customer_id).filter(Boolean))];
    if (clientes.length) await db.from('customers').delete().in('id', clientes);
  }
  console.log(`Limpieza: ${ids.length} pedido(s) de prueba borrado(s).`);
}

console.log(fallas.length === 0
  ? `\nENSAYO SUPERADO: ${registro.length} pedidos, ninguno perdido ni duplicado, totales y estados cuadran en la base y en los dos paneles.`
  : `\nENSAYO CON ${fallas.length} FALLA(S):\n- ${fallas.join('\n- ')}`);
process.exitCode = fallas.length === 0 ? 0 : 1;
