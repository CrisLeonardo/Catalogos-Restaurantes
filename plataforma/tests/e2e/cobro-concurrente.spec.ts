/** 0.14: dos sesiones reales intentan cobrar el mismo plato. Solo Supabase local. */
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { readFileSync } from 'node:fs';
import { diaDeNegocio, inicioDelDia } from '../../src/lib/caja/dia';

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
async function openBill(page: Page, mesa = 1) {
  await expect(async () => {
    await page.goto(`${origin}/panel/${slug}/mesero?mesa=${mesa}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: /^Cobrar y cerrar mesa/ }).first()).toBeVisible();
  }).toPass({ timeout: 90_000 });
  await page.getByRole('button', { name: /^Cobrar y cerrar mesa/ }).first().click();
  await expect(page.getByRole('tab', { name: 'Por platos' })).toBeVisible();
}

test.beforeAll(async () => {
  const rest = check(await db.from('restaurants').insert({ name: 'AUD Cobro', slug, status: 'active', plan_actual: 'PREMIUM', onboarding_done: true }).select('id').single());
  restaurantId = rest!.id;
  check(await db.from('restaurant_themes').insert({ restaurant_id: restaurantId, brand_name: 'AUD Cobro', config: { orderTypes: ['dine_in'] } }));
  for (let i = 0; i < 2; i++) {
    const email = `aud-cobro-${suffix}-${i}@test.local`;
    const created = await db.auth.admin.createUser({ email, email_confirm: true });
    if (created.error) throw created.error;
    users.push({ id: created.data.user!.id, email });
    check(await db.from('profiles').upsert({ id: created.data.user!.id, full_name: `AUD Caja ${i}`, restaurant_id: restaurantId, role: 'RESTAURANT_STAFF', permissions: ['mesero'] }));
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

test('1.0 · el cobro mantiene el saldo y la acción visibles y contiene el foco', async ({ browser }) => {
  test.setTimeout(180_000);
  const context = await browser.newContext({ viewport: { width: 390, height: 650 } });
  try {
    await login(context, users[0].email);
    const page = await context.newPage();
    await openBill(page);
    const hoja = page.getByRole('dialog', { name: /^Cobrar/ });
    const cobrar = hoja.getByRole('button', { name: 'Cobrar Q70.00 y cerrar', exact: true });
    await expect(cobrar).toBeInViewport({ ratio: 1 });
    await expect(cobrar).toHaveCSS('min-height', '56px');
    await expect(hoja.getByText('Por cobrar', { exact: true })).toBeInViewport({ ratio: 1 });
    await cobrar.focus();
    await page.keyboard.press('Tab');
    await expect.poll(() => hoja.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(hoja).toBeHidden();
    await expect(page.getByRole('button', { name: /^Cobrar y cerrar mesa/ }).first()).toBeFocused();
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
    await pages[0].getByRole('button', { name: /Cobrar Q18\.00 y cerrar/ }).click();
    await expect(pages[0].getByText(/Mesa 1 libre/)).toBeVisible();
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
    await page.getByRole('button', { name: /Cobrar Q80\.00 y cerrar/ }).click();
    await expect(page.getByText(/Q80\.00 cobrado · Mesa 2 libre/)).toBeVisible();
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
        await page.getByRole('button', { name: 'Cobrar Q33.33 y cerrar', exact: true }).click();
        await expect(page.getByText(/Mesa 3 libre/)).toBeVisible();
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
  check(await db.from('profiles').update({ permissions: ['mesero', 'finanzas'] }).eq('id', users[0].id));
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
    async function cerrarDesdePantalla() {
      await page.goto(`${origin}/panel/${slug}/caja`, { waitUntil: 'domcontentloaded' });
      const billetes = page.getByRole('spinbutton', { name: 'Cuántos billetes de Q10', exact: true });
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
    await cerrarDesdePantalla();
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
      role: 'RESTAURANT_STAFF', permissions: ['finanzas'] }));
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
