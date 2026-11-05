/** Auditoría 0.12: altas modernas, cambio de sucursal y acciones sin la UI. */
import { test, expect, type BrowserContext, type Page, type Response as BrowserResponse } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';

try {
  for (const line of readFileSync(join(__dirname, '../../.env.local'), 'utf8').split('\n')) {
    const match = line.trim().match(/^([A-Z_]+)=(.*)$/);
    if (match && !(match[1] in process.env)) process.env[match[1]] = match[2].trim();
  }
} catch { /* CI usa el entorno. */ }

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
// Estas pruebas crean y borran usuarios. Solo se ejecutan contra Supabase local.
if (!url || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) {
  throw new Error('La prueba de acceso requiere Supabase local.');
}
const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
const origin = 'http://localhost:3000';
const suffix = Math.random().toString(36).slice(2, 10);
const tenants: { id: string; slug: string; name: string; category: string }[] = [];
const users: { id: string; email: string }[] = [];
const uploads: string[] = [];
const organizations: string[] = [];

async function tenant(tag: string) {
  const slug = `aud-acceso-${tag}-${suffix}`;
  const name = `AUD Acceso ${tag} ${suffix}`;
  const { data, error } = await db.from('restaurants').insert({
    name, slug, status: 'active', plan_actual: 'PREMIUM', onboarding_done: true,
  }).select('id').single();
  if (error) throw error;
  const result = { id: data.id as string, slug, name, category: `AUD Categoria ${tag} ${suffix}` };
  tenants.push(result);
  const { error: themeError } = await db.from('restaurant_themes').insert({ restaurant_id: result.id, brand_name: name });
  if (themeError) throw themeError;
  const { data: category, error: categoryError } = await db.from('categories')
    .insert({ restaurant_id: result.id, name: result.category }).select('id').single();
  if (categoryError) throw categoryError;
  const { error: productError } = await db.from('products').insert({
    restaurant_id: result.id, category_id: category!.id, name: `Platillo ${name}`, price: 42,
  });
  if (productError) throw productError;
  return result;
}

async function user(tag: string, role = 'RESTAURANT_OWNER') {
  const email = `aud-acceso-${tag}-${suffix}@test.local`;
  const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true });
  if (error || !data.user) throw error ?? new Error('No se creó el usuario');
  const result = { id: data.user.id, email };
  users.push(result);
  const { error: profileError } = await db.from('profiles').upsert({
    id: result.id, role, restaurant_id: null, full_name: `AUD ${tag}`, permissions: null,
  });
  if (profileError) throw profileError;
  return result;
}

async function login(context: BrowserContext, email: string) {
  const { data, error } = await db.auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw error;
  const jar = new Map<string, string>();
  const session = createServerClient(url, anon, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: async (cookies) => {
        for (const { name, value } of cookies) jar.set(name, value);
        await context.addCookies(cookies.map(({ name, value }) => ({ name, value, url: origin })));
      },
    },
  });
  const { error: verifyError } = await session.auth.verifyOtp({ type: 'magiclink', token_hash: data.properties.hashed_token });
  if (verifyError) throw verifyError;
  await context.addInitScript(() => localStorage.setItem('leogin_tour_completed', 'true'));
  return session;
}

/** TOTP RFC 6238, solo para el factor efímero de la cuenta de prueba. */
function totp(secret: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...secret.toUpperCase()].map((c) => alphabet.indexOf(c).toString(2).padStart(5, '0')).join('');
  const key = Buffer.from(bits.match(/.{8}/g)!.map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const hash = createHmac('sha1', key).update(counter).digest();
  const offset = hash[hash.length - 1] & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

async function openCategories(page: Page, t: typeof tenants[number]) {
  // La primera activación del SW y la compilación en dev pueden abortar un goto.
  await expect(async () => {
    await page.goto(`${origin}/panel/${t.slug}/categorias`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(t.category, { exact: true })).toBeVisible({ timeout: 5_000 });
    await expect(page).toHaveURL(new RegExp(`/panel/${t.slug}/categorias`));
  }).toPass({ timeout: 60_000 });
  // Deja terminar la hidratación y las acciones iniciales antes de cambiar de local.
  await page.waitForLoadState('networkidle');
}

test.describe('Auditoría 0.12 — acceso por membresía', () => {
  test.setTimeout(180_000);
  let owner: typeof users[number];
  let restricted: typeof users[number];

  test.beforeAll(async () => {
    const a = await tenant('a');
    const b = await tenant('b');
    await tenant('ajeno');
    owner = await user('dueno');
    // Dueño en A, empleado restringido en B: el perfil global NO da permisos en B.
    restricted = await user('restringido');
    const { error } = await db.from('restaurant_members').insert([
      { user_id: owner.id, restaurant_id: a.id, role: 'OWNER', status: 'active' },
      { user_id: owner.id, restaurant_id: b.id, role: 'OWNER', status: 'active' },
      { user_id: restricted.id, restaurant_id: a.id, role: 'OWNER', status: 'active' },
      { user_id: restricted.id, restaurant_id: b.id, role: 'STAFF', permissions: ['pedidos'], status: 'active' },
    ]);
    if (error) throw error;
  });

  test.afterAll(async () => {
    if (uploads.length) {
      const { error } = await db.storage.from('restaurant-assets').remove(uploads);
      if (error) throw error;
    }
    for (const t of tenants) {
      const { error } = await db.from('restaurants').delete().eq('id', t.id);
      if (error) throw error;
    }
    for (const u of users) {
      const { error } = await db.auth.admin.deleteUser(u.id);
      if (error) throw error;
    }
    for (const id of organizations) {
      const { error } = await db.from('organizations').delete().eq('id', id);
      if (error) throw error;
    }
  });

  test('dueño sin restaurant_id abre A, cambia a B y vuelve a A sin mezclar datos', async ({ page, context }) => {
    await login(context, owner.email);
    await openCategories(page, tenants[0]);
    await openCategories(page, tenants[1]);
    await expect(page.getByText(tenants[0].category, { exact: true })).toHaveCount(0);
    await openCategories(page, tenants[0]);
    await expect(page.getByText(tenants[1].category, { exact: true })).toHaveCount(0);
    const { data } = await db.from('profiles').select('restaurant_id').eq('id', owner.id).single();
    expect(data?.restaurant_id).toBeNull();
  });

  test('una acción directa respeta los permisos de B aunque sea dueño en A', async ({ browser }) => {
    const allowed = await browser.newContext();
    const denied = await browser.newContext();
    try {
      await login(allowed, owner.email);
      await login(denied, restricted.email);
      const page = await allowed.newPage();
      await openCategories(page, tenants[1]);
      await expect(async () => {
        if (!(await page.locator('input[name="name"]').isVisible())) {
          await page.getByRole('button', { name: 'Nueva', exact: true }).click();
        }
        await expect(page.locator('input[name="name"]')).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 20_000 });
      await page.locator('input[name="name"]').fill(`AUD Creada ${suffix}`);
      const posted = page.waitForRequest((r) => r.method() === 'POST'
        && !!r.headers()['next-action'] && !!r.postData()?.includes(`AUD Creada ${suffix}`));
      await page.getByRole('button', { name: 'Crear', exact: true }).click();
      const request = await posted;
      await expect(page.getByText(`AUD Creada ${suffix}`, { exact: true })).toBeVisible();
      // Se reenvía la misma acción, sin visitar la pantalla y con la sesión restringida.
      const response = await denied.request.post(request.url(), {
        headers: { 'next-action': request.headers()['next-action'], 'content-type': request.headers()['content-type'], origin },
        data: request.postDataBuffer()!,
      });
      expect(await response.text()).toContain('No autorizado');
      const { count, error } = await db.from('categories').select('id', { count: 'exact', head: true })
        .eq('restaurant_id', tenants[1].id).eq('name', `AUD Creada ${suffix}`);
      expect(error).toBeNull();
      expect(count).toBe(1);
    } finally {
      await allowed.close();
      await denied.close();
    }
  });

  test('el catálogo se exporta por membresía y rechaza el local ajeno y al empleado restringido', async ({ page, context, browser }) => {
    await login(context, owner.email);
    await expect(async () => {
      await page.goto(`${origin}/panel/${tenants[1].slug}/menu`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByText(`Platillo ${tenants[1].name}`, { exact: true })).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 60_000 });
    await page.waitForLoadState('networkidle');
    let captured: BrowserResponse | null = null;
    const capture = async (response: BrowserResponse) => {
      if (response.request().headers()['next-action']
          && (await response.text().catch(() => '')).includes('"branding"')) captured = response;
    };
    page.on('response', capture);
    try {
      await expect(async () => {
        if (captured) return;
        const pdf = page.getByRole('menuitem', { name: /PDF para imprimir/ });
        if (!(await pdf.isVisible())) await page.getByRole('button', { name: 'Exportar', exact: true }).click();
        await pdf.click();
        await expect.poll(() => captured !== null, { timeout: 5_000 }).toBe(true);
      }).toPass({ timeout: 60_000 });
    } finally { page.off('response', capture); }
    const response = captured as BrowserResponse | null;
    if (!response) throw new Error('No se recibió el catálogo exportado');
    expect(await response.text()).toContain(`Platillo ${tenants[1].name}`);
    expect(await response.text()).not.toContain(`Platillo ${tenants[0].name}`);
    const request = response.request();
    const headers = { 'next-action': request.headers()['next-action'], 'content-type': request.headers()['content-type'], origin };
    const stranger = await context.request.post(request.url(), { headers, data: JSON.stringify([tenants[2].id]) });
    expect(await stranger.text()).toContain('No autorizado');
    const denied = await browser.newContext();
    try {
      await login(denied, restricted.email);
      const result = await denied.request.post(request.url(), { headers, data: request.postDataBuffer()! });
      expect(await result.text()).toContain('No autorizado');
    } finally { await denied.close(); }
  });

  test('RLS y almacenamiento aceptan membresías y cierran el restaurante ajeno', async ({ context, browser }) => {
    const session = await login(context, owner.email);
    const foreign = tenants[2];
    const { data: order, error } = await db.from('orders').insert({
      restaurant_id: foreign.id, order_number: `AUD-${suffix}`, customer_name: 'AUD Aislamiento',
      customer_phone: '00000000', order_type: 'PICKUP', payment_method: 'CASH', status: 'NEW', subtotal: 42, total: 42,
    }).select('id').single();
    expect(error).toBeNull();
    const read = await session.from('orders').select('id').eq('id', order!.id);
    expect(read.error).toBeNull(); expect(read.data).toEqual([]);
    const write = await session.from('orders').update({ customer_name: 'AUD Intruso' }).eq('id', order!.id).select('id');
    expect(write.error).toBeNull(); expect(write.data).toEqual([]);
    const stored = await db.from('orders').select('customer_name').eq('id', order!.id).single();
    expect(stored.data?.customer_name).toBe('AUD Aislamiento');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=', 'base64');
    const ownPath = `${tenants[1].id}/products/aud-${suffix}.png`;
    uploads.push(ownPath);
    const ownUpload = await session.storage.from('restaurant-assets').upload(ownPath, png, { contentType: 'image/png' });
    expect(ownUpload.error).toBeNull();
    const foreignPath = `${foreign.id}/products/aud-${suffix}.png`;
    uploads.push(foreignPath);
    const foreignUpload = await session.storage.from('restaurant-assets').upload(foreignPath, png, { contentType: 'image/png' });
    expect(foreignUpload.error).not.toBeNull();
    const restrictedContext = await browser.newContext();
    try {
      const employee = await login(restrictedContext, restricted.email);
      const deniedPath = `${tenants[1].id}/products/aud-staff-${suffix}.png`;
      uploads.push(deniedPath);
      const deniedUpload = await employee.storage.from('restaurant-assets').upload(deniedPath, png, { contentType: 'image/png' });
      expect(deniedUpload.error).not.toBeNull();
    } finally { await restrictedContext.close(); }
  });

  test('el superadmin no abre el panel ni lee datos hasta verificar un segundo factor real', async ({ page, context }) => {
    const superadmin = await user('superadmin', 'SUPER_ADMIN');
    const session = await login(context, superadmin.email);
    const before = await session.from('profiles').select('id').eq('id', superadmin.id);
    expect(before.error).toBeNull(); expect(before.data).toEqual([]);
    await page.goto(`${origin}/panel/${tenants[0].slug}/categorias`);
    await expect(page).toHaveURL(/\/admin\/dos-pasos\?next=/);
    await expect(page.getByRole('heading', { name: 'Activa la verificación en dos pasos' })).toBeVisible();
    const enrolled = await session.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'AUD E2E' });
    expect(enrolled.error).toBeNull();
    if (!enrolled.data || enrolled.data.type !== 'totp') throw new Error('Falta el factor TOTP');
    const verified = await session.auth.mfa.challengeAndVerify({ factorId: enrolled.data.id, code: totp(enrolled.data.totp.secret) });
    expect(verified.error).toBeNull();
    const after = await session.from('profiles').select('id').eq('id', superadmin.id);
    expect(after.error).toBeNull(); expect(after.data).toHaveLength(1);
    // La misma pantalla de MFA vuelve al destino pedido, sin elegir otra sucursal.
    await page.reload();
    await expect(page.getByText(tenants[0].category, { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(new RegExp(`/panel/${tenants[0].slug}/categorias`));
  });

  test('una sucursal ajena o inexistente explica el rechazo y conserva la sesión', async ({ page, context }) => {
    await login(context, owner.email);
    await page.goto(`${origin}/panel/${tenants[2].slug}/categorias`);
    await expect(page).toHaveURL(/\/mi-cuenta\?acceso=sin-permiso/);
    await expect(page.getByText('No tienes acceso a ese restaurante.', { exact: false })).toBeVisible();
    await expect(page.getByText(tenants[2].name, { exact: true })).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath('acceso-denegado.png'), fullPage: true });
    await expect(async () => {
      await page.goto(`${origin}/panel/aud-no-existe-${suffix}/categorias`, { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(/\/mi-cuenta\?acceso=no-disponible/);
      await expect(page.getByText('No pudimos abrir ese restaurante.', { exact: false })).toBeVisible();
    }).toPass({ timeout: 60_000 });
    await openCategories(page, tenants[0]);
    // Una sesión moderna también se reconoce en el acceso, sin copiar restaurant_id.
    await page.goto(`${origin}/panel/${tenants[0].slug}/login?next=${encodeURIComponent(`/panel/${tenants[0].slug}/categorias`)}`);
    await expect(page.getByRole('link', { name: /Continuar como/ })).toHaveAttribute('href', `/panel/${tenants[0].slug}/categorias`);
  });

  test('el dueño de grupo sin restaurant_id abre su sucursal y rechaza otro grupo', async ({ page, context }) => {
    const branch = await tenant('grupo');
    const groupOwner = await user('grupo');
    const { data: organization, error } = await db.from('organizations')
      .insert({ name: `AUD Grupo ${suffix}`, slug: `aud-grupo-${suffix}` }).select('id').single();
    if (error) throw error;
    organizations.push(organization!.id);
    const profile = await db.from('profiles').update({ organization_id: organization!.id }).eq('id', groupOwner.id);
    expect(profile.error).toBeNull();
    const restaurant = await db.from('restaurants').update({ organization_id: organization!.id }).eq('id', branch.id);
    expect(restaurant.error).toBeNull();
    await login(context, groupOwner.email);
    await openCategories(page, branch);
    await expect(async () => {
      await page.goto(`${origin}/panel/${tenants[2].slug}/categorias`, { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(/\/mi-cuenta\?acceso=sin-permiso/);
      await expect(page.getByText('No tienes acceso a ese restaurante.', { exact: false })).toBeVisible();
    }).toPass({ timeout: 60_000 });
  });

  test('cocina y mesero usan B aunque el perfil legado conserve A', async ({ page, context }) => {
    const legacy = await user('legado');
    const profile = await db.from('profiles').update({ restaurant_id: tenants[0].id }).eq('id', legacy.id);
    expect(profile.error).toBeNull();
    const membership = await db.from('restaurant_members').insert({
      user_id: legacy.id, restaurant_id: tenants[1].id, role: 'OWNER', status: 'active',
    });
    expect(membership.error).toBeNull();
    await login(context, legacy.email);
    for (const section of ['cocina', 'mesero']) {
      const requested: string[] = [];
      const capture = (request: import('@playwright/test').Request) => {
        if (request.method() === 'POST' && request.headers()['next-action']) requested.push(request.postData() ?? '');
      };
      page.on('request', capture);
      try {
        await page.goto(`${origin}/panel/${tenants[1].slug}/${section}`, { waitUntil: 'domcontentloaded' });
        await expect.poll(() => requested.some((body) => body.includes(tenants[1].id)), { timeout: 30_000 }).toBe(true);
        expect(requested.some((body) => body.includes(tenants[0].id))).toBe(false);
        await expect(page).toHaveURL(new RegExp(`/panel/${tenants[1].slug}/${section}`));
      } finally { page.off('request', capture); }
    }
  });
});
