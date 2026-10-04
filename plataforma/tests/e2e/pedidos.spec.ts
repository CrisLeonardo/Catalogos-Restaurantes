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

/** El panel vive en el dominio raíz, en /panel/<slug>/… (PLAN_ORIGEN_UNICO.md). */
function panelUrl(slug: string, path = ''): string {
  return `http://${rootDomain}/panel/${slug}${path}`;
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
  // Primero el restaurante: arrastra sus pedidos y sus anulaciones. Al revés,
  // la anulación que hace la prueba (`order_voids.requested_by` apunta al
  // perfil del dueño, sin `on delete`) impedía borrar la cuenta y en local
  // se iban juntando dueños de prueba.
  try { await admin.from('restaurants').delete().eq('id', t.id); } catch { /* ya no existe */ }
  try { await admin.auth.admin.deleteUser(t.ownerId); } catch { /* ya no existe */ }
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
    // En CI corre contra `next dev`: cada pantalla se compila la primera vez
    // que se pide (menú, checkout, login, pedidos), y eso solo ya se comía
    // los 60 s por defecto.
    test.setTimeout(180_000);
    // El tour de bienvenida del panel se abre encima la primera vez y tapa
    // los botones: aquí se da por visto, como haría el dueño.
    await page.addInitScript(() => {
      try { localStorage.setItem('leogin_tour_completed', 'true'); } catch { /* sin almacenamiento */ }
    });
    await page.goto(tenantUrl(tenantA.slug, '/'));

    const verMenu = page.getByRole('button', { name: 'Ver el menú' });
    if (await verMenu.isVisible().catch(() => false)) {
      await verMenu.click();
    }

    // Primera visita a este restaurante en este navegador: puede aparecer el
    // aviso de lealtad con Google (una sola vez, ver google-loyalty-intro.tsx).
    // Tarda un round-trip a la BD (getMyAccount) en decidir si se muestra, así
    // que hay que ESPERARLO (no solo mirar si ya está visible en este instante)
    // — igual que un visitante real, que lo cerraría antes de seguir.
    const skipIntro = page.getByRole('button', { name: 'Ahora no' });
    await skipIntro.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
    if (await skipIntro.isVisible().catch(() => false)) {
      await skipIntro.click();
    }

    // Sin `exact`: el boton se llama "Agregar <producto> a tu pedido" —el
    // sufijo es de accesibilidad, para que quien navegue por lector de
    // pantalla oiga una frase y no un fragmento—. Este test pedia el nombre
    // exacto SIN ese sufijo y llevaba roto desde que se anadio, avisando de
    // una diferencia de texto y no de un fallo de verdad. El nombre del
    // producto ya lleva un sufijo aleatorio por corrida, asi que buscarlo
    // como subcadena sigue siendo inequivoco.
    //
    // Con `next dev` el primer toque puede llegar antes de que la carta
    // termine de hidratarse y perderse: entonces el checkout sale vacío y la
    // prueba fallaba lejos de la causa. Se toca hasta que aparezca la barra
    // del carrito (agregar dos veces no cambia nada de lo que se comprueba).
    const agregar = page.getByRole('button', { name: `Agregar ${tenantA.productName}` });
    await expect(async () => {
      await agregar.click();
      await expect(page.getByText('Ver carrito')).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 60_000 });
    await page.goto(tenantUrl(tenantA.slug, '/checkout'));

    await page.getByRole('button', { name: 'Para llevar' }).click();
    // «tú», no «vos», desde la auditoría 2026-10-02 (D-1).
    await page.getByPlaceholder('¿Cómo te llamas?').fill('Cliente de Prueba Playwright');
    await page.getByPlaceholder('5xxx xxxx').fill('55551234');
    await page.getByRole('button', { name: 'Confirmar pedido' }).click();

    // 60 s: con `next dev` la primera vez se compila la acción del pedido.
    await expect(page.getByText('¡Pedido enviado!')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('Número de pedido')).toBeVisible();

    const { data: orders, error: ordersErr } = await admin
      .from('orders')
      .select('id, status')
      .eq('restaurant_id', tenantA.id);
    expect(ordersErr).toBeNull();
    expect(orders?.length).toBe(1);
    expect(orders![0].status).toBe('NEW');
    const orderId = orders![0].id as string;

    await page.goto(panelUrl(tenantA.slug, '/login'));
    // En el subdominio de un restaurante el campo se llama "Correo o usuario":
    // ahí caben las dos credenciales, la del dueño y la del administrador que
    // el dueño da de alta (ver PLAN_ACCESO_MULTICUENTA.md §13).
    await page.getByLabel('Correo o usuario').fill(tenantA.ownerEmail);
    await page.getByLabel('Contraseña').fill(OWNER_PASSWORD);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    // Acepta las dos aterrizadas posibles: el dueño cae en Mi cuenta (es su
    // casa desde que se unificó el acceso multi-restaurante) y el personal
    // entra directo al panel. Lo que este paso comprueba es que el login
    // TERMINÓ, no a qué pantalla lleva; la navegación a /admin/pedidos que
    // viene justo debajo es explícita y no depende de esto.
    // Se espera a SALIR del login, no a una pantalla concreta: esperaba
    // /admin/menu o /admin/pedidos y el panel abre en Hoy desde agosto y vive
    // en /panel/<slug> desde el origen único — por eso llevaba roto desde
    // septiembre sin que fallara nada de verdad.
    await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 60_000 });
    // Al entrar, el panel quita el `?welcome=1` de la URL él solo: si se
    // navega a otra pantalla en ese instante, el navegador aborta el `goto`.
    await page.waitForURL((u) => !u.search.includes('welcome'), { timeout: 30_000 });
    await page.waitForLoadState('networkidle').catch(() => {});

    await page.goto(panelUrl(tenantA.slug, '/pedidos'), { waitUntil: 'domcontentloaded' });
    // La tarjeta compacta (auditoría 2026-10-02, PED-02) lleva «Anular
    // pedido» dentro de su menú «⋯», no como botón suelto.
    const masAcciones = page.getByRole('button', { name: /^Más acciones del pedido/ });
    await expect(masAcciones).toHaveCount(1, { timeout: 30_000 });
    await masAcciones.click();
    await page.getByRole('menuitem', { name: 'Anular pedido' }).click();

    // La señal de que el diálogo está abierto es su campo de motivo, no el
    // texto «Anular pedido»: ese lo lleva también el elemento del menú «⋯»,
    // que sigue en pantalla mientras se cierra (dos coincidencias).
    const reasonBox = page.getByPlaceholder('Ej. el cliente lo devolvió, error al tomar el pedido…');
    await expect(reasonBox).toBeVisible({ timeout: 10_000 });
    await reasonBox.fill('Prueba automatizada Playwright — cobertura mínima Fase 0');
    await page.getByRole('button', { name: 'Anular pedido completo' }).click();

    // Espera algo DEFINITIVO (no el label transitorio "Anulando…"): o el
    // diálogo se cierra de verdad (éxito), o queda un mensaje de error visible.
    const result = await Promise.race([
      reasonBox.waitFor({ state: 'hidden', timeout: 15_000 }).then(() => 'closed' as const),
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
