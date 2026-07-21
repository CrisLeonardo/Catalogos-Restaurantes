/**
 * Prueba de AISLAMIENTO MULTI-TENANT (Row Level Security).
 * ------------------------------------------------------------
 * Verifica el modelo de seguridad real de Leogin con dos negocios
 * temporales (A y B), iniciando sesión como el dueño A con la clave
 * ANÓNIMA (igual que el navegador) e intentando cruzar a los datos de B.
 *
 * Modelo esperado:
 *   • PÚBLICO por diseño (menú QR): productos/categorías ACTIVOS, ficha y
 *     tema del restaurante. Cualquiera los ve sin login — NO es fuga.
 *   • PRIVADO y aislado por tenant: pedidos, order_items, clientes,
 *     facturas, cobro, caja. El dueño A jamás debe verlos de B.
 *   • Los productos/categorías INACTIVOS (borradores ocultos) son privados.
 *   • Nadie puede ESCRIBIR en otro tenant.
 *
 * Uso:  node scripts/test-aislamiento.mjs
 * Lee las claves de .env.local (o del entorno). Limpia todo al terminar.
 * Sale con código 1 si encuentra una fuga.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8');
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
  console.error('✗ Falta NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const SUFFIX = Math.random().toString(36).slice(2, 8);
const PASS = 'TestIso12345';
let okN = 0, failN = 0;
const created = { users: [], restaurants: [] };

function check(name, ok, detail = '') {
  if (ok) { okN++; console.log(`  ✓ ${name}`); }
  else { failN++; console.log(`  ✗ FUGA: ${name}${detail ? ' — ' + detail : ''}`); }
}
function info(name) { console.log(`  · ${name} (público por diseño)`); }

async function makeTenant(tag) {
  const ins = async (table, row, sel = 'id') => {
    const q = admin.from(table).insert(row);
    const { data, error } = sel ? await q.select(sel).single() : await q;
    if (error) throw new Error(`insert ${table} (${tag}): ${error.message}`);
    return data;
  };
  const r = await ins('restaurants', { name: `Test ${tag.toUpperCase()} ${SUFFIX}`, slug: `test-iso-${tag}-${SUFFIX}`, status: 'active', plan_actual: 'PREMIUM' });
  created.restaurants.push(r.id);
  await ins('restaurant_themes', { restaurant_id: r.id, brand_name: `Test ${tag}` }, null);
  const cat = await ins('categories', { restaurant_id: r.id, name: `Cat ${tag}`, sort_order: 0, is_active: true });
  const prodActive = await ins('products', { restaurant_id: r.id, category_id: cat.id, name: `Activo ${tag}`, price: 99, is_active: true });
  const prodHidden = await ins('products', { restaurant_id: r.id, category_id: cat.id, name: `OCULTO secreto ${tag}`, price: 99, is_active: false });
  const ord = await ins('orders', { restaurant_id: r.id, order_number: `ORD-TEST-${tag}-${SUFFIX}`, customer_name: 'Cliente', customer_phone: '00000000', order_type: 'DELIVERY', payment_method: 'CASH', status: 'NEW', subtotal: 99, total: 99 });
  await ins('order_items', { order_id: ord.id, product_id: prodActive.id, name_snapshot: `Activo ${tag}`, price_snapshot: 99, quantity: 1, subtotal: 99 }, null);
  const cust = await ins('customers', { restaurant_id: r.id, name: `Cliente privado ${tag}`, phone: `5550-${tag}-${SUFFIX}` });
  const inv = await ins('invoices', { restaurant_id: r.id, concept: 'MONTHLY', amount: 600, status: 'PENDING', period: '2026-06-01' });

  const email = `owner-${tag}-${SUFFIX}@test.local`;
  const { data: u, error: uErr } = await admin.auth.admin.createUser({ email, password: PASS, email_confirm: true });
  if (uErr) throw new Error(`crear dueño ${tag}: ${uErr.message}`);
  created.users.push(u.user.id);
  await admin.from('profiles').upsert({ id: u.user.id, restaurant_id: r.id, role: 'RESTAURANT_OWNER', full_name: `Dueño ${tag}` });

  return { id: r.id, email, categoryId: cat.id, prodActive: prodActive.id, prodHidden: prodHidden.id, orderId: ord.id, customerId: cust.id, invoiceId: inv.id };
}

async function cleanup() {
  for (const id of created.users) { try { await admin.auth.admin.deleteUser(id); } catch {} }
  for (const id of created.restaurants) { try { await admin.from('restaurants').delete().eq('id', id); } catch {} }
}

async function rows(client, table, col, val) {
  const { data } = await client.from(table).select('*').eq(col, val);
  return data?.length ?? 0;
}

async function main() {
  console.log(`\n🔒 Prueba de aislamiento multi-tenant (RLS)  ·  suffix=${SUFFIX}\n`);
  const A = await makeTenant('a');
  const B = await makeTenant('b');

  const asA = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: signErr } = await asA.auth.signInWithPassword({ email: A.email, password: PASS });
  if (signErr) throw new Error(`login dueño A: ${signErr.message}`);

  console.log('── Control positivo: el dueño A SÍ ve lo suyo ──');
  check('A ve sus productos', (await rows(asA, 'products', 'restaurant_id', A.id)) >= 1);
  check('A ve sus pedidos', (await rows(asA, 'orders', 'restaurant_id', A.id)) >= 1);

  console.log('\n── Datos PRIVADOS de B: A no debe ver NADA (0 filas) ──');
  check('A no ve pedidos de B', (await rows(asA, 'orders', 'restaurant_id', B.id)) === 0);
  check('A no ve order_items de B', (await rows(asA, 'order_items', 'order_id', B.orderId)) === 0);
  check('A no ve clientes de B', (await rows(asA, 'customers', 'restaurant_id', B.id)) === 0);
  check('A no ve facturas/cobros de B', (await rows(asA, 'invoices', 'restaurant_id', B.id)) === 0);
  {
    const { data } = await asA.from('products').select('id').eq('id', B.prodHidden);
    check('A no ve los productos OCULTOS (inactivos) de B', (data?.length ?? 0) === 0, `vio ${data?.length}`);
  }
  {
    // "Tráeme TODOS los pedidos" sin filtro: RLS solo debe devolver los de A.
    const { data } = await asA.from('orders').select('restaurant_id');
    const otros = (data ?? []).filter((o) => o.restaurant_id !== A.id);
    check('SELECT pedidos sin filtro solo devuelve los de A', otros.length === 0, `${otros.length} de otros`);
  }

  console.log('\n── Menú PÚBLICO de B: visible a propósito (no es fuga) ──');
  info(`A ve el producto ACTIVO de B (${(await rows(asA, 'products', 'id', B.prodActive))} fila)`);
  info(`A ve la ficha activa de B (${(await rows(asA, 'restaurants', 'id', B.id))} fila)`);

  console.log('\n── Escritura cruzada: A NO debe poder tocar B ──');
  {
    const { data } = await asA.from('products').update({ name: 'HACKEADO' }).eq('id', B.prodActive).select('id');
    check('A no puede editar un producto de B', (data?.length ?? 0) === 0, `editó ${data?.length}`);
  }
  {
    const { data } = await asA.from('products').delete().eq('id', B.prodActive).select('id');
    check('A no puede borrar un producto de B', (data?.length ?? 0) === 0, `borró ${data?.length}`);
  }
  {
    const { error } = await asA.from('products').insert({ restaurant_id: B.id, name: 'Inyectado por A', price: 1 });
    check('A no puede insertar productos en B', !!error, error ? '' : 'el insert pasó (¡mal!)');
  }
  {
    const { data } = await asA.from('orders').update({ status: 'CANCEL' }).eq('id', B.orderId).select('id');
    check('A no puede cambiar el estado de un pedido de B', (data?.length ?? 0) === 0, `cambió ${data?.length}`);
  }
  {
    const { data } = await admin.from('products').select('name').eq('id', B.prodActive).single();
    check('El producto de B sigue intacto en la BD', !!data?.name?.includes('Activo'), `name="${data?.name}"`);
  }

  await asA.auth.signOut();
}

try {
  await main();
} catch (e) {
  console.error('\n✗ Error ejecutando la prueba:', e.message);
  failN++;
} finally {
  await cleanup();
  console.log('\n────────────────────────────────────────');
  console.log(`  Resultado: ${okN} OK · ${failN} fuga(s)`);
  console.log('  (datos temporales eliminados)');
  console.log('────────────────────────────────────────\n');
  process.exit(failN === 0 ? 0 : 1);
}
