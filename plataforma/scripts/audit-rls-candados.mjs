/**
 * Auditoría de los candados de RLS (PLAN_ACCESO_Y_MONITOREO_2026-10-08, ACC-11).
 * ------------------------------------------------------------
 * El 2026-10-08 se encontró que cualquier sesión podía hacerse SUPER_ADMIN
 * editando su propio perfil (migración 003), que un dueño se subía el plan
 * solo y que varias tablas daban escritura a cualquier miembro. Se cerró en
 * las migraciones 136 y 137. Este script comprueba, contra la base real,
 * que esos candados SIGAN puestos — una migración nueva no puede volver a
 * abrirlos sin que la CI se ponga en rojo:
 *
 *   1. Toda tabla de `public` con RLS lleva la regla RESTRICTIVA
 *      `super_admin_segundo_factor` (137): el Super Admin solo ve datos con
 *      el segundo factor puesto. Una tabla NUEVA no la lleva sola.
 *   2. Los disparadores de columnas siguen ahí: `candado_perfil` (nadie se
 *      cambia su rol/restaurante/permisos) y `candado_columnas_restaurante`
 *      (nadie se cambia el plan/módulos/estado).
 *   3. Ninguna regla deja a una sesión normal crear o editar perfiles, ni
 *      tocar `staff_pins` (hashes de PIN).
 *   4. Las tablas que la 136 dejó en solo lectura no recuperan reglas de
 *      escritura.
 *
 * Uso:  node scripts/audit-rls-candados.mjs
 * Conexión: SUPABASE_DB_URL o el Supabase local (igual que audit-security-definer.mjs).
 * Sale con código 1 si encuentra algo.
 */
import { Client } from 'pg';
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

const LOCAL_DEFAULT = 'postgresql://postgres:postgres@127.0.0.1:54601/postgres';
const dbUrl = process.env.SUPABASE_DB_URL || LOCAL_DEFAULT;

/** Tablas que la 136 y la 139 dejaron en solo lectura para los miembros. */
const SOLO_LECTURA = [
  'restaurant_billing', 'restaurant_devices', 'api_keys', 'print_agents', 'activity_log', // 136
  'order_items', 'gift_cards', 'loyalty_accounts', 'loyalty_transactions', 'cash_counts', // 139
  'coupons', 'order_payments', 'table_splits',
  'customers', 'fel_documents', 'fel_settings', 'ingredients', 'invoices', 'loyalty_settings', // 140
  'order_ratings', 'page_visits', 'print_jobs', 'purchase_order_items', 'purchase_orders',
  'recipe_items', 'reservations', 'stock_movements', 'suppliers', 'table_sessions',
  'waiter_calls', 'waitlist_entries', 'restaurant_theme_templates',
];
/** Lo que el panel escribe con la sesión: solo con la sección (140). */
const CON_SECCION = ['products', 'categories', 'delivery_zones', 'restaurant_themes', 'restaurants'];
/** Inserciones públicas que la 139 quitó: nadie debe poder crear esto con la clave anon. */
const SIN_INSERCION_PUBLICA = ['orders', 'order_items', 'order_ratings', 'waiter_calls'];

async function main() {
  console.log(`\n🔎 Auditoría de candados de RLS  ·  ${dbUrl.replace(/:[^:@]*@/, ':****@')}\n`);
  const db = new Client({ connectionString: dbUrl });
  await db.connect();

  const hallazgos = [];

  // 1. La regla restrictiva del segundo factor en cada tabla con RLS.
  const { rows: sinCandado } = await db.query(`
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity
       and not exists (
         select 1 from pg_policy p
          where p.polrelid = c.oid
            and p.polname = 'super_admin_segundo_factor'
            and p.polpermissive = false
       )
     order by 1;
  `);
  for (const r of sinCandado) {
    hallazgos.push(`La tabla ${r.relname} no lleva la regla restrictiva super_admin_segundo_factor (vuelve a correr el bloque de la migración 137, es idempotente).`);
  }

  // 2. Los disparadores de columnas.
  const { rows: disparadores } = await db.query(`
    select c.relname, t.tgname
      from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where not t.tgisinternal and t.tgname in ('candado_perfil', 'candado_columnas_restaurante', 'candado_columnas_pedido');
  `);
  const hay = new Set(disparadores.map((d) => `${d.relname}.${d.tgname}`));
  for (const esperado of ['profiles.candado_perfil', 'restaurants.candado_columnas_restaurante', 'orders.candado_columnas_pedido']) {
    if (!hay.has(esperado)) hallazgos.push(`Falta el disparador ${esperado} (migraciones 136/139).`);
  }

  // Un pedido no se borra con la sesión (139): la regla restrictiva tiene que seguir.
  const { rows: noBorrar } = await db.query(`
    select 1 from pg_policy where polrelid = 'public.orders'::regclass
       and polname = 'pedidos_no_se_borran' and polpermissive = false;
  `);
  if (noBorrar.length === 0) hallazgos.push('Falta la regla restrictiva pedidos_no_se_borran en orders (migración 139).');

  // Permisos por sección (140): las tres reglas restrictivas en cada tabla.
  const { rows: secc } = await db.query(`
    select c.relname, count(*)::int as n
      from pg_policy p join pg_class c on c.oid = p.polrelid
     where c.relnamespace = 'public'::regnamespace and not p.polpermissive
       and p.polname in ('seccion_insert', 'seccion_update', 'seccion_delete')
     group by 1;
  `);
  const nSecc = new Map(secc.map((r) => [r.relname, r.n]));
  for (const t of CON_SECCION) {
    if (nSecc.get(t) !== 3) hallazgos.push(`${t} no tiene las 3 reglas seccion_* (migración 140): cualquier miembro podría escribirla.`);
  }

  // 3 y 4. Reglas de escritura que no deberían existir.
  const { rows: reglas } = await db.query(`
    select c.relname, p.polname, p.polcmd::text as cmd, p.polpermissive,
           (0 = any(p.polroles) or exists (select 1 from pg_roles r where r.oid = any(p.polroles) and r.rolname = 'anon')) as para_anon,
           coalesce(pg_get_expr(p.polwithcheck, p.polrelid), pg_get_expr(p.polqual, p.polrelid), '') as condicion
      from pg_policy p join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public';
  `);
  for (const r of reglas) {
    if (!r.polpermissive) continue;
    const escribe = ['a', 'w', 'd', '*'].includes(r.cmd);
    if (r.relname === 'staff_pins') {
      hallazgos.push(`staff_pins tiene la regla «${r.polname}»: los hashes de PIN solo se tocan con el cliente de servicio (migración 136).`);
    }
    if (r.relname === 'profiles' && escribe && !/super/i.test(r.polname)) {
      hallazgos.push(`profiles tiene la regla de escritura «${r.polname}»: una sesión normal no debe poder crear ni editar perfiles (SEC-01, migración 136).`);
    }
    if (SOLO_LECTURA.includes(r.relname) && escribe) {
      hallazgos.push(`${r.relname} volvió a tener la regla de escritura «${r.polname}»: quedó en solo lectura (migraciones 136/139).`);
    }
    // Abierta a anon Y sin pedir identidad (p. ej. `with check (true)`): una
    // regla «para public» que exige auth.uid() o membresía no la cumple un anónimo.
    const pideIdentidad = /auth\.uid|is_member_of|is_my_group_branch|get_my_/.test(r.condicion);
    if (SIN_INSERCION_PUBLICA.includes(r.relname) && r.para_anon && ['a', '*'].includes(r.cmd) && !pideIdentidad) {
      hallazgos.push(`${r.relname} volvió a aceptar inserciones públicas («${r.polname}»): eso se hace desde el servidor (migración 139).`);
    }
  }

  await db.end();

  console.log('────────────────────────────────────────');
  if (hallazgos.length === 0) {
    console.log('  Resultado: 0 hallazgos — candados de las migraciones 136, 137, 139 y 140 en su sitio.');
  } else {
    console.log(`  Resultado: ${hallazgos.length} hallazgo(s):`);
    for (const h of hallazgos) console.log(`   ✗ ${h}`);
  }
  console.log('────────────────────────────────────────\n');
  process.exit(hallazgos.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\n✗ Error ejecutando la auditoría:', e.message);
  process.exit(1);
});
