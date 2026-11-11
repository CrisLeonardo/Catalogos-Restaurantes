/** 0.14: dos sesiones reales intentan cobrar el mismo plato. Solo Supabase local. */
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { readFileSync } from 'node:fs';
import { diaDeNegocio, inicioDelDia } from '../../src/lib/caja/dia';

/* Permisos por trabajo (1.7, migración 177): el mesero cobra con `caja.cobrar`
   y operar la Caja ya no cuelga de `finanzas`. Equivale a la conversión de
   la 177 para los permisos que estos casos usaban antes. */
const CAJA_COMPLETA = ['caja.cobrar', 'caja.abrir', 'caja.salida', 'caja.cerrar', 'caja.ver_esperado', 'caja.corregir', 'caja.devolver'];

try {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const match = line.trim().match(/^([A-Z_]+)=(.*)$/);
    if (match && !(match[1] in process.env)) process.env[match[1]] = match[2].trim();
  }
} catch { /* CI exporta su entorno local. */ }
const api = process.env.NEXT_PUBLIC_SUPABASE_URL!;
if (!api || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(api).hostname)) throw new Error('Cobro E2E solo admite Supabase local.');
const db = createClient(api, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const origin = 'http://localhost:3000';
const suffix = Math.random().toString(36).slice(2);
const slug = `aud-cobro-${suffix}`;
let restaurantId = '';
let orderId = '';
const users: { id: string; email: string }[] = [];
test.use({ actionTimeout: 15_000 });

function check<T>(result: { data: T; error: { message: string } | null }) {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
async function login(context: BrowserContext, email: string) {
  const link = await db.auth.admin.generateLink({ type: 'magiclink', email });
  if (link.error) throw link.error;
  const jar = new Map<string, string>();
  const session = createServerClient(api, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: async (cookies) => {
        for (const { name, value } of cookies) jar.set(name, value);
        await context.addCookies(cookies.map(({ name, value }) => ({ name, value, url: origin })));
      },
    },
  });
  const verified = await session.auth.verifyOtp({ type: 'magiclink', token_hash: link.data.properties.hashed_token });
  if (verified.error) throw verified.error;
  await context.addInitScript(() => localStorage.setItem('leogin_tour_completed', 'true'));
}
async function openBill(page: Page, mesa = 1, localSlug = slug) {
  await expect(async () => {
    await page.goto(`${origin}/panel/${localSlug}/mesero?mesa=${mesa}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: /^Cobrar mesa/ }).first()).toBeVisible();
  }).toPass({ timeout: 90_000 });
  await page.getByRole('button', { name: /^Cobrar mesa/ }).first().click();
  await expect(page.getByRole('tab', { name: 'Por platos' })).toBeVisible();
}

async function limpiarYLiberar(page: Page, mesa: number) {
  await page.getByRole('button', { name: 'Pasar a limpieza', exact: true }).click();
  await expect(page.getByText(`Mesa ${mesa} por limpiar`, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar limpieza y liberar', exact: true }).click();
  await expect(page.getByText(`Mesa ${mesa} limpia y libre`, { exact: true })).toBeVisible();
}

test('1.4 · conserva puestos, borradores y la guarnición al recuperar un envío', async ({ browser }) => {
  test.setTimeout(180_000);
  const productos = check(await db.from('products').insert([
    { restaurant_id: restaurantId, name: 'Café de olla', price: 17, sort_order: 1 },
    { restaurant_id: restaurantId, name: 'Limonada', price: 18, sort_order: 2 },
    { restaurant_id: restaurantId, name: 'Pollo a la plancha', price: 58, sort_order: 3,
      options: [{ id: 'g1', name: 'Guarnición', type: 'single', required: true, choices: [
        { id: 'papa', name: 'Papas', priceDelta: 0 }, { id: 'ensalada', name: 'Ensalada', priceDelta: 5 },
      ] }] },
  ]).select('id,name'))!;
  const pollo = productos.find((p) => p.name === 'Pollo a la plancha')!.id;
  const cafe = productos.find((p) => p.name === 'Café de olla')!.id;
  const numeroVenta = `AUD-TURNO-VENTAS-${suffix}`;
  check(await db.from('profiles').update({ role: 'RESTAURANT_OWNER' }).eq('id', users[1].id));
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    await login(context, users[1].email);
    const page = await context.newPage();
    const url = `${origin}/panel/${slug}/mesero?mesa=13`;
    const abrirCarta = async () => {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Agregar platos', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Favoritos del turno' })).toBeVisible();
    };
    const puesto = (n: number) => page.getByRole('button', { name: new RegExp(`^Puesto ${n} ·`) });
    await abrirCarta();
    await expect(puesto(1)).toHaveAccessibleName('Puesto 1 · Café de olla');
    await expect(puesto(2)).toHaveAccessibleName('Puesto 2 · Limonada');
    await expect(puesto(3)).toHaveAccessibleName('Puesto 3 · Pollo a la plancha');

    await page.getByRole('button', { name: 'Preparar turno' }).click();
    const turno = page.getByRole('dialog', { name: 'Preparar turno' });
    await turno.getByLabel('Plato con alias de trabajo').selectOption(pollo);
    await turno.getByLabel('Alias', { exact: true }).fill('plancha especial');
    await turno.getByRole('button', { name: 'Guardar alias' }).click();
    await expect(turno.getByText('Alias guardado.')).toBeVisible();
    await turno.getByLabel('Perfil', { exact: true }).selectOption('equipo');
    await turno.getByLabel('Puesto 1', { exact: true }).selectOption(cafe);
    await turno.getByRole('button', { name: 'Guardar para Equipo' }).click();
    await expect(turno.getByText(/Guardado para el perfil/)).toBeVisible();
    await page.keyboard.press('Escape');
    const buscar = page.getByRole('textbox', { name: 'Buscar un plato para agregar' });
    await buscar.fill('plancha especial');
    await expect(page.locator('.sv-find-parsed')).toContainText('Pollo a la plancha');
    await buscar.fill('cafe');
    await expect(page.locator('.sv-find-parsed')).toContainText('Café de olla');
    await buscar.press('Escape');

    const venta = check(await db.from('orders').insert({
      restaurant_id: restaurantId, order_number: numeroVenta, customer_name: 'AUD Ventas',
      customer_phone: '00000000', order_type: 'PICKUP', status: 'DELIVERED', subtotal: 1160, total: 1160,
    }).select('id').single())!;
    check(await db.from('order_items').insert({ order_id: venta.id, product_id: pollo,
      name_snapshot: 'Pollo a la plancha', price_snapshot: 58, quantity: 20, subtotal: 1160 }));
    await page.getByRole('button', { name: 'Opciones y nota de Limonada' }).click();
    const agotado = page.getByRole('dialog', { name: 'Opciones de Limonada' });
    await agotado.getByRole('button', { name: /marcar agotado/i }).click();
    // Desde la 1.10 el segundo toque dice hasta cuándo; la primera es la omisión.
    await agotado.getByRole('group', { name: 'Agotar: hasta cuándo' }).getByRole('button', { name: 'Hasta mañana' }).click();
    await expect(puesto(2)).toBeDisabled();
    // El botón se deshabilita al instante (optimista); recargar antes de que
    // el servidor confirme dejaba el agotado sin guardar y la prueba fallaba
    // a veces. Se espera el aviso que solo sale con la respuesta.
    await expect(page.getByText('Limonada · agotado hasta mañana', { exact: true })).toBeVisible();
    await abrirCarta();
    await expect(puesto(2)).toHaveAccessibleName('Puesto 2 · Limonada · Agotado');
    await expect(puesto(3)).toHaveAccessibleName('Puesto 3 · Pollo a la plancha');
    await page.keyboard.press('3');
    const opciones = page.getByRole('dialog', { name: 'Opciones de Pollo a la plancha' });
    await opciones.getByRole('button', { name: 'Elige guarnición' }).click();
    await expect(opciones.getByRole('alert')).toBeVisible();
    await opciones.getByRole('button', { name: 'Papas', exact: true }).click();
    await opciones.getByRole('textbox', { name: 'Nota para cocina' }).fill('Sin cebolla');
    await opciones.getByRole('button', { name: /^Agregar ·/ }).click();
    const elegirMesa = (n: number) => page.locator('.sv-rail .sv-mesa')
      .filter({ has: page.locator('.sv-mesa-n', { hasText: new RegExp(`^${n}$`) }) }).click();
    for (const n of [14, 15]) { await elegirMesa(n); await puesto(1).click(); }
    await elegirMesa(13);
    const comanda = page.getByRole('region', { name: 'Comanda de la mesa' });
    await expect(comanda.getByText('Nota · Sin cebolla')).toBeVisible();
    await comanda.getByRole('button', { name: 'Cambiar las opciones de Pollo a la plancha' }).click();
    await opciones.getByRole('button', { name: /Ensalada/ }).click();
    await opciones.getByRole('button', { name: 'Guardar · Q63.00' }).click();
    await expect(comanda.getByText('Q63.00 c/u')).toBeVisible();

    check(await db.from('products').update({ is_available: false, unavailable_at: new Date().toISOString() }).eq('id', pollo));
    const enviar = page.getByRole('button', { name: /^Enviar a cocina · 1/ });
    await enviar.click();
    await expect(comanda.locator('.sv-line-error')).toContainText('ya no está disponible');
    check(await db.from('products').update({ is_available: true, unavailable_at: null }).eq('id', pollo));
    let primerEnvio: string | undefined;
    let mismoIntento = false;
    await page.route('**/*', async (route) => {
      const request = route.request();
      const payload = request.postData();
      if (request.method() !== 'POST' || !request.headers()['next-action'] || !payload?.includes('Sin cebolla')) {
        await route.continue();
        return;
      }
      if (primerEnvio) {
        mismoIntento = payload === primerEnvio;
        await route.continue();
      } else {
        const respuesta = await route.fetch();
        expect(respuesta.ok()).toBe(true);
        primerEnvio = payload;
        await route.abort('failed');
      }
    });
    await enviar.dblclick();
    await expect(comanda.getByText('Ensalada', { exact: true })).toBeVisible();
    await expect.poll(() => mismoIntento).toBe(true);
    await expect.poll(async () => check(await db.from('orders').select('id')
      .eq('restaurant_id', restaurantId).eq('table_number', 13))?.length).toBe(1);
    const pedidos = check(await db.from('orders').select('id,total').eq('restaurant_id', restaurantId).eq('table_number', 13))!;
    expect(pedidos.map((o) => Number(o.total))).toEqual([63]);
    expect(check(await db.from('order_items').select('note,options_snapshot').eq('order_id', pedidos[0].id)))
      .toMatchObject([{ note: 'Sin cebolla', options_snapshot: [expect.objectContaining({ choice: 'Ensalada' })] }]);
    await page.setViewportSize({ width: 390, height: 850 });
    await expect(page.getByRole('button', { name: /Ver comanda.*saldo/ })).toBeVisible();
  } finally {
    await context.close();
    check(await db.from('profiles').update({ role: 'RESTAURANT_STAFF' }).eq('id', users[1].id));
    // La venta simulada de favoritos no pertenece al turno que cierran los casos de Caja.
    check(await db.from('orders').delete().eq('restaurant_id', restaurantId).eq('order_number', numeroVenta));
  }
});

test.beforeAll(async () => {
  const rest = check(await db.from('restaurants').insert({ name: 'AUD Cobro', slug, status: 'active', plan_actual: 'PREMIUM', onboarding_done: true }).select('id').single());
  restaurantId = rest!.id;
  check(await db.from('restaurant_themes').insert({ restaurant_id: restaurantId, brand_name: 'AUD Cobro', config: {
    orderTypes: ['dine_in'],
    floorPlan: { enabled: true, levels: [{ id: 'comedor', name: 'Comedor' }],
      tables: [1, 2, 3, 9, 12].map((n, i) => ({ n, level: 'comedor', x: 0.2 + (i % 3) * 0.3, y: 0.3 + Math.floor(i / 3) * 0.4, seats: 4 })),
    },
  } }));
  for (let i = 0; i < 2; i++) {
    const email = `aud-cobro-${suffix}-${i}@test.local`;
    const created = await db.auth.admin.createUser({ email, email_confirm: true });
    if (created.error) throw created.error;
    users.push({ id: created.data.user!.id, email });
    check(await db.from('profiles').upsert({ id: created.data.user!.id, full_name: `AUD Caja ${i}`, restaurant_id: restaurantId, role: 'RESTAURANT_STAFF', permissions: ['mesero', 'caja.cobrar'] }));
  }
  const o = check(await db.from('orders').insert({ restaurant_id: restaurantId, order_number: `AUD-${suffix}`, customer_name: 'AUD Mesa', customer_phone: '00000000',
    order_type: 'DINE_IN', table_number: 1, address: 'Mesa 1', status: 'SERVED', subtotal: 70, total: 70 }).select('id').single());
  orderId = o!.id;
  check(await db.from('order_items').insert([52, 18].map((amount) => ({ order_id: orderId, name_snapshot: `AUD Plato ${amount}`, price_snapshot: amount, quantity: 1, subtotal: amount, served_at: new Date().toISOString() }))));
});
test.afterAll(async () => {
  const errors: Error[] = [];
  if (restaurantId) {
    const result = await db.from('restaurants').delete().eq('id', restaurantId);
    if (result.error) errors.push(new Error(result.error.message));
  }
  for (const { id } of users) {
    const result = await db.auth.admin.deleteUser(id);
    if (result.error) errors.push(result.error);
  }
  if (errors.length) throw new AggregateError(errors, 'Limpieza E2E de cobro');
});

test('1.6 · conserva el historial abierto y revela una incidencia fuera del filtro', async ({ browser }) => {
  test.setTimeout(120_000);
  const pedido = check(await db.from('orders').insert({ restaurant_id: restaurantId, order_number: 'AUD-R02',
    customer_name: 'Domicilio de prueba', customer_phone: '00000000', order_type: 'DELIVERY', status: 'READY',
    subtotal: 25, total: 25, ready_at: new Date(Date.now() - 45 * 60_000).toISOString(),
  }).select('id').single())!;
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    check(await db.from('profiles').update({ permissions: ['mesero', 'caja.cobrar', 'pedidos'] }).eq('id', users[0].id));
    await login(context, users[0].email);
    const page = await context.newPage();
    await expect(async () => {
      await page.goto(`${origin}/panel/${slug}/pedidos`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: 'Pedidos en vivo', exact: true })).toBeVisible();
    }).toPass({ timeout: 60_000 });
    const tarjeta = page.getByRole('article', { name: 'Pedido AUD-R02' });
    const filtro = page.getByRole('button', { name: /^En local/ });
    await expect(async () => {
      await filtro.click();
      await expect(filtro).toHaveAttribute('aria-pressed', 'true', { timeout: 1500 });
    }).toPass({ timeout: 15_000 });
    await expect(tarjeta).toHaveCount(0);
    await expect(page.getByText('1 fuera de la vista actual')).toBeVisible();
    await page.getByText('1 pedido requiere atención').click();
    await page.getByRole('button', { name: 'AUD-R02 · Domicilio de prueba' }).click();
    const historial = page.getByRole('dialog', { name: 'Pedido AUD-R02' });
    await expect(historial.getByText('Sin cobro registrado')).toBeVisible();
    await expect(historial.getByText('Preparación terminada')).toBeVisible();
    check(await db.from('orders').update({ status: 'TRANSIT', picked_up_at: new Date().toISOString() }).eq('id', pedido.id));
    await expect(historial.getByText('Domicilio de prueba · En camino')).toBeVisible({ timeout: 35_000 });
    await expect(historial.getByText('Salió a entregar')).toBeVisible();
    for (const width of [390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(historial).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
    await page.keyboard.press('Escape');
    await expect(historial).toBeHidden();
    await expect(tarjeta).toBeVisible();
    await context.setOffline(true);
    await expect(page.getByText('Sin conexión · mostrando la última lectura')).toBeVisible();
    await expect(tarjeta.getByRole('button', { name: 'Entregado', exact: true })).toBeDisabled();
    await context.setOffline(false);
    await expect(tarjeta.getByRole('button', { name: 'Entregado', exact: true })).toBeEnabled();
  } finally {
    await context.close();
    check(await db.from('profiles').update({ permissions: ['mesero', 'caja.cobrar'] }).eq('id', users[0].id));
    check(await db.from('orders').delete().eq('id', pedido.id));
  }
});

test('1.5 · prepara por puesto y conserva el orden de 30 comandas', async ({ browser }) => {
  test.setTimeout(120_000);
  const [cocina, barra] = check(await db.from('print_stations').insert([
    { restaurant_id: restaurantId, name: 'Cocina caliente', is_default: true },
    { restaurant_id: restaurantId, name: 'Barra', is_default: false },
  ]).select('id'))!;
  const bebida = check(await db.from('products').insert({ restaurant_id: restaurantId,
    name: 'Horchata de prueba', price: 15, station_id: barra.id, dietary_tags: ['contiene_lacteos'] }).select('id').single())!;
  const pedidos = check(await db.from('orders').insert(Array.from({ length: 30 }, (_, i) => ({
    restaurant_id: restaurantId, order_number: `KDS-${i + 1}`, customer_name: 'AUD Cocina', customer_phone: '00000000',
    order_type: 'DINE_IN', table_number: 30 + i, status: 'PREP', subtotal: i === 0 ? 35 : 20, total: i === 0 ? 35 : 20,
    created_at: new Date(Date.now() - (30 - i) * 60_000).toISOString(),
    accepted_at: new Date(Date.now() - (30 - i) * 60_000).toISOString(),
  }))).select('id,table_number'))!;
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const lista = pedidos as { id: string; table_number: number }[];
    const id = lista.find((p) => p.table_number === 30)!.id;
    check(await db.from('order_items').insert([
      ...lista.map((p) => ({ order_id: p.id, product_id: null, name_snapshot: 'Tostadas', price_snapshot: 20, quantity: 1, subtotal: 20 })),
      { order_id: id, product_id: bebida.id, name_snapshot: 'Horchata de prueba', price_snapshot: 15, quantity: 1, subtotal: 15 },
    ]));
    check(await db.from('profiles').update({ permissions: ['mesero', 'caja.cobrar', 'cocina'] }).eq('id', users[0].id));
    await login(context, users[0].email);
    const page = await context.newPage();
    await page.goto(`${origin}/panel/${slug}/cocina`, { waitUntil: 'domcontentloaded' });
    const tarjetas = page.getByRole('article', { name: /^Comanda KDS-/ });
    const orden = async () => tarjetas.evaluateAll((nodos) => nodos.map((n) => n.getAttribute('aria-label')));
    let original: (string | null)[] = [];
    await expect(async () => {
      original = await orden();
      expect(original).toHaveLength(30);
    }).toPass({ timeout: 10_000 });
    const mesa = page.getByRole('article', { name: /Mesa 30$/ });
    await expect(mesa).toContainText('retraso');
    await page.getByRole('button', { name: /^Barra ·/ }).click();
    await expect(mesa).toContainText('Contiene lácteos');
    await mesa.getByRole('button', { name: 'Marcar mi parte lista' }).click();
    await expect(mesa).toContainText('Parte lista. Pase coordina la salida.');
    await page.getByRole('button', { name: 'Deshacer marcado' }).click();
    await expect(mesa.getByRole('button', { name: 'Marcar mi parte lista' })).toBeVisible();
    await mesa.getByRole('button', { name: 'Marcar mi parte lista' }).click();
    await expect(mesa).toContainText('Parte lista. Pase coordina la salida.');
    await page.getByRole('button', { name: /^Pase ·/ }).click();
    await expect(mesa).toContainText('Cocina caliente · pendiente');
    await expect(async () => expect(await orden()).toEqual(original)).toPass({ timeout: 10_000 });
    await page.getByRole('button', { name: /^Cocina caliente ·/ }).click();
    await mesa.getByRole('button', { name: 'Marcar mi parte lista' }).click();
    await page.getByRole('button', { name: /^Pase ·/ }).click();
    await expect(mesa).toContainText('Esperando salida');
    for (const width of [390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
    await page.getByRole('button', { name: 'Probar sonido' }).click();
    await expect(page.getByText('Prueba de sonido reproducida.')).toBeVisible();
    await mesa.getByRole('button', { name: 'Confirmar salida' }).click();
    await expect(mesa).toContainText('Salida confirmada para Servicio.');
    expect(check(await db.from('orders').select('status,served_at').eq('id', id).single())).toEqual({ status: 'READY', served_at: null });
  } finally {
    await context.close();
    check(await db.from('profiles').update({ permissions: ['mesero', 'caja.cobrar'] }).eq('id', users[0].id));
    check(await db.from('orders').delete().in('id', (pedidos as { id: string }[]).map((p) => p.id)));
    check(await db.from('products').delete().eq('id', bebida.id));
    check(await db.from('print_stations').delete().in('id', [cocina.id, barra.id]));
  }
});

test('1.3 · el plano y la comanda muestran pago, entrega y limpieza por separado', async ({ browser }) => {
  test.setTimeout(180_000);
  const pedido = check(await db.from('orders').insert({
    restaurant_id: restaurantId, order_number: `AUD-SALON-${suffix}`, customer_name: 'AUD Salón', customer_phone: '00000000',
    order_type: 'DINE_IN', table_number: 12, address: 'Mesa 12', status: 'READY', subtotal: 32, total: 32,
  }).select('id').single())!;
  check(await db.from('order_items').insert({ order_id: pedido.id, name_snapshot: 'Postre de la casa',
    price_snapshot: 32, quantity: 1, subtotal: 32 }));
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    await login(context, users[0].email);
    const page = await context.newPage();
    await openBill(page, 12);
    await page.getByRole('button', { name: 'Tarjeta', exact: true }).click();
    await page.getByRole('button', { name: 'Cobrar Q32.00', exact: true }).click();
    await expect(page.getByText('Pagada · quedan pedidos por entregar.')).toBeVisible();
    const mesa = page.getByRole('button', { name: /^Mesa 12 ·/ });
    await expect(mesa).toBeVisible();
    await expect(page.getByRole('button', { name: 'Servido', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pasar a limpieza', exact: true })).toHaveCount(0);
    for (const width of [768, 390]) {
      await page.setViewportSize({ width, height: 840 });
      const volver = page.getByRole('button', { name: 'Volver al salón', exact: true });
      if (width === 768) await expect(mesa).toBeVisible();
      else {
        await expect(mesa).toBeHidden();
        await volver.click();
        await expect(mesa).toBeVisible();
        await mesa.click();
      }
      await expect(page.getByText('Pagada · quedan pedidos por entregar.')).toBeVisible();
    }
    await page.getByRole('button', { name: 'Servido', exact: true }).click();
    await limpiarYLiberar(page, 12);
    await expect(mesa).toHaveAccessibleName(/^Mesa 12 · Libre/);
    expect(check(await db.from('order_payments').select('amount,method').eq('order_id', pedido.id)))
      .toEqual([{ amount: 32, method: 'CARD' }]);
  } finally { await context.close(); }
});

test('1.1 · un abono libre mixto deja la mesa abierta y registra los dos métodos', async ({ browser }) => {
  test.setTimeout(180_000);
  const mixtoSlug = `${slug}-mixto`;
  const rest = check(await db.from('restaurants').insert({ name: 'AUD Mixto', slug: mixtoSlug, status: 'active',
    plan_actual: 'PREMIUM', onboarding_done: true }).select('id').single())!;
  const context = await browser.newContext({ viewport: { width: 390, height: 750 } });
  let userId: string | undefined;
  try {
    check(await db.from('restaurant_themes').insert({ restaurant_id: rest.id, brand_name: 'AUD Mixto',
      config: { orderTypes: ['dine_in'] } }));
    const email = `aud-cobro-${suffix}-mixto@test.local`;
    const user = await db.auth.admin.createUser({ email, email_confirm: true });
    if (user.error) throw user.error;
    userId = user.data.user!.id;
    check(await db.from('profiles').upsert({ id: userId, full_name: 'AUD Caja Mixto', restaurant_id: rest.id,
      role: 'RESTAURANT_STAFF', permissions: ['mesero', 'caja.cobrar'] }));
    await login(context, email);
    const page = await context.newPage();
    const order = check(await db.from('orders').insert({ restaurant_id: rest.id, order_number: `AUD-mixto-${suffix}`,
      customer_name: 'AUD Mixto', customer_phone: '00000000', order_type: 'DINE_IN', table_number: 8,
      address: 'Mesa 8', status: 'SERVED', subtotal: 200, total: 200 }).select('id').single())!;
    check(await db.from('order_items').insert({ order_id: order.id, name_snapshot: 'AUD Mixto', price_snapshot: 200,
      quantity: 1, subtotal: 200, served_at: new Date().toISOString() }));
    await openBill(page, 8, mixtoSlug);
    await page.getByRole('tab', { name: 'Importe libre', exact: true }).click({ timeout: 5_000 });
    await page.getByLabel('Importe a registrar', { exact: true }).fill('130');
    await page.getByRole('button', { name: 'Pago mixto', exact: true }).click();
    await page.getByLabel('Efectivo aplicado', { exact: true }).fill('50');
    await page.getByLabel('Tarjeta aplicada', { exact: true }).fill('80');
    const recibido = page.getByLabel('Efectivo recibido', { exact: true });
    const vuelto = page.getByRole('status').filter({ hasText: 'Vuelto' });
    await recibido.fill('50');
    await expect(vuelto).toContainText('Q0.00');
    await recibido.fill('100');
    await expect(vuelto).toContainText('Q50.00');
    await expect(vuelto).toBeInViewport({ ratio: 1 });
    await page.getByRole('button', { name: 'Registrar Q130.00', exact: true }).click();
    await expect(page.getByText(/Q130\.00 cobrado · la mesa sigue abierta/)).toBeVisible();
    await expect(page.getByText('Consumo Q200.00 · pagado Q130.00 · por cobrar Q70.00', { exact: true })).toBeVisible();
    const rows = check(await db.from('order_payments').select('method,amount,cash_received').eq('order_id', order.id).order('method'));
    expect(rows).toEqual([{ method: 'CARD', amount: 80, cash_received: null }, { method: 'CASH', amount: 50, cash_received: 100 }]);
    await openBill(page, 8, mixtoSlug);
    await expect(page.getByRole('dialog', { name: /^Cobrar/ }).getByText('Q70.00', { exact: true }).first()).toBeVisible();
    await page.getByText('Recibos de abonos', { exact: true }).click();
    await expect(page.getByText('Recibido Q100.00 · vuelto Q50.00', { exact: true })).toBeVisible();
    await page.getByText('Historial de cobros', { exact: true }).click();
    await expect(page.getByText('Recibido Q100.00', { exact: false }).last()).toBeVisible();
  } finally {
    await context.close();
    check(await db.from('restaurants').delete().eq('id', rest.id));
    if (userId) {
      const deleted = await db.auth.admin.deleteUser(userId);
      if (deleted.error) throw deleted.error;
    }
  }
});

test('1.1 · las partes pagadas sobreviven a recargar y el cierre se confirma aparte', async ({ browser }) => {
  test.setTimeout(180_000);
  const context = await browser.newContext({ viewport: { width: 1280, height: 850 } });
  try {
    await login(context, users[0].email);
    const page = await context.newPage();
    const order = check(await db.from('orders').insert({ restaurant_id: restaurantId, order_number: `AUD-partes-${suffix}`,
      customer_name: 'AUD Partes', customer_phone: '00000000', order_type: 'DINE_IN', table_number: 9,
      address: 'Mesa 9', status: 'SERVED', subtotal: 100, total: 100 }).select('id').single())!;
    check(await db.from('order_items').insert({ order_id: order.id, name_snapshot: 'AUD Partes', price_snapshot: 100,
      quantity: 1, subtotal: 100, served_at: new Date().toISOString() }));
    await openBill(page, 9);
    const abrirPartes = () => page.getByRole('tab', { name: 'Partes iguales', exact: true }).click();
    await abrirPartes();
    await page.getByRole('button', { name: 'Una parte más' }).click();
    await page.getByRole('button', { name: 'Guardar reparto', exact: true }).click();
    await page.getByRole('button', { name: /Parte 1.*Q33\.34/ }).click();
    await page.getByRole('button', { name: /Parte 2.*Q33\.33/ }).click();
    await page.getByRole('button', { name: 'Tarjeta', exact: true }).click();
    await page.getByRole('button', { name: 'Registrar Q66.67', exact: true }).click();
    await expect(page.getByText(/Q66\.67 cobrado · la mesa sigue abierta/)).toBeVisible();
    await openBill(page, 9);
    await abrirPartes();
    await expect(page.getByText('Parte 1 · Pagada', { exact: true })).toBeVisible();
    await expect(page.getByText('Parte 2 · Pagada', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Parte 3.*Q33\.33/ }).click();
    await page.getByRole('button', { name: 'Transferencia', exact: true }).click();
    await page.getByRole('button', { name: 'Registrar Q33.33', exact: true }).click();
    await expect(page.getByText(/Q33\.33 cobrado · la mesa sigue abierta/)).toBeVisible();
    expect(check(await db.from('orders').select('status').eq('id', order.id).single())?.status).toBe('SERVED');
    await page.getByRole('button', { name: /^Ver pagos/ }).click();
    await expect(page.getByText('Parte 3 · Pagada', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await limpiarYLiberar(page, 9);
    expect(check(await db.from('orders').select('status').eq('id', order.id).single())?.status).toBe('DELIVERED');
    expect(check(await db.from('order_payments').select('method,amount').eq('order_id', order.id).order('method')))
      .toEqual([{ method: 'CARD', amount: 66.67 }, { method: 'TRANSFER', amount: 33.33 }]);
  } finally { await context.close(); }
});

test('1.0 · el cobro mantiene el saldo y la acción visibles y contiene el foco', async ({ browser }) => {
  test.setTimeout(180_000);
  const context = await browser.newContext({ viewport: { width: 390, height: 650 } });
  try {
    await login(context, users[0].email);
    const page = await context.newPage();
    await openBill(page);
    const hoja = page.getByRole('dialog', { name: /^Cobrar/ });
    const cobrar = hoja.getByRole('button', { name: 'Cobrar Q70.00', exact: true });
    await expect(cobrar).toBeInViewport({ ratio: 1 });
    await expect(cobrar).toHaveCSS('min-height', '56px');
    await expect(hoja.getByText('Por cobrar', { exact: true })).toBeInViewport({ ratio: 1 });
    await cobrar.focus();
    await page.keyboard.press('Tab');
    await expect.poll(() => hoja.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(hoja).toBeHidden();
    await expect(page.getByRole('button', { name: /^Cobrar mesa/ }).first()).toBeFocused();
  } finally { await context.close(); }
});

test('dos empleados cobran un plato una vez; el saldo se cobra y la mesa se cierra', async ({ browser }) => {
  test.setTimeout(180_000);
  const contexts = await Promise.all(users.map(() => browser.newContext({ viewport: { width: 1280, height: 900 } })));
  try {
    const pages = await Promise.all(contexts.map(async (context, i) => {
      await login(context, users[i].email);
      const page = await context.newPage();
      await openBill(page);
      await page.getByRole('tab', { name: 'Por platos' }).click();
      await page.getByRole('button', { name: /1× AUD Plato 52.*c\/u/ }).click();
      await page.getByRole('button', { name: 'Tarjeta', exact: true }).click();
      return page;
    }));
    await Promise.all(pages.map((page) => page.getByRole('button', { name: /Cobrar Q52\.00 de esta parte/ }).click()));
    await expect.poll(async () => check(await db.from('order_payments').select('amount').eq('order_id', orderId))!.reduce((n, p) => n + Number(p.amount), 0)).toBe(52);
    await expect(pages[0].getByText(/cobrado · la mesa sigue abierta/).or(pages[0].getByText(/ya están pagados|saldo cambió/)).first()).toBeVisible();
    await expect(pages[1].getByText(/cobrado · la mesa sigue abierta/).or(pages[1].getByText(/ya están pagados|saldo cambió/)).first()).toBeVisible();
    await openBill(pages[0]);
    await pages[0].getByRole('tab', { name: 'Cuenta completa', exact: true }).click();
    await pages[0].getByRole('button', { name: 'Tarjeta', exact: true }).click();
    await pages[0].getByRole('button', { name: /Cobrar Q18\.00/ }).click();
    await expect(pages[0].getByText(/Q18\.00 cobrado · la mesa sigue abierta/)).toBeVisible();
    await limpiarYLiberar(pages[0], 1);
    const payments = check(await db.from('order_payments').select('amount,taken_by').eq('order_id', orderId))!;
    expect(payments.map((p) => Number(p.amount)).sort((a, b) => a - b)).toEqual([18, 52]);
    expect(check(await db.from('orders').select('status').eq('id', orderId).single())?.status).toBe('DELIVERED');
  } finally { await Promise.allSettled(contexts.map((context) => context.close())); }
});

test('0.15 · una respuesta perdida se recupera tras recargar con la identidad original', async ({ browser }) => {
  test.setTimeout(180_000);
  const o = check(await db.from('orders').insert({ restaurant_id: restaurantId, order_number: `AUD-retry-${suffix}`,
    customer_name: 'AUD Reintento', customer_phone: '00000000', order_type: 'DINE_IN', table_number: 1,
    address: 'Mesa 1', status: 'SERVED', subtotal: 70, total: 70 }).select('id').single())!;
  const items = check(await db.from('order_items').insert([52, 18].map((amount) => ({ order_id: o.id,
    name_snapshot: `AUD Reintento ${amount}`, price_snapshot: amount, quantity: 1, subtotal: amount,
    served_at: new Date().toISOString() }))).select('id,subtotal'))!;
  const itemId = items.find((i) => Number(i.subtotal) === 52)!.id;
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    await login(context, users[0].email);
    const page = await context.newPage();
    await openBill(page);
    await page.getByRole('tab', { name: 'Por platos' }).click();
    await page.getByRole('button', { name: /1× AUD Reintento 52.*c\/u/ }).click();
    await page.getByRole('button', { name: 'Tarjeta', exact: true }).click();
    let lost = false;
    await page.route('**/*', async (route) => {
      const request = route.request();
      if (!lost && request.method() === 'POST' && request.headers()['next-action'] && request.postData()?.includes(itemId)) {
        const response = await route.fetch(); // acción y COMMIT reales antes de perder la respuesta
        expect(response.ok()).toBe(true);
        expect(check(await db.from('order_payments').select('id').eq('order_id', o.id))).toHaveLength(1);
        lost = true;
        await route.abort('failed');
      } else await route.continue();
    });
    await page.getByRole('button', { name: /Cobrar Q52\.00 de esta parte/ }).click();
    await expect(page.getByText(/No se pudo confirmar el cobro/)).toBeVisible();
    expect(lost).toBe(true);
    const key = `leogin:cobro-pendiente:${restaurantId}:${users[0].id}`;
    const pending = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), key);
    const original = check(await db.from('cobro_intentos').select('resultado').eq('restaurant_id', restaurantId).eq('intento_id', pending.id).single())!;
    const payments = check(await db.from('order_payments').select('*').eq('order_id', o.id));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Q52\.00 cobrado · la mesa sigue abierta/)).toBeVisible();
    expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
    expect(check(await db.from('order_payments').select('*').eq('order_id', o.id))).toEqual(payments);
    expect(check(await db.from('cobro_intentos').select('resultado').eq('restaurant_id', restaurantId).eq('intento_id', pending.id).single())).toEqual(original);
    expect(original.resultado).toMatchObject({ intentoId: pending.id, cobrado: 52, paymentIds: payments!.map((p) => p.id) });
  } finally { await context.close(); }
});

test('0.16 · un parcial y una ronda nueva se cierran cobrando el saldo de cada pedido', async ({ browser }) => {
  test.setTimeout(180_000);
  async function ronda(amounts: number[], numero: string) {
    const total = amounts.reduce((s, n) => s + n, 0);
    const o = check(await db.from('orders').insert({ restaurant_id: restaurantId, order_number: `AUD-ronda-${numero}-${suffix}`,
      customer_name: 'AUD Rondas', customer_phone: '00000000', order_type: 'DINE_IN', table_number: 2,
      address: 'Mesa 2', status: 'SERVED', subtotal: total, total }).select('id').single())!;
    check(await db.from('order_items').insert(amounts.map((amount) => ({ order_id: o.id, name_snapshot: `AUD Ronda ${amount}`,
      price_snapshot: amount, quantity: 1, subtotal: amount, served_at: new Date().toISOString() }))));
    return o;
  }
  const first = await ronda([40, 60], 'primera');
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    await login(context, users[0].email);
    const page = await context.newPage();
    await openBill(page, 2);
    await page.getByRole('tab', { name: 'Por platos' }).click();
    await page.getByRole('button', { name: /1× AUD Ronda 40.*c\/u/ }).click();
    await page.getByRole('button', { name: 'Tarjeta', exact: true }).click();
    await page.getByRole('button', { name: /Cobrar Q40\.00 de esta parte/ }).click();
    await expect(page.getByText(/Q40\.00 cobrado · la mesa sigue abierta/)).toBeVisible();
    const previo = check(await db.from('order_payments').select('*').eq('order_id', first.id))!;
    expect(previo).toHaveLength(1);
    const second = await ronda([20], 'segunda');
    await openBill(page, 2);
    await page.getByRole('button', { name: 'Tarjeta', exact: true }).click();
    await page.getByRole('button', { name: /Cobrar Q80\.00/ }).click();
    await expect(page.getByText(/Q80\.00 cobrado · la mesa sigue abierta/)).toBeVisible();
    await limpiarYLiberar(page, 2);
    const pagos = check(await db.from('order_payments').select('*').in('order_id', [first.id, second.id]))!;
    expect(pagos.filter((p) => p.order_id === first.id).reduce((n, p) => n + Number(p.amount), 0)).toBe(100);
    expect(pagos.filter((p) => p.order_id === second.id).reduce((n, p) => n + Number(p.amount), 0)).toBe(20);
    expect(pagos.filter((p) => p.id === previo[0].id)).toEqual(previo);
    expect(check(await db.from('orders').select('status').in('id', [first.id, second.id]))?.map((o) => o.status)).toEqual(['DELIVERED', 'DELIVERED']);
  } finally { await context.close(); }
});

test('0.17 · el botón y Postgres conservan Q33.34 + Q33.33 + Q33.33', async ({ browser }) => {
  test.setTimeout(180_000);
  const o = check(await db.from('orders').insert({ restaurant_id: restaurantId, order_number: `AUD-centavo-${suffix}`,
    customer_name: 'AUD Centavos', customer_phone: '00000000', order_type: 'DINE_IN', table_number: 3,
    address: 'Mesa 3', status: 'SERVED', subtotal: 90, tip: 20, discount: 10, total: 100 }).select('id').single())!;
  const ids = Array.from({ length: 3 }, () => crypto.randomUUID()).sort();
  check(await db.from('order_items').insert(ids.map((id, i) => ({ id, order_id: o.id, name_snapshot: `AUD Residuo ${i + 1}`,
    price_snapshot: 30, quantity: 1, subtotal: 30, served_at: new Date().toISOString() }))));
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    await login(context, users[0].email);
    const page = await context.newPage();
    for (let i = 0; i < 3; i++) {
      await openBill(page, 3);
      await page.getByRole('tab', { name: 'Por platos' }).click();
      await page.getByRole('button', { name: new RegExp(`1× AUD Residuo ${i + 1}.*c/u`) }).click();
      await page.getByRole('button', { name: 'Tarjeta', exact: true }).click();
      if (i < 2) {
        const amount = i === 0 ? '33.34' : '33.33';
        await page.getByRole('button', { name: `Cobrar Q${amount} de esta parte`, exact: true }).click();
        await expect(page.getByText(/cobrado · la mesa sigue abierta/)).toBeVisible();
      } else {
        await page.getByRole('button', { name: 'Cobrar Q33.33', exact: true }).click();
        await limpiarYLiberar(page, 3);
      }
    }
    const payments = check(await db.from('order_payments').select('*').eq('order_id', o.id).order('created_at'))!;
    expect(payments.map((p) => Number(p.amount))).toEqual([33.34, 33.33, 33.33]);
    expect(payments.reduce((sum, p) => sum + Math.round(Number(p.amount) * 100), 0)).toBe(10000);
    expect(check(await db.from('orders').select('status').eq('id', o.id).single())?.status).toBe('DELIVERED');
  } finally { await context.close(); }
});

test('0.18 · caja conserva el primer recibo y cuenta el pago posterior una vez en el siguiente', async ({ browser }) => {
  test.setTimeout(180_000);
  check(await db.from('restaurants').update({ modules: { orders: true } }).eq('id', restaurantId));
  check(await db.from('profiles').update({ permissions: ['mesero', 'caja.cobrar', 'finanzas', ...CAJA_COMPLETA] }).eq('id', users[0].id));
  const o = check(await db.from('orders').insert({ restaurant_id: restaurantId, order_number: `AUD-caja-${suffix}`,
    customer_name: 'AUD Caja', customer_phone: '00000000', order_type: 'DINE_IN', table_number: 4,
    address: 'Mesa 4', status: 'SERVED', subtotal: 20, total: 20 }).select('id').single())!;
  check(await db.from('order_items').insert({ order_id: o.id, name_snapshot: 'AUD Caja 20', price_snapshot: 20,
    quantity: 1, subtotal: 20, served_at: new Date().toISOString() }));
  check(await db.from('order_payments').insert({ restaurant_id: restaurantId, order_id: o.id, method: 'CASH', amount: 10 }));
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    await login(context, users[0].email);
    const page = await context.newPage();
    async function cerrarDesdePantalla(anterior = false) {
      await page.goto(`${origin}/panel/${slug}/caja`, { waitUntil: 'domcontentloaded' });
      if (anterior) await page.getByRole('button', { name: 'Abrir el siguiente turno', exact: true }).click();
      const billetes = page.locator('input[name="bil_10"]');
      await expect(billetes).toBeEditable({ timeout: 30_000 });
      // El HTML puede aparecer antes de hidratar: verifica el conteo de React,
      // no solo el valor que Playwright escribió en el input del servidor.
      await expect(async () => {
        await billetes.fill('');
        await billetes.fill('1');
        await expect(billetes).toHaveAttribute('data-filled', '1');
      }).toPass({ timeout: 15_000 });
      await page.getByRole('button', { name: 'Siguiente: gastos', exact: true }).click();
      await page.getByRole('button', { name: 'Siguiente: propinas', exact: true }).click();
      await page.getByRole('button', { name: 'Cerrar el turno', exact: true }).click();
      await page.getByRole('button', { name: 'Cerrar el turno igual', exact: true }).click();
      await expect(page.getByText('Turno cerrado', { exact: true }).first()).toBeVisible();
    }
    await cerrarDesdePantalla();
    const first = check(await db.from('cash_counts').select('*').eq('restaurant_id', restaurantId).eq('status', 'CLOSED').single())!;
    expect(Number(first.expected_cash)).toBe(10);
    expect(first.caja_revision).not.toBeNull();
    const payment = check(await db.from('order_payments').insert({ restaurant_id: restaurantId, order_id: o.id,
      method: 'CASH', amount: 10 }).select('*').single())!;
    expect(payment.caja_corte_previo).toBe(first.id);
    expect(payment.caja_registrado_en > first.closed_at).toBe(true);
    await cerrarDesdePantalla(true);
    const counts = check(await db.from('cash_counts').select('*').eq('restaurant_id', restaurantId).eq('status', 'CLOSED').order('closed_at'))!;
    expect(counts.map((c) => Number(c.expected_cash))).toEqual([10, 10]);
    expect(counts[0]).toEqual(first);
    expect(counts[1].caja_corte_previo).toBe(first.id);
  } finally { await context.close(); }
});

test('0.19 · el cierre incluye el cobro del inicio exacto del día una sola vez', async ({ browser }) => {
  test.setTimeout(180_000);
  const diaSlug = `${slug}-dia`;
  const rest = check(await db.from('restaurants').insert({ name: 'AUD Límite', slug: diaSlug, status: 'active',
    plan_actual: 'PREMIUM', onboarding_done: true, timezone: 'America/Guatemala', day_cutoff_minutes: 300,
    modules: { orders: true } }).select('id').single())!;
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  let userId: string | undefined;
  try {
    check(await db.from('restaurant_themes').insert({ restaurant_id: rest.id, brand_name: 'AUD Límite' }));
    const email = `aud-cobro-${suffix}-dia@test.local`;
    const user = await db.auth.admin.createUser({ email, email_confirm: true });
    if (user.error) throw user.error;
    userId = user.data.user!.id;
    check(await db.from('profiles').upsert({ id: userId, full_name: 'AUD Caja día', restaurant_id: rest.id,
      role: 'RESTAURANT_STAFF', permissions: ['finanzas', ...CAJA_COMPLETA] }));
    const reloj = check(await db.rpc('leogin_contexto_caja', { p_restaurant: rest.id, p_cambio: false }));
    const dia = diaDeNegocio(new Date(reloj.hasta), 'America/Guatemala', 300);
    const inicio = inicioDelDia(dia, 'America/Guatemala', 300).getTime();
    for (const [i, offset] of [-1, 0, 1].entries()) {
      const at = new Date(inicio + offset).toISOString();
      const o = check(await db.from('orders').insert({ restaurant_id: rest.id, order_number: `AUD-dia-${suffix}-${i}`,
        customer_name: 'AUD Día', customer_phone: '00000000', order_type: 'PICKUP', status: 'DELIVERED',
        subtotal: i + 1, total: i + 1, created_at: at, delivered_at: at }).select('id').single())!;
      check(await db.from('order_payments').insert({ restaurant_id: rest.id, order_id: o.id,
        method: 'CASH', amount: i + 1, created_at: at }));
    }
    await login(context, email);
    const page = await context.newPage();
    await page.goto(`${origin}/panel/${diaSlug}/caja`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Siguiente: gastos', exact: true }).click();
    await page.getByRole('button', { name: /Efectivo sin contar/ }).click();
    const billetes = page.getByRole('spinbutton', { name: 'Cuántos billetes de Q5', exact: true });
    await expect(async () => {
      await billetes.fill('');
      await billetes.fill('1');
      await expect(billetes).toHaveAttribute('data-filled', '1');
    }).toPass({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Siguiente: gastos', exact: true }).click();
    await page.getByRole('button', { name: 'Siguiente: propinas', exact: true }).click();
    await page.getByRole('button', { name: 'Cerrar el turno', exact: true }).click();
    await expect(page.getByText('Turno cerrado', { exact: true }).first()).toBeVisible();
    const first = check(await db.from('cash_counts').select('*').eq('restaurant_id', rest.id).eq('status', 'CLOSED').single())!;
    expect(Number(first.expected_cash)).toBe(5);
    expect(Number(first.counted_cash)).toBe(5);
    await page.goto(`${origin}/panel/${diaSlug}/caja`, { waitUntil: 'domcontentloaded' });
    // Una segunda lectura/cierre conserva el recibo y no vuelve a contar Q2 ni Q3.
    await page.getByRole('button', { name: 'Abrir el siguiente turno', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar conteo en cero', exact: true }).click();
    await page.getByRole('button', { name: 'Siguiente: gastos', exact: true }).click();
    await page.getByRole('button', { name: 'Siguiente: propinas', exact: true }).click();
    await page.getByRole('button', { name: 'Cerrar el turno', exact: true }).click();
    await expect(page.getByText('Turno cerrado', { exact: true }).first()).toBeVisible();
    const cortes = check(await db.from('cash_counts').select('*').eq('restaurant_id', rest.id).eq('status', 'CLOSED').order('closed_at'))!;
    expect(cortes.map((c) => Number(c.expected_cash))).toEqual([5, 0]);
    expect(cortes[0]).toEqual(first);
  } finally {
    await context.close();
    if (userId) {
      const deleted = await db.auth.admin.deleteUser(userId);
      if (deleted.error) throw deleted.error;
    }
    check(await db.from('restaurants').delete().eq('id', rest.id));
  }
});

test('1.2 · Caja móvil cuenta billetes y monedas y retoma el borrador guardado', async ({ browser }) => {
  test.setTimeout(180_000);
  check(await db.from('restaurants').update({ modules: { orders: true } }).eq('id', restaurantId));
  check(await db.from('profiles').update({ permissions: ['mesero', 'caja.cobrar', 'finanzas', ...CAJA_COMPLETA] }).eq('id', users[0].id));
  const context = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
  try {
    await login(context, users[0].email);
    const page = await context.newPage();
    await page.goto(`${origin}/panel/${slug}/caja`, { waitUntil: 'domcontentloaded' });
    const q5 = page.getByRole('spinbutton', { name: 'Cuántos billetes de Q5', exact: true });
    const quitar = page.getByRole('button', { name: 'Quitar un billete de Q5', exact: true });
    await expect(quitar).toBeDisabled();
    await expect(q5).toHaveCSS('text-align', 'center');
    await page.getByRole('button', { name: 'Agregar un billete de Q5', exact: true }).tap();
    await expect(q5).toHaveValue('1');
    await page.getByRole('button', { name: 'Monedas', exact: true }).tap();
    await page.getByRole('button', { name: 'Agregar una moneda de Q0.01', exact: true }).tap();
    await expect(page.locator('[data-caja-contado]')).toHaveText('Q5.01');
    await expect(page.getByRole('status').filter({ hasText: 'Guardado en la nube' })).toBeVisible({ timeout: 15_000 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(q5).toHaveValue('1');
    await expect(page.locator('[data-caja-contado]')).toHaveText('Q5.01');
    await page.getByRole('button', { name: 'Monedas', exact: true }).tap();
    await expect(page.getByRole('spinbutton', { name: 'Cuántas monedas de Q0.01', exact: true })).toHaveValue('1');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally { await context.close(); }
});

test('1.2 · el traspaso queda pendiente hasta que confirma la otra sesión', async ({ browser }) => {
  test.setTimeout(180_000);
  const saliente = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
  const entrante = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const localSlug = `${slug}-traspaso`;
  const url = `${origin}/panel/${localSlug}/caja`;
  let localId: string | undefined;
  const operadores = users.map((u) => u.id);
  try {
    const local = check(await db.from('restaurants').insert({ name: 'AUD Traspaso', slug: localSlug, status: 'active',
      plan_actual: 'PREMIUM', onboarding_done: true, modules: { orders: true } }).select('id').single())!;
    localId = local.id;
    check(await db.from('restaurant_themes').insert({ restaurant_id: local.id, brand_name: 'AUD Traspaso',
      config: { orderTypes: ['dine_in'] } }));
    check(await db.from('profiles').update({ restaurant_id: local.id, permissions: ['finanzas', ...CAJA_COMPLETA] }).in('id', operadores));
    await login(saliente, users[0].email);
    const caja = await saliente.newPage();
    await caja.goto(url, { waitUntil: 'domcontentloaded' });
    await caja.getByRole('button', { name: /Efectivo sin contar/ }).click();
    const billetes = caja.locator('input[name="bil_100"]');
    await expect(async () => {
      await billetes.fill('');
      await billetes.fill('5');
      await expect(caja.locator('[data-caja-contado]')).toHaveText('Q500.00');
    }).toPass({ timeout: 30_000 });
    await caja.getByRole('button', { name: 'Siguiente: gastos', exact: true }).click();
    await caja.getByRole('button', { name: 'Siguiente: propinas', exact: true }).click();
    await caja.getByRole('button', { name: 'Cerrar el turno', exact: true }).click();
    const traspaso = caja.getByRole('region', { name: 'Traspaso de turno' });
    await expect(traspaso).toBeVisible({ timeout: 30_000 });

    await traspaso.getByRole('combobox', { name: 'Recibe', exact: true }).selectOption(users[1].id);
    const solicitar = traspaso.getByRole('button', { name: 'Solicitar recepción' });
    await expect(solicitar).toBeDisabled();
    await traspaso.getByLabel('Observación de la diferencia').fill('AUD diferencia anotada');
    await solicitar.click();
    await expect(traspaso.getByRole('status')).toHaveText('Pendiente de recepción');
    await expect(traspaso.getByRole('button', { name: 'Confirmar recepción' })).toHaveCount(0);
    const registro = check(await db.from('caja_traspasos').select('*').eq('restaurant_id', local.id).single())!;
    expect(registro).toMatchObject({ entrega_id: users[0].id, recibe_id: users[1].id, confirmado_at: null });

    await login(entrante, users[1].email);
    const otraCaja = await entrante.newPage();
    await otraCaja.goto(url, { waitUntil: 'domcontentloaded' });
    const bandeja = otraCaja.getByRole('region', { name: 'Recepciones de Caja' });
    await expect(bandeja.getByText('AUD diferencia anotada')).toBeVisible();
    await expect(bandeja.getByText('Q500.00', { exact: true }).first()).toBeVisible();
    // El botón ya se ve con el HTML del servidor; un toque antes de que la
    // página termine de cargar se pierde. Se reintenta hasta que confirma.
    await expect(async () => {
      const confirmar = bandeja.getByRole('button', { name: 'Confirmar recepción' });
      if (await confirmar.count()) await confirmar.click({ timeout: 3_000 });
      await expect(bandeja.getByRole('status')).toHaveText('Recepción confirmada', { timeout: 5_000 });
    }).toPass({ timeout: 45_000 });
    const confirmado = check(await db.from('caja_traspasos').select('confirmado_at')
      .eq('corte_id', registro.corte_id).single())!;
    expect(confirmado.confirmado_at).toBeTruthy();
    await caja.reload({ waitUntil: 'domcontentloaded' });
    await expect(traspaso.getByRole('status')).toHaveText('Recepción confirmada', { timeout: 30_000 });
  } finally {
    await saliente.close();
    await entrante.close();
    if (localId) {
      check(await db.from('profiles').update({ restaurant_id: restaurantId }).in('id', operadores));
      check(await db.from('restaurants').delete().eq('id', localId));
    }
  }
});
