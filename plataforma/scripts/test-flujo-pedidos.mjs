/**
 * Comprobación del flujo de pedidos contra la base LOCAL.
 *
 * Cubre los dos arreglos del 2026-08-01 y, sobre todo, sus supuestos de base
 * de datos (nombres de columna, filtros) — que es donde un error se cuela en
 * silencio y solo aparece cuando la cocina recibe dos papeles:
 *
 *   1. El pedido de mesero NACE en PREP ("ya enviado a cocina"), no en NEW.
 *      Es lo que hace que el panel ya no ofrezca "Confirmar" y, por tanto, que
 *      no exista un segundo disparo de la comanda.
 *   2. El candado anti-duplicado ve una comanda ya encolada de ese pedido
 *      (print_jobs con role='kitchen' y status pending/printing/done) y, en
 *      cambio, NO cuenta una que falló — esa nunca salió por la impresora y sí
 *      hay que reintentarla.
 *
 * Uso:  node scripts/test-flujo-pedidos.mjs
 * Crea sus propios datos y los borra al terminar.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(here, '..', '.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      if (!(k in process.env)) process.env[k] = t.slice(eq + 1).trim();
    }
  } catch { /* usa variables del sistema */ }
}
loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Falta NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local');
  process.exit(1);
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } });

let passed = 0;
let failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FALLA ${name}${extra ? ` — ${extra}` : ''}`); }
}

const cleanup = { orderIds: [], jobIds: [], productId: null };

async function main() {
  // ── Restaurante y producto de trabajo ──────────────────────────────────
  // El primer restaurante activo puede ser uno de prueba y estar vacío: se
  // busca el primero que SÍ tenga productos con los que armar un pedido.
  const { data: candidates } = await db
    .from('restaurants')
    .select('id, name, timezone')
    .eq('status', 'active')
    .limit(20);
  let rest = null;
  let prod = null;
  for (const r of candidates ?? []) {
    const { data: p } = await db
      .from('products')
      .select('id, name, price')
      .eq('restaurant_id', r.id)
      .limit(1)
      .maybeSingle();
    if (p) { rest = r; prod = p; break; }
  }
  if (!rest || !prod) throw new Error('Ningún restaurante activo de la base local tiene productos.');
  console.log(`\nRestaurante de prueba: ${rest.name} (tz ${rest.timezone ?? 'sin definir'})`);

  // ── 1. El pedido del mesero nace enviado a cocina ──────────────────────
  console.log('\n1. El pedido del mesero nace en PREP (ya enviado a cocina)');
  const clientId = crypto.randomUUID();
  const { data: placed, error: placeErr } = await db.rpc('place_order', {
    p_restaurant_id: rest.id,
    p_customer_name: 'Prueba flujo',
    p_customer_phone: '00000000',
    p_order_type: 'DINE_IN',
    p_address: 'Mesa 99',
    p_delivery_zone: null,
    p_delivery_lat: null,
    p_delivery_lng: null,
    p_customer_id: null,
    p_subtotal: Number(prod.price),
    p_delivery_fee: 0,
    p_total: Number(prod.price),
    p_notes: null,
    p_payment_method: 'CASH',
    p_cash_amount: null,
    p_tip: 0,
    p_client_id: clientId,
    p_items: [{
      product_id: prod.id,
      name_snapshot: prod.name,
      price_snapshot: Number(prod.price),
      cost_snapshot: null,
      quantity: 1,
      subtotal: Number(prod.price),
      options_snapshot: null,
    }],
  });
  if (placeErr) throw new Error(`place_order falló: ${placeErr.message}`);
  const orderId = placed.id;
  cleanup.orderIds.push(orderId);

  // Igual que createWaiterOrder tras crear el pedido.
  const firedAt = new Date().toISOString();
  const { error: upErr } = await db
    .from('orders')
    .update({ status: 'PREP', accepted_at: firedAt })
    .eq('id', orderId);
  check('el UPDATE a PREP + accepted_at se aplica', !upErr, upErr?.message);

  const { data: afterFire } = await db
    .from('orders').select('status, accepted_at').eq('id', orderId).single();
  check('queda en PREP (el panel ya no ofrece "Confirmar")', afterFire?.status === 'PREP', `status=${afterFire?.status}`);
  check('accepted_at queda sellado', !!afterFire?.accepted_at);

  // ── 2. Transición atómica: no se repite el efecto ──────────────────────
  console.log('\n2. La transición a PREP es atómica (dos clics = un solo disparo)');
  const { data: again } = await db
    .from('orders')
    .update({ status: 'PREP', accepted_at: new Date().toISOString() })
    .eq('id', orderId)
    .neq('status', 'PREP')
    .select('id');
  check('un segundo intento de pasar a PREP no afecta filas', (again?.length ?? 0) === 0, `filas=${again?.length}`);

  // ── 3. Candado anti-duplicado de la comanda ────────────────────────────
  console.log('\n3. Candado anti-duplicado de la comanda de cocina');
  const guard = async () => {
    const { data } = await db
      .from('print_jobs')
      .select('id')
      .eq('restaurant_id', rest.id)
      .eq('order_id', orderId)
      .eq('role', 'kitchen')
      .in('status', ['pending', 'printing', 'done'])
      .limit(1);
    return (data?.length ?? 0) > 0;
  };

  check('sin comandas encoladas, el candado deja pasar', (await guard()) === false);

  const { data: job, error: jobErr } = await db
    .from('print_jobs')
    .insert({
      restaurant_id: rest.id,
      role: 'kitchen',
      target: 'preview:test',
      payload_b64: Buffer.from('x').toString('base64'),
      status: 'pending',
      order_id: orderId,
    })
    .select('id')
    .single();
  if (jobErr) throw new Error(`No se pudo encolar el trabajo de prueba: ${jobErr.message}`);
  cleanup.jobIds.push(job.id);

  check('con la comanda encolada, el candado la detecta', (await guard()) === true);

  await db.from('print_jobs').update({ status: 'done' }).eq('id', job.id);
  check('una comanda ya impresa sigue contando', (await guard()) === true);

  await db.from('print_jobs').update({ status: 'failed' }).eq('id', job.id);
  check('una comanda FALLIDA no cuenta (hay que reintentarla)', (await guard()) === false);

  // ── 4. El recibo no comparte candado ───────────────────────────────────
  console.log('\n4. El recibo de caja sí se puede repetir');
  const { data: rjob } = await db
    .from('print_jobs')
    .insert({
      restaurant_id: rest.id, role: 'receipt', target: 'preview:test',
      payload_b64: Buffer.from('x').toString('base64'), status: 'done', order_id: orderId,
    })
    .select('id').single();
  if (rjob) cleanup.jobIds.push(rjob.id);
  check('un recibo impreso no bloquea la comanda de cocina', (await guard()) === false);
}

async function tidy() {
  for (const id of cleanup.jobIds) await db.from('print_jobs').delete().eq('id', id);
  for (const id of cleanup.orderIds) {
    await db.from('order_items').delete().eq('order_id', id);
    await db.from('orders').delete().eq('id', id);
  }
}

main()
  .then(async () => {
    await tidy();
    console.log(`\n${passed} comprobaciones ok, ${failed} fallidas.`);
    process.exit(failed === 0 ? 0 : 1);
  })
  .catch(async (e) => {
    await tidy().catch(() => {});
    console.error('\nError:', e.message);
    process.exit(1);
  });
