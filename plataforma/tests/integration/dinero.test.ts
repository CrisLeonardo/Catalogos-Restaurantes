/** Integración 0.13. Dinero, consultas, restricciones y transacciones reales.
 * Se sustituyen sesión de Next y efectos externos; NO las acciones monetarias,
 * la aritmética, PostgREST ni las respuestas de Postgres. No certifica RLS/UI. */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  db, sql, state, actor, currentActor, cajaContext, checked, createRestaurant,
  order, ledger, net, controlledFetch, deferred, bounded, waitForBlockedPayment,
} from './dinero-fixtures';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ headers: async () => new Headers(), cookies: vi.fn() }));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(), revalidateTag: vi.fn(), updateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/lib/auth/table-access', () => ({
  assertTableAccess: async (restaurantId: string) => {
    cajaContext(restaurantId);
    return { actor: { userId: currentActor() } };
  },
}));
vi.mock('@/lib/caja/acceso', () => ({
  authRestaurant: async (id: string) => cajaContext(id),
  firmar: async () => ({ id: currentActor() }),
}));
vi.mock('@/lib/activity', () => ({ logActivity: vi.fn(async () => {}) }));
vi.mock('@/lib/salon-cache', () => ({ revalidarSalon: vi.fn() }));
vi.mock('@/lib/push', () => ({ sendPushToRestaurant: vi.fn(async () => {}) }));
vi.mock('@/lib/db/momentos', () => ({ getTuDia: vi.fn(async () => null) }));
vi.mock('@/lib/print-agent', () => ({
  enqueueKitchenForOrder: vi.fn(), enqueueReceiptForOrder: vi.fn(), enqueueSplitBillTicket: vi.fn(),
}));
vi.mock('@/lib/actions/fel', () => ({ emitirFacturaAutomatica: vi.fn() }));
vi.mock('@/lib/actions/loyalty', () => ({ awardLoyaltyForOrder: vi.fn(), maybeAwardSignupBonus: vi.fn() }));
vi.mock('@/lib/whatsapp/notify', () => ({ notifyOrderStatus: vi.fn() }));

import { cobrarParteDeMesa, cobradoDeMesa } from '@/lib/actions/servicio';
import { freeTable } from '@/lib/actions/orders';
import { abrirTurno, closeCaja } from '@/lib/actions/finanzas';
import { devolverCobro } from '@/lib/actions/caja-correcciones';
import { leerTurno } from '@/lib/caja/turno-servidor';
import { computeSplit } from '@/lib/bill-split';
import type { OrderWithItems } from '@/lib/db/orders';

const rid = () => state.restaurantId;
const period = async (ahora?: Date) => {
  // Windows y el contenedor local pueden diferir unos milisegundos. Leer el
  // reloj real de Postgres evita excluir un commit recién confirmado como
  // si fuera futuro. D09 conserva sus instantes explícitos y D08 su carrera.
  ahora ??= (await sql.query('select clock_timestamp() as ahora')).rows[0].ahora;
  return leerTurno(db, { restaurantId: rid(), timezone: 'America/Guatemala', corteMin: 300, ahora });
};
const pay = (ids: string[], amount: number, method = 'CASH', id: string = randomUUID()) => cobrarParteDeMesa(rid(), 1, ids, [{ amount, method: method as 'CASH' | 'CARD' }], id);
function success(result: { error?: string }) { expect(result.error).toBeUndefined(); }

beforeAll(async () => {
  await sql.connect();
  const probe = randomUUID();
  for (let i = 0; i < 2; i++) {
    const created = await db.auth.admin.createUser({ email: `aud-dinero-${probe}-${i}@test.local`, email_confirm: true });
    if (created.error) throw created.error;
    const id = created.data.user!.id;
    state.users.push(id);
    checked(await db.from('profiles').upsert({ id, role: 'RESTAURANT_STAFF', full_name: `AUD Caja ${i}` }));
  }
  vi.stubGlobal('fetch', controlledFetch);
});

beforeEach(async () => { await createRestaurant(); });
afterEach(async () => {
  state.beforeFetch = state.afterFetch = null;
  await sql.query('rollback');
  if (state.restaurantId) {
    checked(await db.from('restaurants').delete().eq('id', state.restaurantId));
    const remaining = checked(await db.from('restaurants').select('id').eq('id', state.restaurantId));
    expect(remaining).toEqual([]);
  }
  state.restaurantId = '';
});
afterAll(async () => {
  vi.unstubAllGlobals();
  const errors: Error[] = [];
  for (const id of state.users) {
    const removed = await db.auth.admin.deleteUser(id);
    if (removed.error) errors.push(removed.error);
  }
  await sql.end();
  if (errors.length) throw new AggregateError(errors, 'No se completó la limpieza de usuarios AUD.');
});

describe('M§8 · circuito del dinero en Postgres', () => {
  it('D01 · Q100 entre tres: tres cobros independientes conservan 33.34 + 33.33 + 33.33', async () => {
    const o = await order([100]);
    const split = computeSplit({ orders: [o as OrderWithItems], mode: 'equal', peopleIds: ['a', 'b', 'c'], assignment: {} });
    expect(split.people.map((p) => p.total)).toEqual([33.34, 33.33, 33.33]);
    for (const p of split.people) success(await pay([o.items[0].id], p.total));
    const rows = await ledger(o.id);
    expect(rows.map((p) => Number(p.amount))).toEqual([33.34, 33.33, 33.33]);
    expect(net(rows)).toBe(10000);
    expect((await period()).cuadre.efectivo).toBe(100);
    expect((await cobradoDeMesa(rid(), 1)).total).toBe(100);
  });

  it('D02 · Q200: tarjeta 80, efectivo 50 y tarjeta 70 se reconcilian con caja', async () => {
    const o = await order([200]);
    success(await freeTable(rid(), 1, [{ method: 'CARD', amount: 80 }, { method: 'CASH', amount: 50 }, { method: 'CARD', amount: 70 }], randomUUID()));
    const rows = await ledger(o.id);
    // Un INSERT por lote comparte timestamp; SQL no promete orden entre empates.
    expect(rows.map((p) => [p.method, Number(p.amount)]).sort()).toEqual([['CARD', 70], ['CARD', 80], ['CASH', 50]]);
    expect(net(rows)).toBe(20000);
    const l = await period();
    expect(l.cuadre.porMetodo).toEqual({ CARD: 150, CASH: 50 });
    expect(l.pendientes.total).toBe(0);
    expect(checked(await db.from('orders').select('status').eq('id', o.id).single())?.status).toBe('DELIVERED');
  });

  it('D03 · dos empleados cobran el mismo saldo parcial una sola vez', async () => {
    const o = await order([10]);
    const gate = deferred();
    let readers = 0;
    state.beforeFetch = async (url, method) => {
      if (method === 'POST' && url.pathname.endsWith('/rpc/leogin_cobrar_parte_mesa_idempotente')) {
        if (++readers === 2) gate.resolve();
        await bounded(gate.promise);
      }
    };
    const results = await Promise.all([actor(0, () => pay([o.items[0].id], 10)), actor(1, () => pay([o.items[0].id], 10))]);
    state.beforeFetch = null;
    expect(readers).toBe(2);
    const rows = await ledger(o.id);
    expect(rows.every((p) => state.users.includes(p.taken_by))).toBe(true);
    expect(results.some((r) => !r.error)).toBe(true);
    expect(net(rows), 'Dos peticiones no pueden cobrar Q20 por un consumo de Q10').toBe(1000);
  });

  it('D04 · recupera el resultado original al perder la respuesta después del commit', async () => {
    const o = await order([10]);
    const intentoId = randomUUID();
    const cobrar = () => cobrarParteDeMesa(rid(), 1, [o.items[0].id], [{ method: 'CASH', amount: 10 }], intentoId);
    let original: unknown;
    state.afterFetch = async (url, method, response) => {
      if (!original && method === 'POST' && url.pathname.includes('/rpc/leogin_cobrar_parte_mesa')) {
        expect(response.ok).toBe(true);
        original = await response.clone().json();
        throw new TypeError('AUD: acuse perdido después del commit');
      }
    };
    const perdido = await cobrar();
    state.afterFetch = null;
    expect(perdido.error).toBeDefined();
    expect(original).toBeDefined();
    const filasOriginales = await ledger(o.id);
    const recuperado = await cobrar();
    success(recuperado);
    expect(recuperado).toEqual(original);
    expect(recuperado).toMatchObject({ intentoId, cobrado: 10, paymentIds: filasOriginales.map((p) => p.id) });
    expect(await ledger(o.id)).toEqual(filasOriginales);
    expect(net(await ledger(o.id))).toBe(1000);
  });

  it('D05 · pago parcial, nueva ronda y cierre conservan lo cobrado y solo cobran el saldo', async () => {
    const first = await order([40, 60]);
    success(await pay([first.items[0].id], 40));
    const second = await order([20]);
    const before = await cobradoDeMesa(rid(), 1);
    expect(before.total).toBe(40);
    expect((await period()).pendientes.total).toBe(80);
    success(await freeTable(rid(), 1, { method: 'CARD', amount: 80 }, randomUUID()));
    const rows = await ledger();
    expect(net(rows), 'Consumo Q120, previo Q40, saldo Q80').toBe(12000);
    expect.soft(net(rows.filter((r) => r.order_id === first.id)), 'Primer pedido: Q100, no Q120').toBe(10000);
    expect.soft(net(rows.filter((r) => r.order_id === second.id)), 'La ronda nueva debe conservar sus Q20 cobrados').toBe(2000);
    expect((await period()).pendientes.total).toBe(0);
  });

  it('D06 · devolución de otro turno conserva el corte previo y sale en el actual', async () => {
    const now = new Date();
    const previous = new Date(now.getTime() - 3_600_000).toISOString();
    const boundary = new Date(now.getTime() - 1_800_000).toISOString();
    const o = await order([50], { at: previous });
    checked(await db.from('orders').update({ status: 'DELIVERED', delivered_at: previous }).eq('id', o.id));
    checked(await db.from('order_payments').insert({ restaurant_id: rid(), order_id: o.id, method: 'CASH', amount: 50, created_at: previous }));
    const prior = checked(await db.from('cash_counts').insert({ restaurant_id: rid(), business_date: '2026-11-05', status: 'CLOSED',
      period_start: previous, closed_at: boundary, expected_cash: 50, counted_cash: 50, by_method: { CASH: 50 } }).select('*').single());
    success(await devolverCobro({ restaurantId: rid(), orderId: o.id, reason: 'AUD devolución de turno previo' }));
    const rows = await ledger(o.id);
    expect(rows.map((p) => [p.kind, Number(p.amount)])).toEqual([['PAYMENT', 50], ['REFUND', -50]]);
    expect(rows[1].approved_by).toBe(state.users[0]);
    expect(rows[1].reason).toContain('turno previo');
    expect((await period()).cuadre).toMatchObject({ efectivo: -50, devoluciones: 50, devolucionesEfectivo: 50 });
    expect(checked(await db.from('cash_counts').select('*').eq('id', prior.id).single())).toEqual(prior);
  });

  it('D07 · descuento Q10 y propina Q20 sobre Q90 se reparten sin perder un centavo', async () => {
    const o = await order([30, 30, 30], { total: 100, discount: 10, tip: 20 });
    const split = computeSplit({ orders: [o as OrderWithItems], mode: 'equal', peopleIds: ['a', 'b', 'c'], assignment: {} });
    expect(split.people.map((p) => p.total)).toEqual([33.34, 33.33, 33.33]);
    for (let i = 0; i < 3; i++) success(await pay([o.items[i].id], split.people[i].total));
    expect(net(await ledger(o.id)), 'El reparto persistido debe coincidir con el total exacto de la cuenta').toBe(10000);
    expect((await period()).pendientes.total).toBe(0);
  });

  it('D08 · un cobro en tránsito mientras se cierra pertenece a exactamente un turno', async () => {
    const o = await order([10]);
    success(await abrirTurno({ restaurantId: rid(), openingFloat: 0 }));
    await sql.query('begin');
    const lock = await sql.query('select pg_backend_pid() as pid, id from public.orders where id=$1 for update', [o.id]);
    const pending = pay([o.items[0].id], 10);
    let close: Awaited<ReturnType<typeof closeCaja>>;
    try {
      await waitForBlockedPayment(lock.rows[0].pid);
      // La 0.10 exige confirmar explícitamente Q0; también se envía al
      // ejecutarla desde la base anterior, que todavía ignora este campo.
      const payload = { restaurantId: rid(), counts: {}, openingFloat: 0, confirmPending: true, efectivoContado: true };
      close = await closeCaja(payload);
      success(close);
      expect(close.result).toBeDefined();
    } finally {
      await sql.query('rollback');
      success(await pending);
    }
    const rows = await ledger(o.id);
    expect(net(rows)).toBe(1000);
    expect(new Date(rows[0].created_at).getTime()).toBeLessThanOrEqual(new Date(close!.result!.closedAt).getTime());
    const next = await period();
    expect(Math.round(((close!.result?.expected ?? 0) + next.cuadre.efectivo) * 100),
      'Ningún pago confirmado puede quedar fuera de ambos periodos').toBe(1000);
  });

  it('D09 · a las 05:00 Guatemala, caja y reporte incluyen el mismo lado del límite', async () => {
    const before = '2026-11-05T10:59:59.999Z';
    const at = '2026-11-05T11:00:00.000Z';
    const after = '2026-11-05T11:00:00.001Z';
    for (const [index, time] of [before, at, after].entries()) {
      const o = await order([index + 1], { at: time, table: index + 1 });
      checked(await db.from('order_payments').insert({ restaurant_id: rid(), order_id: o.id, amount: index + 1, method: 'CASH', created_at: time }));
    }
    const oldDay = await period(new Date(before));
    const newDay = await period(new Date('2026-11-05T12:00:00Z'));
    expect(oldDay.dia).toBe('2026-11-04');
    expect(newDay.dia).toBe('2026-11-05');
    expect(oldDay.cuadre.efectivo).toBe(1);
    const report = checked(await db.rpc('leogin_sales_report', { p_restaurant_id: rid(), p_from: '2026-11-05', p_to: '2026-11-05', p_timezone: 'America/Guatemala', p_cutoff_minutes: 300 }));
    expect(Number(report.revenue)).toBe(5);
    expect(newDay.cuadre.efectivo, 'El movimiento exactamente a las 05:00 debe contarse una vez, igual que en SQL').toBe(5);
  });
});

describe('0.14 · garantías del cobro transaccional', () => {
  it('no cobra dos veces una línea aunque el pedido tenga otros platos pendientes', async () => {
    const o = await order([10, 10]);
    const results = await Promise.all([actor(0, () => pay([o.items[0].id], 10)), actor(1, () => pay([o.items[0].id], 10))]);
    expect(results.filter((r) => !r.error)).toHaveLength(1);
    expect(net(await ledger(o.id))).toBe(1000);
    expect((await period()).pendientes.total).toBe(10);
    expect((await cobradoDeMesa(rid(), 1)).lineasPagadas).toEqual([o.items[0].id]);
  });

  it('dos platos distintos se cobran sin perder asignaciones entre empleados', async () => {
    const o = await order([10, 10]);
    const results = await Promise.all([actor(0, () => pay([o.items[0].id], 10)), actor(1, () => pay([o.items[1].id], 10))]);
    results.forEach(success);
    const rows = await ledger(o.id);
    expect(net(rows)).toBe(2000);
    expect(new Set(rows.map((p) => p.taken_by))).toEqual(new Set(state.users));
    expect((await cobradoDeMesa(rid(), 1)).lineasPagadas?.sort()).toEqual(o.items.map((i: { id: string }) => i.id).sort());
  });

  it('un pago inferior a la línea no la presenta como saldada hasta completarla', async () => {
    const o = await order([100, 20]);
    success(await pay([o.items[0].id], 40));
    expect((await cobradoDeMesa(rid(), 1)).lineasPagadas).toEqual([]);
    success(await pay([o.items[0].id], 60));
    expect((await cobradoDeMesa(rid(), 1)).lineasPagadas).toEqual([o.items[0].id]);
    expect((await pay([o.items[0].id], 20)).error).toMatch(/pagados/);
    expect(net(await ledger(o.id))).toBe(10000);
  });

  it('un fallo al guardar el reparto revierte el dinero del mismo intento', async () => {
    const o = await order([10]);
    const people = Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, name: `AUD ${i}` }));
    const split = checked(await db.from('table_splits').insert({ restaurant_id: rid(), table_number: 1,
      mode: 'byItem', people, assignment: {}, paid: [] }).select('*').single());
    expect((await pay([o.items[0].id], 10)).error).toMatch(/30 partes/);
    expect(await ledger(o.id)).toEqual([]);
    expect(checked(await db.from('table_splits').select('*').eq('restaurant_id', rid()).single())).toEqual(split);
  });

  it('reparte métodos entre pedidos sin reutilizar importes ni efectivo recibido', async () => {
    const a = await order([40]);
    const b = await order([60]);
    success(await cobrarParteDeMesa(rid(), 1, [a.items[0].id, b.items[0].id], [
      { method: 'CARD', amount: 50 }, { method: 'CASH', amount: 50, cashReceived: 100 },
    ], randomUUID()));
    const rows = await ledger();
    expect(net(rows.filter((p) => p.order_id === a.id))).toBe(4000);
    expect(net(rows.filter((p) => p.order_id === b.id))).toBe(6000);
    expect(rows.reduce((n, p) => n + Number(p.cash_received ?? 0), 0)).toBe(100);
    expect(rows.reduce((n, p) => n + Object.values(p.item_amounts).reduce<number>((a, b) => a + Number(b), 0), 0)).toBe(100);
    expect((await period()).cuadre.porMetodo).toEqual({ CARD: 50, CASH: 50 });
  });

  it('conserva un pago legado cuya asignación sigue verificable', async () => {
    const o = await order([40, 60]);
    const old = checked(await db.from('order_payments').insert({ restaurant_id: rid(), order_id: o.id, method: 'CASH', amount: 40 }).select('*').single());
    checked(await db.from('table_splits').insert({ restaurant_id: rid(), table_number: 1, mode: 'byItem',
      people: [{ id: 'old', name: 'AUD previo' }], assignment: { [o.items[0].id]: ['old'] }, paid: ['old'] }));
    success(await pay([o.items[1].id], 60, 'CARD'));
    expect(checked(await db.from('order_payments').select('*').eq('id', old!.id).single())).toEqual(old);
    expect(net(await ledger(o.id))).toBe(10000);
    expect((await cobradoDeMesa(rid(), 1)).lineasPagadas?.sort()).toEqual(o.items.map((i: { id: string }) => i.id).sort());
  });

  it('no inventa la asignación de un cobro antiguo sin su reparto', async () => {
    const o = await order([40, 60]);
    checked(await db.from('order_payments').insert({ restaurant_id: rid(), order_id: o.id, method: 'CASH', amount: 40 }));
    expect((await pay([o.items[1].id], 60)).error).toMatch(/sin asignación verificable/);
    expect(net(await ledger(o.id))).toBe(4000);
  });

  it('rechaza mezclar platos de otra mesa sin escribir un pago parcial', async () => {
    const a = await order([10]);
    const b = await order([10], { table: 2 });
    expect((await pay([a.items[0].id, b.items[0].id], 20)).error).toMatch(/cambiaron de mesa/);
    expect(await ledger()).toEqual([]);
  });

  it('cobro parcial y cierre simultáneos conservan un resultado válido sin sobrecobro', async () => {
    const o = await order([10, 10]);
    await sql.query('begin');
    const lock = await sql.query("select pg_backend_pid() pid, pg_advisory_xact_lock(hashtextextended('cobro/' || $1 || '/1',0))", [rid()]);
    const partial = actor(0, () => pay([o.items[0].id], 10));
    const close = actor(1, () => freeTable(rid(), 1, { method: 'CARD', amount: 20 }, randomUUID()));
    let results;
    try {
      await waitForBlockedPayment(lock.rows[0].pid, 2);
    } finally {
      await sql.query('rollback');
      results = await Promise.all([partial, close]);
    }
    expect(results.filter((r) => !r.error)).toHaveLength(1);
    const rows = await ledger(o.id);
    const status = checked(await db.from('orders').select('status').eq('id', o.id).single())?.status;
    if (status === 'DELIVERED') expect(net(rows)).toBe(2000);
    else { expect(status).toBe('SERVED'); expect(net(rows)).toBe(1000); }
  });

  it('rechaza un cierre desactualizado sin entregar pedidos ni añadir movimientos', async () => {
    const o = await order([10, 10]);
    success(await pay([o.items[0].id], 10));
    expect((await freeTable(rid(), 1, { method: 'CARD', amount: 20 }, randomUUID())).error).toMatch(/No se cerró la mesa/);
    expect(net(await ledger(o.id))).toBe(1000);
    expect(checked(await db.from('orders').select('status').eq('id', o.id).single())?.status).toBe('SERVED');
    // Con un saldo actualizado, un solo pedido se cierra sin repetir el pago.
    success(await freeTable(rid(), 1, { method: 'CARD', amount: 10 }, randomUUID()));
    expect(net(await ledger(o.id))).toBe(2000);
  });

  it('los RPC monetarios solo son ejecutables por el servicio autorizado', async () => {
    const { rows } = await sql.query("select proname, has_function_privilege('anon',oid,'execute') anon, has_function_privilege('authenticated',oid,'execute') auth, has_function_privilege('service_role',oid,'execute') service from pg_proc where proname in ('leogin_cobrar_parte_mesa','leogin_confirmar_cierre_mesa','leogin_bloquear_cuenta_mesa')");
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row).toMatchObject({ anon: false, auth: false, service: true });
  });
});

describe('0.15 · identidad durable del intento', () => {
  it('una identidad queda acotada al restaurante y no recupera el recibo de otro local', async () => {
    const id = randomUUID();
    const o = await order([10]);
    const original = await pay([o.items[0].id], 10, 'CASH', id);
    success(original);
    const other = checked(await db.from('restaurants').insert({ name: 'AUD Dinero otro', slug: `aud-dinero-${randomUUID()}`, status: 'active' }).select('id').single())!;
    try {
      // Acceso de servicio para consultar otro fixture, nunca otro local real.
      const found = checked(await db.rpc('leogin_recuperar_intento_cobro', {
        p_restaurant: other.id, p_mesa: 1, p_intento: id, p_operacion: 'parte',
        p_solicitud: { items: [o.items[0].id], pagos: [{ method: 'CASH', amount: 10 }] }, p_actor: state.users[0],
      }));
      expect(found).toBeNull();
      expect(await pay([o.items[0].id], 10, 'CASH', id)).toEqual(original);
    } finally { checked(await db.from('restaurants').delete().eq('id', other.id)); }
  });

  it('dos peticiones del mismo intento parcial devuelven exactamente un resultado', async () => {
    const o = await order([100]);
    const id = randomUUID();
    const results = await Promise.all([pay([o.items[0].id], 40, 'CASH', id), pay([o.items[0].id], 40, 'CASH', id)]);
    results.forEach(success);
    expect(results[0]).toEqual(results[1]);
    expect(await ledger(o.id)).toHaveLength(1);
    expect(net(await ledger(o.id))).toBe(4000);
    expect(checked(await db.from('cobro_intentos').select('*').eq('restaurant_id', rid()))).toHaveLength(1);
  });

  it('otra identidad permite un pago idéntico legítimo hasta el saldo disponible', async () => {
    const o = await order([100]);
    const original = await pay([o.items[0].id], 40);
    success(original);
    const second = await pay([o.items[0].id], 40);
    success(second);
    expect(second.paymentIds).not.toEqual(original.paymentIds);
    expect((await pay([o.items[0].id], 40)).error).toMatch(/saldo cambió/);
    success(await pay([o.items[0].id], 20));
    const rows = await ledger(o.id);
    expect(net(rows)).toBe(10000);
    expect(rows).toHaveLength(3);
    expect(await pay([o.items[0].id], 40, 'CASH', original.intentoId)).toEqual(original);
    expect(await ledger(o.id)).toEqual(rows);
  });

  it('no reutiliza la identidad con otro importe, método, línea, mesa, operación o empleado', async () => {
    const o = await order([100, 100]);
    const id = randomUUID();
    success(await pay([o.items[0].id], 40, 'CASH', id));
    const before = await ledger(o.id);
    const changed = [
      await pay([o.items[0].id], 20, 'CASH', id),
      await pay([o.items[0].id], 40, 'CARD', id),
      await pay([o.items[1].id], 40, 'CASH', id),
      await cobrarParteDeMesa(rid(), 2, [o.items[0].id], [{ method: 'CASH', amount: 40 }], id),
      await freeTable(rid(), 1, { method: 'CASH', amount: 40 }, id),
      await actor(1, () => pay([o.items[0].id], 40, 'CASH', id)),
    ];
    for (const result of changed) expect(result.error).toMatch(/identidad del intento/);
    expect(await ledger(o.id)).toEqual(before);
  });

  it('un fallo de reparto no deja ni dinero ni identidad; permite repetir tras corregirlo', async () => {
    const o = await order([10]);
    const id = randomUUID();
    checked(await db.from('table_splits').insert({ restaurant_id: rid(), table_number: 1, mode: 'byItem',
      people: Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, name: `AUD ${i}` })), assignment: {}, paid: [] }));
    expect((await pay([o.items[0].id], 10, 'CASH', id)).error).toMatch(/30 partes/);
    expect(await ledger(o.id)).toEqual([]);
    expect(checked(await db.from('cobro_intentos').select('*').eq('restaurant_id', rid()))).toEqual([]);
    checked(await db.from('table_splits').delete().eq('restaurant_id', rid()));
    success(await pay([o.items[0].id], 10, 'CASH', id));
    expect(net(await ledger(o.id))).toBe(1000);
  });

  it('recupera el cierre perdido aunque la mesa ya tenga una ronda nueva', async () => {
    const o = await order([10]);
    const id = randomUUID();
    const close = () => freeTable(rid(), 1, { method: 'CARD', amount: 10 }, id);
    let original: unknown;
    state.afterFetch = async (url, method, response) => {
      if (!original && method === 'POST' && url.pathname.endsWith('/rpc/leogin_cerrar_mesa_idempotente')) {
        expect(response.ok).toBe(true);
        original = await response.clone().json();
        throw new TypeError('AUD: cierre confirmado sin acuse');
      }
    };
    expect((await close()).error).toBeDefined();
    state.afterFetch = null;
    expect(original).toBeDefined();
    const rows = await ledger(o.id);
    const fresh = await order([20]);
    const freshBefore = checked(await db.from('orders').select('*').eq('id', fresh.id).single());
    const recovered = await close();
    success(recovered);
    expect(recovered).toEqual(original);
    expect(recovered).toMatchObject({ intentoId: id, cobrado: 10, paymentIds: rows.map((p) => p.id), orderIds: [o.id] });
    expect(await ledger(o.id)).toEqual(rows);
    expect(await ledger(fresh.id)).toEqual([]);
    expect(checked(await db.from('orders').select('*').eq('id', fresh.id).single())).toEqual(freshBefore);
  });

  it('un cierre simultáneo con la misma identidad confirma una sola vez', async () => {
    const o = await order([10]);
    const id = randomUUID();
    const close = () => freeTable(rid(), 1, { method: 'CARD', amount: 10 }, id);
    const results = await Promise.all([close(), close()]);
    results.forEach(success);
    expect(results[0]).toEqual(results[1]);
    expect(await ledger(o.id)).toHaveLength(1);
    expect(net(await ledger(o.id))).toBe(1000);
    expect((await freeTable(rid(), 1, { method: 'CARD', amount: 10 }, randomUUID())).error).toMatch(/ya se cobró/);
  });

  it('devuelve el recibo guardado aun tras cerrar y devolver; no reconstruye el original', async () => {
    const o = await order([10]);
    const id = randomUUID();
    const original = await pay([o.items[0].id], 10, 'CASH', id);
    success(original);
    success(await freeTable(rid(), 1));
    success(await devolverCobro({ restaurantId: rid(), orderId: o.id, reason: 'AUD devolución posterior al intento' }));
    const before = await ledger(o.id);
    expect(await pay([o.items[0].id], 10, 'CASH', id)).toEqual(original);
    expect(await ledger(o.id)).toEqual(before);
    expect(net(before)).toBe(0);
  });

  it('la recuperación exige servicio y la tabla durable no admite escritura de clientes ni actualización del servicio', async () => {
    const { rows } = await sql.query("select proname, prosecdef, has_function_privilege('anon',oid,'execute') anon, has_function_privilege('authenticated',oid,'execute') auth, has_function_privilege('service_role',oid,'execute') service from pg_proc where proname in ('leogin_recuperar_intento_cobro','leogin_cobrar_parte_mesa_idempotente','leogin_cerrar_mesa_idempotente')");
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row).toMatchObject({ prosecdef: false, anon: false, auth: false, service: true });
    const privileges = await sql.query("select has_table_privilege('anon','public.cobro_intentos','SELECT,INSERT,UPDATE,DELETE') anon, has_table_privilege('authenticated','public.cobro_intentos','SELECT,INSERT,UPDATE,DELETE') auth, has_table_privilege('service_role','public.cobro_intentos','UPDATE,DELETE') mutable, relrowsecurity rls from pg_class where oid='public.cobro_intentos'::regclass");
    expect(privileges.rows[0]).toEqual({ anon: false, auth: false, mutable: false, rls: true });
  });
});
