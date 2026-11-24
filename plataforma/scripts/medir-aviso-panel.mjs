/**
 * Mide cuánto tarda un pedido del comensal en aparecer en el panel.
 * ------------------------------------------------------------
 * Auditoría de lanzamiento 2026-11-23, LZ-12 y OP-02. Objetivo propuesto:
 * el panel muestra el pedido en ≤ 5 s para el 90 % de los intentos.
 *
 * Dos navegadores a la vez, como en el local:
 *   · el PANEL de pedidos del restaurante, con la sesión de su dueño
 *     (dev-login: solo existe en desarrollo con Supabase local);
 *   · el TELÉFONO del comensal (390 × 844), que arma un carrito, llena el
 *     checkout y toca «Confirmar pedido».
 * Se mide desde ese toque hasta que el nombre del comensal aparece en el
 * panel (llega por Realtime, sin recargar). Al final borra los pedidos y
 * clientes que creó.
 *
 * Uso (desde plataforma/, con `npm run dev` y Supabase local arriba):
 *   node scripts/medir-aviso-panel.mjs
 *   node scripts/medir-aviso-panel.mjs --slug cafe-prueba-alta --dueno ana.prueba@ejemplo.test --intentos 5
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
const intentos = Math.max(1, Number(opcion('--intentos', 5)));
const PRESUPUESTO_MS = Number(opcion('--presupuesto', 5000));

const url = new URL(base);
if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
  console.error('Solo contra localhost: este script crea pedidos de verdad.');
  process.exit(2);
}

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n')
  .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
if (!/127\.0\.0\.1|localhost/.test(env.NEXT_PUBLIC_SUPABASE_URL)) {
  console.error('El Supabase de .env.local no es local.');
  process.exit(2);
}

const { data: rest } = await db.from('restaurants').select('id').eq('slug', slug).single();
// Un platillo sin opciones obligatorias: el carrito lo lleva tal cual.
const { data: productos } = await db.from('products').select('id, name, price, options, is_available')
  .eq('restaurant_id', rest.id).eq('is_available', true);
const producto = (productos ?? []).find((p) => !p.options || (Array.isArray(p.options) && p.options.length === 0));
if (!producto) { console.error(`«${slug}» no tiene un platillo disponible sin opciones.`); process.exit(2); }

const browser = await chromium.launch();
const tiempos = [];
const nombres = [];
try {
  // Panel: sesión del dueño y la pantalla de pedidos abierta.
  const panelCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const panel = await panelCtx.newPage();
  await panel.goto(`${base}/api/dev-login?email=${encodeURIComponent(dueno)}&next=/panel/${slug}/pedidos`, { waitUntil: 'networkidle', timeout: 120_000 });
  await panel.waitForTimeout(4000); // que se suscriba el canal en vivo

  for (let i = 1; i <= intentos; i++) {
    const nombre = `Medicion ${Date.now().toString(36)}`;
    nombres.push(nombre);
    const tel = devices['Pixel 7'];
    const telCtx = await browser.newContext({ ...tel, viewport: { width: 390, height: 844 } });
    const comensal = await telCtx.newPage();
    const host = `${url.protocol}//${slug}.${url.host}`;
    await comensal.goto(`${host}/`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await comensal.evaluate(([rid, p]) => {
      localStorage.setItem(`cart-${rid}`, JSON.stringify([{ lineId: p.id, productId: p.id, name: p.name, price: Number(p.price), quantity: 1, image_url: null }]));
    }, [rest.id, producto]);
    await comensal.goto(`${host}/checkout`, { waitUntil: 'networkidle', timeout: 120_000 });
    const llevar = comensal.getByRole('button', { name: 'Para llevar' });
    if (await llevar.count()) await llevar.click();
    await comensal.getByPlaceholder('¿Cómo te llamas?').fill(nombre);
    await comensal.getByPlaceholder('5xxx xxxx').fill('55550000');

    const t0 = Date.now();
    await comensal.getByRole('button', { name: 'Confirmar pedido' }).click();
    let ms = null;
    try {
      await panel.getByText(nombre).first().waitFor({ timeout: 30_000 });
      ms = Date.now() - t0;
    } catch { /* no llegó en 30 s */ }
    tiempos.push(ms);
    console.log(`#${i}  ${ms == null ? 'NO LLEGÓ en 30 s' : `${ms} ms`}`);
    await telCtx.close();
  }
  await panelCtx.close();
} finally {
  await browser.close();
  // Limpieza: los pedidos y clientes de esta medición.
  const { data: pedidos } = await db.from('orders').select('id, customer_id').eq('restaurant_id', rest.id).in('customer_name', nombres);
  const ids = (pedidos ?? []).map((p) => p.id);
  if (ids.length) {
    await db.from('order_items').delete().in('order_id', ids);
    await db.from('orders').delete().in('id', ids);
    const clientes = [...new Set((pedidos ?? []).map((p) => p.customer_id).filter(Boolean))];
    if (clientes.length) await db.from('customers').delete().in('id', clientes);
  }
  console.log(`Limpieza: ${ids.length} pedido(s) de prueba borrado(s).`);
}

const ok = tiempos.filter((t) => t != null && t <= PRESUPUESTO_MS).length;
const v = tiempos.filter((t) => t != null).sort((a, b) => a - b);
const p = (q) => (v.length ? v[Math.min(v.length - 1, Math.ceil(q * v.length) - 1)] : null);
console.log(`\nPedido visible en el panel ≤ ${PRESUPUESTO_MS} ms: ${ok}/${intentos} → ${ok / intentos >= 0.9 ? 'CUMPLE' : 'NO CUMPLE'} (meta: 90 %)`);
console.log(`p50 ${p(0.5)} ms · p90 ${p(0.9)} ms`);
process.exitCode = ok / intentos >= 0.9 ? 0 : 1;
