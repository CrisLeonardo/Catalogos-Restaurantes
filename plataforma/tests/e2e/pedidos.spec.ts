/**
 * Fase 0 de PLAN_CORRECCION_PREVENTA.md — cobertura mínima real con Playwright:
 * crear pedido (menú público), anularlo (panel admin), y confirmar que un
 * dueño NO puede leer los pedidos de otro restaurante (aislamiento RLS).
 *
 * Cada corrida crea sus propios 2 restaurantes de prueba (vía service role,
 * mismo patrón que scripts/test-aislamiento.mjs) y los borra al terminar —
 * no depende de datos de demo existentes ni los modifica.
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, '..', '..', '.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      const v = t.slice(eq + 1).trim();
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch { /* usa variables del sistema */ }
}
loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY (.env.local).');
}
const rootDomain = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3000').split(',')[0].trim();

const admin: SupabaseClient = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

const SUFFIX = Math.random().toString(36).slice(2, 8);
const OWNER_PASSWORD = 'PlaywrightTest12345!';

interface TestTenant {
  id: string;
  slug: string;
  ownerEmail: string;
  ownerId: string;
  productName: string;
}

function tenantUrl(slug: string, path = '/'): string {
  return `http://${slug}.${rootDomain}${path}`;
}

async function makeTenant(tag: string): Promise<TestTenant> {
  const slug = `pw-${tag}-${SUFFIX}`;
  const { data: r, error: rErr } = await admin
    .from('restaurants')
    .insert({ name: `Playwright ${tag} ${SUFFIX}`, slug, status: 'active', plan_actual: 'PREMIUM', modules: { orders: true } })
    .select('id')
    .single();
  if (rErr || !r) throw new Error(`crear restaurante ${tag}: ${rErr?.message}`);

  const { error: themeErr } = await admin.from('restaurant_themes').insert({ restaurant_id: r.id, brand_name: `Playwright ${tag}` });
  if (themeErr) throw new Error(`crear tema ${tag}: ${themeErr.message}`);

  const { data: cat, error: catErr } = await admin
    .from('categories')
    .insert({ restaurant_id: r.id, name: 'Categoría de prueba', sort_order: 0, is_active: true })
    .select('id')
    .single();
  if (catErr || !cat) throw new Error(`crear categoría ${tag}: ${catErr?.message}`);

  const productName = `Producto Playwright ${tag} ${SUFFIX}`;
  const { error: prodErr } = await admin
    .from('products')
    .insert({ restaurant_id: r.id, category_id: cat.id, name: productName, price: 42, is_active: true });
  if (prodErr) throw new Error(`crear producto ${tag}: ${prodErr.message}`);

  const ownerEmail = `owner-pw-${tag}-${SUFFIX}@test.local`;
  const { data: u, error: uErr } = await admin.auth.admin.createUser({ email: ownerEmail, password: OWNER_PASSWORD, email_confirm: true });
  if (uErr || !u.user) throw new Error(`crear dueño ${tag}: ${uErr?.message}`);
  const { error: profErr } = await admin.from('profiles').upsert({ id: u.user.id, restaurant_id: r.id, role: 'RESTAURANT_OWNER', full_name: `Dueño ${tag}` });
  if (profErr) throw new Error(`crear perfil ${tag}: ${profErr.message}`);

  return { id: r.id as string, slug, ownerEmail, ownerId: u.user.id, productName };
}

async function cleanupTenant(t: TestTenant | undefined) {
  if (!t) return;
  try { await admin.auth.admin.deleteUser(t.ownerId); } catch { /* ya no existe */ }
  try { await admin.from('restaurants').delete().eq('id', t.id); } catch { /* ya no existe */ }
}

test.describe('Fase 0 — cobertura mínima E2E', () => {
  let tenantA: TestTenant;
  let tenantB: TestTenant;

  test.beforeAll(async () => {
    tenantA = await makeTenant('a');
    tenantB = await makeTenant('b');
  });

  test.afterAll(async () => {
    await cleanupTenant(tenantA);
    await cleanupTenant(tenantB);
  });

  test('crear pedido desde el menú público y anularlo desde el panel admin', async ({ page }) => {
    await page.goto(tenantUrl(tenantA.slug, '/'));

    const verMenu = page.getByRole('button', { name: 'Ver el menú' });
    if (await verMenu.isVisible().catch(() => false)) {
      await verMenu.click();
    }

    await page.getByRole('button', { name: `Agregar ${tenantA.productName}`, exact: true }).click();
    await page.goto(tenantUrl(tenantA.slug, '/checkout'));

    await page.getByRole('button', { name: 'Para llevar' }).click();
    await page.getByPlaceholder('¿Cómo te llamás?').fill('Cliente de Prueba Playwright');
    await page.getByPlaceholder('5xxx xxxx').fill('55551234');
    await page.getByRole('button', { name: 'Confirmar pedido' }).click();

    await expect(page.getByText('¡Pedido enviado!')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Número de pedido')).toBeVisible();

    const { data: orders, error: ordersErr } = await admin
      .from('orders')
      .select('id, status')
      .eq('restaurant_id', tenantA.id);
    expect(ordersErr).toBeNull();
    expect(orders?.length).toBe(1);
    expect(orders![0].status).toBe('NEW');
    const orderId = orders![0].id as string;

    await page.goto(tenantUrl(tenantA.slug, '/admin/login'));
    await page.getByLabel('Email').fill(tenantA.ownerEmail);
    await page.getByLabel('Contraseña').fill(OWNER_PASSWORD);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.waitForURL(/\/admin\/(menu|pedidos)/, { timeout: 40_000 });
    await page.waitForLoadState('load');

    await page.goto(tenantUrl(tenantA.slug, '/admin/pedidos'), { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: 'Cancelar' })).toHaveCount(1);
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByText('Anular pedido', { exact: true })).toBeVisible({ timeout: 10_000 });

    const reasonBox = page.getByPlaceholder('Ej. el cliente lo devolvió, error al tomar el pedido…');
    await expect(reasonBox).toBeVisible();
    await reasonBox.fill('Prueba automatizada Playwright — cobertura mínima Fase 0');
    await page.getByRole('button', { name: 'Anular pedido completo' }).click();

    // Espera algo DEFINITIVO (no el label transitorio "Anulando…"): o el
    // diálogo se cierra de verdad (éxito), o queda un mensaje de error visible.
    const dialogTitle = page.getByText('Anular pedido', { exact: true });
    const result = await Promise.race([
      dialogTitle.waitFor({ state: 'hidden', timeout: 15_000 }).then(() => 'closed' as const),
      page.waitForTimeout(15_000).then(() => 'timeout' as const),
    ]);
    if (result !== 'closed') {
      const dialogText = await page.locator('.glass.anim-slide-up').innerText().catch(() => '(no se encontró el diálogo)');
      throw new Error(`El diálogo de anulación no cerró a tiempo. Contenido visible: ${dialogText}`);
    }

    const { data: after, error: afterErr } = await admin.from('orders').select('status').eq('id', orderId).single();
    expect(afterErr).toBeNull();
    expect(after?.status).toBe('CANCEL');
  });

  test('aislamiento multi-tenant: el dueño de A no puede leer pedidos de B', async () => {
    const { data: orderB, error: insErr } = await admin
      .from('orders')
      .insert({
        restaurant_id: tenantB.id,
        order_number: `PW-B-${SUFFIX}`,
        customer_name: 'Cliente B',
        customer_phone: '00000000',
        order_type: 'PICKUP',
        payment_method: 'CASH',
        status: 'NEW',
        subtotal: 42,
        total: 42,
      })
      .select('id')
      .single();
    expect(insErr).toBeNull();

    const asA = createClient(url!, anonKey!, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error: signErr } = await asA.auth.signInWithPassword({ email: tenantA.ownerEmail, password: OWNER_PASSWORD });
    expect(signErr).toBeNull();

    const { data: leakedAll } = await asA.from('orders').select('id').eq('restaurant_id', tenantB.id);
    expect(leakedAll?.length ?? 0).toBe(0);

    const { data: leakedById } = await asA.from('orders').select('id').eq('id', orderB!.id as string);
    expect(leakedById?.length ?? 0).toBe(0);

    await asA.auth.signOut();
  });
});
