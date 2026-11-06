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

import {
  cobrarParteDeMesa, cobradoDeMesa, ejecutarAbonoMesa, guardarPartesMesa, leerContextoCobroMesa,
} from '@/lib/actions/servicio';
import { freeTable } from '@/lib/actions/orders';
import { abrirTurno, closeCaja, saveCajaDraft, discardCajaDraft, getCajaReceipt, getCajaState, guardarBorradorCaja } from '@/lib/actions/finanzas';
import { corregirMetodoDePago, devolverCobro } from '@/lib/actions/caja-correcciones';
import { leerTurno } from '@/lib/caja/turno-servidor';
import { computeSplit } from '@/lib/bill-split';
import type { OrderWithItems } from '@/lib/db/orders';

const rid = () => state.restaurantId;
// El reloj operativo lo da el contexto SQL; D09 conserva sus instantes explícitos.
const period = (ahora?: Date) => leerTurno(db, { restaurantId: rid(), timezone: 'America/Guatemala', corteMin: 300, ahora });
const pay = (ids: string[], amount: number, method = 'CASH', id: string = randomUUID()) => cobrarParteDeMesa(rid(), 1, ids, [{ amount, method: method as 'CASH' | 'CARD' }], id);
function success(result: { error?: string }) { expect(result.error).toBeUndefined(); }

async function cuentaActiva(mesa = 1) {
  const res = await leerContextoCobroMesa(rid(), mesa);
  if ('error' in res) throw new Error(res.error);
  return res.contexto;
}

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

describe('1.1 · abonos y partes de mesa persistentes', () => {
  it('guarda Q100 entre tres, cobra dos partes con un recibo y permite cerrar sin otro movimiento', async () => {
    const o = await order([100]);
    const { cuenta } = await cuentaActiva();
    const plan = await guardarPartesMesa(rid(), 1, cuenta, null, 3);
    if ('error' in plan) throw new Error(plan.error);
    const { reparto } = plan;
    expect(reparto.partes.map((p) => p.importe)).toEqual([33.34, 33.33, 33.33]);
    const intento = randomUUID();
    const solicitud = { mesa: 1, operacion: 'abono' as const, cuenta, reparto: reparto.id,
      partes: reparto.partes.slice(0, 2).map((p) => p.id), pagos: [{ method: 'CARD' as const, amount: 66.67 }] };
    const primero = await ejecutarAbonoMesa(rid(), solicitud, intento);
    expect(primero).toMatchObject({ intentoId: intento, cobrado: 66.67 });
    const vigente = await cuentaActiva();
    expect(vigente).toMatchObject({ saldo: 33.33, total: 66.67, reparto: { desactualizado: false } });
    expect(vigente.reparto?.partes.map((p) => p.recibo?.intentoId ?? null)).toEqual([intento, intento, null]);
    success(await ejecutarAbonoMesa(rid(), { ...solicitud, cuenta: vigente.cuenta,
      partes: [reparto.partes[2].id], pagos: [{ method: 'TRANSFER', amount: 33.33 }] }, randomUUID()));
    const saldada = await cuentaActiva();
    expect(saldada).toMatchObject({ saldo: 0, total: 100, saldada: true });
    expect(checked(await db.from('orders').select('status').eq('id', o.id).single())?.status).toBe('SERVED');
    const cierre = { mesa: 1, operacion: 'pagada' as const, cuenta: saldada.cuenta };
    const idCierre = randomUUID();
    expect(await ejecutarAbonoMesa(rid(), cierre, idCierre)).toMatchObject({ orderIds: [o.id], paymentIds: [], cobrado: 0 });
    const nueva = await order([20]);
    expect(await cuentaActiva()).toMatchObject({ saldo: 20, reparto: null });
    expect(await ejecutarAbonoMesa(rid(), solicitud, intento)).toEqual(primero);
    expect(await ejecutarAbonoMesa(rid(), cierre, idCierre)).toMatchObject({ orderIds: [o.id], repetido: true });
    expect(net(await ledger(o.id))).toBe(10000);
    expect(await ledger(nueva.id)).toEqual([]);
  });

  it('solo una caja cobra la misma parte y una ronda nueva conserva la parte pagada al repartir', async () => {
    const o = await order([100]);
    const { cuenta } = await cuentaActiva();
    const plan = await guardarPartesMesa(rid(), 1, cuenta, null, 3);
    if ('error' in plan) throw new Error(plan.error);
    const { reparto } = plan;
    const solicitud = { mesa: 1, operacion: 'abono' as const, cuenta, reparto: reparto.id,
      partes: [reparto.partes[0].id], pagos: [{ method: 'CARD' as const, amount: 33.34 }] };
    const gate = deferred();
    let cajas = 0;
    state.beforeFetch = async (url, method) => {
      if (method !== 'POST' || !url.pathname.endsWith('/rpc/leogin_registrar_abono_mesa')) return;
      if (++cajas === 2) gate.resolve();
      await bounded(gate.promise);
    };
    const resultados = await Promise.all([0, 1].map((i) =>
      actor(i, () => ejecutarAbonoMesa(rid(), solicitud, randomUUID()))));
    state.beforeFetch = null;
    expect(cajas).toBe(2);
    expect(resultados.filter((r) => r.cobrado === 33.34)).toHaveLength(1);
    expect(resultados.filter((r) => r.error && r.incierto === false)).toHaveLength(1);
    expect(net(await ledger(o.id))).toBe(3334);

    await order([10]);
    const cambiado = await cuentaActiva();
    expect(cambiado).toMatchObject({ saldo: 76.66, reparto: { desactualizado: true } });
    expect(await ejecutarAbonoMesa(rid(), { ...solicitud, cuenta: cambiado.cuenta,
      partes: [reparto.partes[1].id], pagos: [{ method: 'CARD', amount: 33.33 }] }, randomUUID())).toMatchObject({ incierto: false });
    const nuevo = await guardarPartesMesa(rid(), 1, cambiado.cuenta, reparto.id, 2);
    if ('error' in nuevo) throw new Error(nuevo.error);
    expect(nuevo.reparto.id).not.toBe(reparto.id);
    expect(nuevo.reparto.partes.map((p) => p.importe)).toEqual([33.34, 38.33, 38.33]);
    expect(nuevo.reparto.partes[0]).toEqual(cambiado.reparto?.partes[0]);
    expect(await guardarPartesMesa(rid(), 1, cambiado.cuenta, reparto.id, 2)).toHaveProperty('error');
  });

  it('recupera un abono mixto sin duplicar recibo, efectivo recibido ni movimientos de caja', async () => {
    const o = await order([120, 80]);
    const { cuenta } = await cuentaActiva();
    const solicitud = { mesa: 1, operacion: 'abono' as const, cuenta, reparto: null, partes: [] };
    for (const pagos of [
      [{ method: 'CASH' as const, amount: 50, cashReceived: 49.99 }],
      [{ method: 'CARD' as const, amount: 200.01 }],
      [{ method: 'CARD' as const, amount: 0.001 }],
    ]) {
      expect(await ejecutarAbonoMesa(rid(), { ...solicitud, pagos }, randomUUID())).toMatchObject({ incierto: false });
    }
    expect(await ledger(o.id)).toEqual([]);
    const pagos = [{ method: 'CASH' as const, amount: 50, cashReceived: 100 }, { method: 'CARD' as const, amount: 80 }];
    const intento = randomUUID();
    let original: unknown;
    state.afterFetch = async (url, method, response) => {
      if (!original && method === 'POST' && url.pathname.endsWith('/rpc/leogin_registrar_abono_mesa')) {
        expect(response.ok).toBe(true);
        original = await response.clone().json();
        throw new TypeError('AUD: acuse del abono perdido después del commit');
      }
    };
    expect(await ejecutarAbonoMesa(rid(), { ...solicitud, pagos }, intento)).toMatchObject({ incierto: true });
    state.afterFetch = null;
    expect(original).toMatchObject({ cobrado: 130, pagos });
    const antes = await ledger(o.id);
    expect(await ejecutarAbonoMesa(rid(), { ...solicitud, pagos }, intento)).toEqual(original);
    expect(await ledger(o.id)).toEqual(antes);
    expect(antes.map((p) => [p.method, p.amount, p.cash_received]).sort()).toEqual([['CARD', 80, null], ['CASH', 50, 100]]);
    expect(await cuentaActiva()).toMatchObject({ saldo: 70, historial: expect.arrayContaining([
      expect.objectContaining({ method: 'CASH', amount: 50, cashReceived: 100 }),
    ]) });
    expect((await period()).cuadre.porMetodo).toEqual({ CARD: 80, CASH: 50 });
    success(await freeTable(rid(), 1, { method: 'CARD', amount: 70 }, randomUUID()));
    expect(net(await ledger(o.id))).toBe(20000);
  });

  it('exige servir antes de liberar una cuenta pagada y restringe el reparto al servidor', async () => {
    const o = await order([10]);
    const { cuenta } = await cuentaActiva();
    success(await ejecutarAbonoMesa(rid(), { mesa: 1, operacion: 'abono', cuenta,
      reparto: null, partes: [], pagos: [{ method: 'CARD', amount: 10 }] }, randomUUID()));
    checked(await db.from('orders').update({ status: 'READY' }).eq('id', o.id));
    const pagada = await cuentaActiva();
    expect(pagada.saldada).toBe(true);
    expect(await ejecutarAbonoMesa(rid(), { mesa: 1, operacion: 'pagada', cuenta: pagada.cuenta }, randomUUID()))
      .toMatchObject({ error: expect.stringMatching(/Sirve los pedidos/), incierto: false });
    expect(net(await ledger(o.id))).toBe(1000);
    const { rows } = await sql.query(`select prosecdef,has_function_privilege('anon',oid,'execute') anon,
      has_function_privilege('authenticated',oid,'execute') auth,has_function_privilege('service_role',oid,'execute') service
      from pg_proc where proname in ('leogin_contexto_pago_mesa','leogin_guardar_partes_mesa',
        'leogin_registrar_abono_mesa','leogin_cerrar_cuenta_pagada')`);
    expect(rows).toEqual(Array.from({ length: 4 }, () => ({ prosecdef: false, anon: false, auth: false, service: true })));
    const permisos = await sql.query(`select relrowsecurity, has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE') anon,
      has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE') auth from pg_class
      where oid='public.cobro_repartos_mesa'::regclass`);
    expect(permisos.rows).toEqual([{ relrowsecurity: true, anon: false, auth: false }]);
  });

  it('distribuye un abono de tres métodos entre rondas con más de 120 platos y respeta propina y descuento', async () => {
    const primera = await order(Array<number>(121).fill(1), { tip: 18, discount: 4, total: 135 });
    const segunda = await order([15]);
    const { cuenta } = await cuentaActiva();
    const pagos = [{ method: 'CASH' as const, amount: 140, cashReceived: 160 },
      { method: 'CARD' as const, amount: 4.05 }, { method: 'TRANSFER' as const, amount: 5.95 }];
    const id = randomUUID();
    success(await ejecutarAbonoMesa(rid(), { mesa: 1, operacion: 'abono', cuenta, reparto: null, partes: [], pagos }, id));
    const actual = await cuentaActiva();
    const ids = primera.items.map((i: { id: string }) => i.id);
    expect(actual).toMatchObject({ saldo: 0, saldada: true, lineasPagadas: expect.arrayContaining(ids),
      recibos: [expect.objectContaining({ intentoId: id, cobrado: 150, pagos })] });
    expect(net(await ledger(primera.id))).toBe(13500);
    expect(net(await ledger(segunda.id))).toBe(1500);
    expect((await ledger()).filter((p) => p.cash_received != null).map((p) => p.cash_received)).toEqual([160]);
    expect((await period()).cuadre.porMetodo).toEqual({ CASH: 140, CARD: 4.05, TRANSFER: 5.95 });

    success(await ejecutarAbonoMesa(rid(), { mesa: 1, operacion: 'pagada', cuenta: actual.cuenta }, randomUUID()));
    const devuelto = await devolverCobro({ restaurantId: rid(), orderId: primera.id, itemId: primera.items[0].id,
      method: 'CASH', quantity: 1, reason: 'AUD devolución parcial de abono mixto' });
    success(devuelto);
    const movimientos = await ledger();
    expect(movimientos.filter((p) => p.kind === 'REFUND')).toEqual([
      expect.objectContaining({ order_id: primera.id, method: 'CASH', amount: -devuelto.amount! }),
    ]);
    expect(net(movimientos)).toBe(15000 - Math.round(devuelto.amount! * 100));
    expect((await period()).cuadre.devoluciones).toBe(devuelto.amount);
  });
});

describe('1.2 · recibo durable de cierre', () => {
  const turnoLeido = async () => {
    const l = await period();
    return { desde: l.desde, id: l.abierto?.id ?? null };
  };

  it('recupera el mismo corte con el intento original aunque ya haya cobros en el siguiente turno', async () => {
    await order([70]);
    success(await freeTable(rid(), 1, { method: 'CASH', amount: 70 }, randomUUID()));
    const input = { restaurantId: rid(), counts: { bil_50: 1, bil_20: 1 }, openingFloat: 0, intentoId: randomUUID(), turno: await turnoLeido() };
    const primero = await closeCaja(input);
    expect(primero.result).toMatchObject({ counted: 70, expected: 70, difference: 0 });
    await order([10]);
    success(await freeTable(rid(), 1, { method: 'CASH', amount: 10 }, randomUUID()));
    expect(await closeCaja(input)).toEqual(primero);
    const { receipt } = await getCajaReceipt(rid(), primero.result!.id);
    expect(receipt).toMatchObject({ expectedDrawer: 70, counts: { bil_50: 1, bil_20: 1 }, byMethod: { CASH: 70 } });
    expect(await closeCaja({ ...input, counts: { bil_10: 7 } })).toMatchObject({ error: expect.stringMatching(/otro cierre/) });
    expect(await actor(1, () => closeCaja(input))).toMatchObject({ error: expect.stringMatching(/otro cierre/) });
    expect(await closeCaja({ ...input, intentoId: randomUUID() })).toMatchObject({ error: expect.stringMatching(/turno cambió/) });
    const cortes = checked(await db.from('cash_counts').select('id').eq('restaurant_id', rid()).eq('status', 'CLOSED'));
    expect(cortes).toEqual([{ id: primero.result?.id }]);
    expect((await period()).cuadre.efectivo).toBe(10);
  });

  it('dos solicitudes simultáneas con la misma identidad enlazan gastos y recibo una sola vez', async () => {
    const pago = await order([20]);
    success(await freeTable(rid(), 1, { method: 'CASH', amount: 20 }, randomUUID()));
    const gasto = checked(await db.from('cash_expenses').insert({
      restaurant_id: rid(), business_date: (await period()).dia, concept: 'AUD Hielo', amount: 5, paid_by: state.users[0],
    }).select('id').single())!;
    const input = { restaurantId: rid(), counts: { bil_10: 1, bil_5: 1 }, openingFloat: 0, intentoId: randomUUID(), turno: await turnoLeido() };
    const gate = deferred();
    let solicitudes = 0;
    state.beforeFetch = async (url, method) => {
      if (method !== 'POST' || !url.pathname.endsWith('/rpc/leogin_confirmar_cierre_caja_con_recibo')) return;
      if (++solicitudes === 2) gate.resolve();
      await bounded(gate.promise);
    };
    const [primero, repetido] = await Promise.all([closeCaja(input), closeCaja(input)]);
    state.beforeFetch = null;
    expect(solicitudes).toBe(2);
    expect(primero.result).toMatchObject({ counted: 15, expectedDrawer: 15, expenses: [expect.objectContaining({ id: gasto.id, amount: 5 })] });
    expect(repetido).toEqual(primero);
    expect(checked(await db.from('cash_expenses').select('cash_count_id').eq('id', gasto.id).single())?.cash_count_id).toBe(primero.result?.id);
    expect(checked(await db.from('caja_recibos').select('corte_id').eq('restaurant_id', rid()))).toEqual([{ corte_id: primero.result?.id }]);
    expect(net(await ledger(pago.id))).toBe(2000);
  });

  it('recupera el recibo tras perder la respuesta del servidor y protege su acceso directo', async () => {
    const input = { restaurantId: rid(), counts: {}, openingFloat: 0, notes: 'AUD cierre vacío', intentoId: randomUUID(), turno: await turnoLeido() };
    let confirmado: { recibo?: unknown } | undefined;
    state.afterFetch = async (url, method, response) => {
      if (method !== 'POST' || !url.pathname.endsWith('/rpc/leogin_confirmar_cierre_caja_con_recibo')) return;
      expect(response.ok).toBe(true);
      confirmado = await response.clone().json();
      throw new TypeError('AUD: se perdió el acuse del corte después del commit');
    };
    expect(await closeCaja(input)).toHaveProperty('error');
    state.afterFetch = null;
    const reintento = await closeCaja(input);
    expect(confirmado?.recibo).toMatchObject({ id: reintento.result?.id, notes: input.notes });
    expect(reintento.result).toEqual({ ...confirmado?.recibo as object, dia: null });
    const { rows } = await sql.query(`select relrowsecurity,
      has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE') anon,
      has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE') auth,
      has_table_privilege('service_role',oid,'UPDATE,DELETE') modificable
      from pg_class where oid='public.caja_recibos'::regclass`);
    expect(rows).toEqual([{ relrowsecurity: true, anon: false, auth: false, modificable: false }]);
  });
});

describe('1.2 · conteo y borrador de Caja', () => {
  it('suma por separado un billete de Q1 y una moneda de un centavo en el recibo', async () => {
    const res = await closeCaja({ restaurantId: rid(), counts: { bil_5: 1, bil_1: 1, mon_1: 2, mon_001: 3 }, openingFloat: 0 });
    expect(res.result).toMatchObject({ counted: 8.03, counts: { bil_1: 1, mon_001: 3 } });
  });

  it('conserva el borrador ganador al guardar desde dos aparatos y permite retomar el cero explícito', async () => {
    await order([10]);
    success(await freeTable(rid(), 1, { method: 'CASH', amount: 10 }, randomUUID()));
    const l = await period();
    const turno = { desde: l.desde, id: l.abierto?.id ?? null };
    const conteo = { counts: {}, cashCounted: true, openingFloat: 0, paso: 3 as const };
    const input = { restaurantId: rid(), turno, revision: null, conteo };
    const [a, b] = await Promise.all([
      guardarBorradorCaja(input),
      actor(1, () => guardarBorradorCaja({ ...input, conteo: { ...conteo, counts: { bil_5: 1 } } })),
    ]);
    expect([a, b].filter((r) => r.guardado)).toHaveLength(1);
    expect([a, b].filter((r) => r.conflicto)).toHaveLength(1);
    const leido = await actor(1, () => getCajaState(rid()));
    expect(leido.cloudDraft?.revision).toBe((a.guardado ?? b.guardado)?.revision);
    const borradorRevision = leido.cloudDraft!.revision;
    expect((await closeCaja({ restaurantId: rid(), turno, intentoId: randomUUID(), counts: {},
      openingFloat: 0, cashCounted: false, borradorRevision })).error).toMatch(/confirma el conteo en cero/);
    expect((await closeCaja({ restaurantId: rid(), turno, intentoId: randomUUID(), counts: {},
      openingFloat: 0, cashCounted: true, borradorRevision: null })).error).toMatch(/más reciente/);
    const corte = await closeCaja({ restaurantId: rid(), turno, intentoId: randomUUID(), counts: {},
      openingFloat: 0, cashCounted: true, borradorRevision });
    expect(corte.result).toMatchObject({ counted: 0, expected: 10, difference: -10 });
    expect(await guardarBorradorCaja({ ...input, revision: borradorRevision })).toMatchObject({ conflicto: true });
    expect((await getCajaState(rid())).cloudDraft).toBeNull();
  });
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
    const pagosPrevios = await ledger(first.id);
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
    expect(rows.filter((r) => pagosPrevios.some((p) => p.id === r.id))).toEqual(pagosPrevios);
    expect(checked(await db.from('orders').select('status').in('id', [first.id, second.id]))?.map((o) => o.status)).toEqual(['DELIVERED', 'DELIVERED']);
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
    // El empate del residuo por plato lo decide el UUID, no el orden de clic.
    const items = [...o.items].sort((a, b) => a.id.localeCompare(b.id));
    for (let i = 0; i < 3; i++) success(await pay([items[i].id], split.people[i].total));
    expect(net(await ledger(o.id)), 'El reparto persistido debe coincidir con el total exacto de la cuenta').toBe(10000);
    expect((await ledger(o.id)).reduce((sum, p) => sum + Object.values(p.item_amounts).reduce<number>((s, n) => s + Math.round(Number(n) * 100), 0), 0)).toBe(10000);
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
      // El reloj del cierre anterior era Windows: fijarlo al reloj real de
      // Postgres DESPUÉS de observar la espera evita una guarda falsa por desfase.
      const ahoraSQL = (await sql.query('select clock_timestamp() as ahora')).rows[0].ahora;
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(ahoraSQL);
      try { close = await closeCaja(payload); } finally { vi.useRealTimers(); }
      success(close);
      expect(close.result).toBeDefined();
    } finally {
      await sql.query('rollback');
      success(await pending);
    }
    const rows = await ledger(o.id);
    expect(net(rows)).toBe(1000);
    expect(new Date(rows[0].created_at).getTime()).toBeLessThanOrEqual(new Date(close!.result!.closedAt).getTime());
    expect(rows[0].caja_registrado_en > close!.result!.closedAt).toBe(true);
    expect(rows[0].caja_corte_previo).toBe(close!.result!.id);
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

describe('0.19 · límites exactos del periodo de caja', () => {
  const inicio = '2026-11-05T11:00:00.000Z';
  const ahora = new Date('2026-11-05T12:00:00Z');
  async function corte(at: string, efectivo = 3) {
    return checked(await db.from('cash_counts').insert({ restaurant_id: rid(), business_date: '2026-11-05',
      status: 'CLOSED', period_start: '2026-11-04T11:00:00Z', closed_at: at,
      expected_cash: efectivo, counted_cash: efectivo, by_method: { CASH: efectivo } }).select('*').single())!;
  }
  async function fuentes(at: string, amount: number, gestionado = false) {
    const pago = await order([amount], { at });
    const entrega = await order([amount], { table: 2, at });
    checked(await db.from('order_payments').insert({ restaurant_id: rid(), order_id: pago.id,
      method: 'CASH', amount, ...(gestionado ? {} : { created_at: at }) }));
    checked(await db.from('orders').update({ status: 'DELIVERED', order_type: 'PICKUP',
      delivered_at: at, payment_method: 'CASH', tip: amount }).eq('id', entrega.id));
    const gasto = checked(await db.from('cash_expenses').insert({ restaurant_id: rid(),
      business_date: '2026-11-05', concept: 'AUD límite', amount,
      ...(gestionado ? {} : { created_at: at }) }).select('id').single())!;
    // Fija únicamente marcas de los fixtures para probar ambos libros con
    // precisión de Postgres; no cambia el reloj ni las consultas de producción.
    await sql.query('update public.orders set caja_registrado_en=$2 where id=$1', [entrega.id, gestionado ? at : null]);
    if (gestionado) {
      await sql.query('update public.order_payments set caja_registrado_en=$2 where order_id=$1', [pago.id, at]);
      await sql.query('update public.cash_expenses set caja_registrado_en=$2 where id=$1', [gasto.id, at]);
    }
    return { pago, entrega, gasto };
  }
  for (const gestionado of [false, true]) {
    it(`incluye pagos, entregas, gastos y propinas del inicio; excluye los anteriores y futuros (${gestionado ? 'registro SQL' : 'legado'})`, async () => {
      await fuentes('2026-11-05T10:59:59.999999Z', 1, gestionado);
      const exacto = await fuentes(inicio, 2, gestionado);
      await fuentes('2026-11-05T11:00:00.000001Z', 3, gestionado);
      await fuentes('2026-11-05T12:00:00.000001Z', 4, gestionado);
      const l = await period(ahora);
      expect(l.cuadre.efectivo).toBe(10);
      expect(l.gastosTotal).toBe(5);
      expect(l.propinasTotal).toBe(5);
      expect(l.cobros.map((c) => c.orderId)).toContain(exacto.entrega.id);
      expect(l.gastos).toHaveLength(2);
    });
    it(`conserva microsegundos y excluye el instante de un corte firmado (${gestionado ? 'registro SQL' : 'legado'})`, async () => {
      await fuentes('2026-11-05T11:30:00.123455Z', 1, gestionado);
      await fuentes('2026-11-05T11:30:00.123456Z', 2, gestionado);
      await fuentes('2026-11-05T11:30:00.123457Z', 4, gestionado);
      const hasta = '2026-11-05T11:30:00.123456Z';
      const primero = checked(await db.rpc('leogin_leer_periodo_caja_limites', {
        p_restaurant: rid(), p_desde: inicio, p_gestion_desde: inicio,
        p_hasta: hasta, p_incluir_desde: true,
      }));
      expect(primero.pagos.map((p: { amount: number }) => Number(p.amount)).sort()).toEqual([1, 2]);
      expect(primero.entregados).toHaveLength(2);
      expect(primero.gastos.reduce((s: number, g: { amount: number }) => s + Number(g.amount), 0)).toBe(3);
      const previo = await corte(hasta, 6);
      const l = await period(ahora);
      expect(l.desde).toBe(previo.closed_at);
      expect(l.cuadre.efectivo).toBe(8);
      expect(l.gastosTotal).toBe(4);
      expect(l.propinasTotal).toBe(4);
      expect(Number(previo.expected_cash) + l.cuadre.efectivo).toBe(14);
      expect(checked(await db.from('cash_counts').select('*').eq('id', previo.id).single())).toEqual(previo);
    });
  }
  it('un cierre exactamente al inicio ya incluye ese instante y el siguiente no lo duplica', async () => {
    await fuentes(inicio, 2);
    await fuentes('2026-11-05T11:00:00.000001Z', 3);
    const previo = await corte(inicio, 4);
    const l = await period(ahora);
    expect(l.cuadre.efectivo).toBe(6);
    expect(l.gastosTotal).toBe(3);
    expect(l.propinasTotal).toBe(3);
    expect(checked(await db.from('cash_counts').select('*').eq('id', previo.id).single())).toEqual(previo);
  });
  it('un cierre del día anterior conserva inclusivo el inicio del nuevo día', async () => {
    await corte('2026-11-05T10:59:59.999999Z');
    await fuentes(inicio, 2);
    expect((await period(ahora)).cuadre.efectivo).toBe(4);
  });
  it('mantiene el día de apertura de un turno que sigue abierto al pasar las 05:00', async () => {
    checked(await db.from('cash_counts').insert({ restaurant_id: rid(), business_date: '2026-11-04',
      status: 'OPEN', opened_at: '2026-11-05T10:00:00Z', opening_float: 0 }));
    await fuentes('2026-11-04T11:00:00.000Z', 2);
    const l = await period(ahora);
    expect(l.dia).toBe('2026-11-04');
    expect(l.cuadre.efectivo).toBe(4);
  });
  it('el lector nuevo solo permite al servicio ejecutar SQL con security invoker', async () => {
    const { rows } = await sql.query("select prosecdef,has_function_privilege('anon',oid,'execute') anon,has_function_privilege('authenticated',oid,'execute') auth,has_function_privilege('service_role',oid,'execute') service from pg_proc where proname='leogin_leer_periodo_caja_limites'");
    expect(rows).toEqual([{ prosecdef: false, anon: false, auth: false, service: true }]);
  });
  it('respeta otra zona y corte a medianoche, coincidiendo con el informe SQL', async () => {
    await fuentes('2026-11-05T05:59:59.999999Z', 1);
    await fuentes('2026-11-05T06:00:00.000Z', 2);
    const l = await leerTurno(db, { restaurantId: rid(), timezone: 'America/Mexico_City', corteMin: 0, ahora });
    const report = checked(await db.rpc('leogin_sales_report', { p_restaurant_id: rid(), p_from: '2026-11-05',
      p_to: '2026-11-05', p_timezone: 'America/Mexico_City', p_cutoff_minutes: 0 }));
    expect(l.desde).toBe('2026-11-05T06:00:00.000Z');
    expect(l.cuadre.efectivo).toBe(4);
    expect(Number(report.revenue)).toBe(l.cuadre.efectivo);
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
      if (!original && method === 'POST' && url.pathname.endsWith('/rpc/leogin_cerrar_saldo_mesa')) {
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
    const policies = await sql.query("select polname, polpermissive, polcmd, pg_get_expr(polqual,polrelid) as filtro, pg_get_expr(polwithcheck,polrelid) as escritura from pg_policy where polrelid='public.cobro_intentos'::regclass");
    expect(policies.rows).toHaveLength(1);
    expect(policies.rows[0]).toMatchObject({ polname: 'super_admin_segundo_factor', polpermissive: false, polcmd: '*' });
    expect(policies.rows[0].filtro).toContain('leogin_sesion_con_segundo_factor()');
    expect(policies.rows[0].escritura).toContain('leogin_sesion_con_segundo_factor()');
  });
});

describe('0.16 · cierre sobre el saldo de cada pedido', () => {
  it('permite corregir y devolver cada pedido sin cargar su dinero a otra ronda', async () => {
    const first = await order([40, 60]);
    success(await pay([first.items[0].id], 40));
    const second = await order([20]);
    const close = await freeTable(rid(), 1, { method: 'CARD', amount: 80 }, randomUUID());
    success(close);
    const originales = await ledger();
    success(await corregirMetodoDePago({ restaurantId: rid(), orderId: first.id, method: 'TRANSFER', from: 'CARD', reason: 'AUD corrección sobre primera ronda' }));
    const corregidos = await ledger(first.id);
    expect(net(corregidos)).toBe(10000);
    expect(corregidos.filter((p) => p.method === 'CARD').reduce((s, p) => s + Number(p.amount), 0)).toBe(0);
    expect(corregidos.filter((p) => p.method === 'TRANSFER').reduce((s, p) => s + Number(p.amount), 0)).toBe(60);
    success(await devolverCobro({ restaurantId: rid(), orderId: first.id, reason: 'AUD devolución primera ronda' }));
    expect(net(await ledger(first.id))).toBe(0);
    expect(net(await ledger(second.id))).toBe(2000);
    success(await devolverCobro({ restaurantId: rid(), orderId: second.id, reason: 'AUD devolución segunda ronda' }));
    expect(net(await ledger())).toBe(0);
    const finales = await ledger();
    expect(finales.filter((p) => originales.some((o) => o.id === p.id))).toEqual(originales);
    // El recibo del cierre sigue siendo el que confirmó Q80, sin recalcularlo tras las devoluciones.
    expect(await freeTable(rid(), 1, { method: 'CARD', amount: 80 }, close.intentoId)).toEqual(close);
  });

  it('no vuelve a cobrar un pedido ya saldado al cerrar una ronda nueva', async () => {
    const first = await order([100]);
    success(await pay([first.items[0].id], 100));
    const before = await ledger(first.id);
    const second = await order([20]);
    const close = await freeTable(rid(), 1, { method: 'CARD', amount: 20 }, randomUUID());
    success(close);
    expect(close.cobrado).toBe(20);
    expect(await ledger(first.id)).toEqual(before);
    expect(net(await ledger(second.id))).toBe(2000);
    expect((await period()).pendientes.total).toBe(0);
  });

  it('reparte varios métodos sobre saldos y registra el efectivo recibido una sola vez', async () => {
    const first = await order([40, 60]);
    success(await pay([first.items[0].id], 40));
    const second = await order([20]);
    success(await freeTable(rid(), 1, [{ method: 'CARD', amount: 50 }, { method: 'CASH', amount: 30, cashReceived: 100 }], randomUUID()));
    const rows = await ledger();
    expect(net(rows.filter((p) => p.order_id === first.id))).toBe(10000);
    expect(net(rows.filter((p) => p.order_id === second.id))).toBe(2000);
    expect(rows.filter((p) => p.kind === 'TABLE_CLOSE').map((p) => [p.order_id, p.method, Number(p.amount)]).sort())
      .toEqual([[first.id, 'CARD', 50], [first.id, 'CASH', 10], [second.id, 'CASH', 20]].sort());
    expect(rows.reduce((n, p) => n + Number(p.cash_received ?? 0), 0)).toBe(100);
    expect((await period()).cuadre.porMetodo).toEqual({ CASH: 70, CARD: 50 });
  });

  it('un método sin importe cubre solo el saldo pendiente de las rondas', async () => {
    const first = await order([40, 60]);
    success(await pay([first.items[0].id], 40));
    const second = await order([20]);
    const close = await freeTable(rid(), 1, { method: 'CARD' }, randomUUID());
    success(close);
    expect(close.cobrado).toBe(80);
    expect(net(await ledger(first.id))).toBe(10000);
    expect(net(await ledger(second.id))).toBe(2000);
  });

  it('rechaza importes por encima o debajo del saldo sin recortarlos ni cerrar pedidos', async () => {
    const first = await order([40, 60]);
    success(await pay([first.items[0].id], 40));
    const second = await order([20]);
    const before = await ledger();
    for (const amount of [70, 90]) {
      const id = randomUUID();
      expect((await freeTable(rid(), 1, { method: 'CARD', amount }, id)).error).toMatch(/No se cerró la mesa/);
      expect(checked(await db.from('cobro_intentos').select('intento_id').eq('restaurant_id', rid()).eq('intento_id', id))).toEqual([]);
    }
    expect(await ledger()).toEqual(before);
    expect(checked(await db.from('orders').select('status').in('id', [first.id, second.id]))?.map((o) => o.status)).toEqual(['SERVED', 'SERVED']);
  });

  it('una ronda que llega fuera del snapshot permanece abierta y sin cobro', async () => {
    const first = await order([10]);
    let nueva: Awaited<ReturnType<typeof order>> | undefined;
    state.beforeFetch = async (url, method) => {
      if (!nueva && method === 'POST' && url.pathname.endsWith('/rpc/leogin_cerrar_saldo_mesa')) nueva = await order([20]);
    };
    success(await freeTable(rid(), 1, { method: 'CARD', amount: 10 }, randomUUID()));
    state.beforeFetch = null;
    expect(nueva).toBeDefined();
    expect(net(await ledger(first.id))).toBe(1000);
    expect(await ledger(nueva!.id)).toEqual([]);
    expect(checked(await db.from('orders').select('status').eq('id', nueva!.id).single())?.status).toBe('SERVED');
  });

  it('suma todos los movimientos previos, incluso más de mil filas', async () => {
    const first = await order([100]);
    checked(await db.from('order_payments').insert(Array.from({ length: 1200 }, () => ({ restaurant_id: rid(), order_id: first.id, method: 'CASH', amount: 0.01 }))));
    const before = (await sql.query('select * from public.order_payments where order_id=$1 order by id', [first.id])).rows;
    expect(before).toHaveLength(1200);
    const second = await order([20]);
    success(await freeTable(rid(), 1, { method: 'CARD', amount: 108 }, randomUUID()));
    const sums = await sql.query('select order_id,sum(amount)::numeric as neto from public.order_payments where order_id=any($1::uuid[]) group by order_id', [[first.id, second.id]]);
    expect(Object.fromEntries(sums.rows.map((r) => [r.order_id, Number(r.neto)]))).toEqual({ [first.id]: 100, [second.id]: 20 });
    expect((await sql.query('select * from public.order_payments where id=any($1::uuid[]) order by id', [before.map((p) => p.id)])).rows).toEqual(before);
  });

  it('solo el servicio puede ejecutar el nuevo cierre de saldo', async () => {
    const privileges = await sql.query("select prosecdef, has_function_privilege('anon',oid,'execute') anon, has_function_privilege('authenticated',oid,'execute') auth, has_function_privilege('service_role',oid,'execute') service from pg_proc where oid='public.leogin_cerrar_saldo_mesa(uuid,integer,uuid[],jsonb,uuid,uuid)'::regprocedure");
    expect(privileges.rows).toEqual([{ prosecdef: false, anon: false, auth: false, service: true }]);
  });
});

describe('0.17 · centavos exactos del reparto persistido', () => {
  it('un legado sin reparto mantiene su total y permite el cierre completo seguro de 0.16', async () => {
    const first = await order([40, 60]);
    const old = checked(await db.from('order_payments').insert({ restaurant_id: rid(), order_id: first.id, method: 'CASH', amount: 40 }).select('*').single())!;
    const second = await order([20]);
    const preview = await cobradoDeMesa(rid(), 1);
    expect(preview.total).toBe(40);
    expect(preview.avisoCuotas).toMatch(/sin asignación verificable/);
    expect(preview.lineasPendientes?.[first.items[0].id]).toBeUndefined();
    expect((await pay([first.items[1].id], 60)).error).toMatch(/sin asignación verificable/);
    success(await freeTable(rid(), 1, { method: 'CARD', amount: 120-preview.total! }, randomUUID()));
    expect(net(await ledger(first.id))).toBe(10000);
    expect(net(await ledger(second.id))).toBe(2000);
    expect(checked(await db.from('order_payments').select('*').eq('id', old.id).single())).toEqual(old);
  });

  it('los extras negativos también conservan el total al cobrar en otro orden', async () => {
    const o = await order([30, 30, 30], { total: 80, discount: 10 });
    const items = [...o.items].sort((a, b) => a.id.localeCompare(b.id));
    const preview = await cobradoDeMesa(rid(), 1);
    expect(items.map((i: { id: string }) => preview.lineasPendientes?.[i.id])).toEqual([26.67, 26.67, 26.66]);
    for (const i of [...items].reverse()) {
      const actual = await cobradoDeMesa(rid(), 1);
      success(await pay([i.id], actual.lineasPendientes![i.id]));
    }
    expect(net(await ledger(o.id))).toBe(8000);
    expect((await cobradoDeMesa(rid(), 1)).lineasPagadas).toHaveLength(3);
  });

  it('pondera la cantidad de unidades de la línea sin perder el centavo', async () => {
    const o = await order([60, 30], { total: 100, tip: 10 });
    checked(await db.from('order_items').update({ quantity: 2, price_snapshot: 30 }).eq('id', o.items[0].id));
    const preview = await cobradoDeMesa(rid(), 1);
    expect(o.items.map((i: { id: string }) => preview.lineasPendientes?.[i.id])).toEqual([66.67, 33.33]);
    for (const i of o.items) success(await pay([i.id], preview.lineasPendientes![i.id]));
    expect(net(await ledger(o.id))).toBe(10000);
  });

  it('aplica los extras de cada pedido en vez de un factor global de la mesa', async () => {
    const a = await order([30, 30], { total: 70, tip: 10 });
    const b = await order([20], { total: 15, discount: 5 });
    const preview = await cobradoDeMesa(rid(), 1);
    expect(a.items.map((i: { id: string }) => preview.lineasPendientes?.[i.id])).toEqual([35, 35]);
    expect(preview.lineasPendientes?.[b.items[0].id]).toBe(15);
    success(await pay([a.items[0].id, b.items[0].id], 50));
    success(await pay([a.items[1].id], 35));
    expect(net(await ledger(a.id))).toBe(7000);
    expect(net(await ledger(b.id))).toBe(1500);
  });

  it('conserva una línea histórica saldada a Q33.33 y distribuye Q66.67 solo entre las pendientes', async () => {
    const o = await order([30, 30, 30], { total: 100, tip: 20, discount: 10 });
    const items = [...o.items].sort((a, b) => a.id.localeCompare(b.id));
    const old = checked(await db.from('order_payments').insert({ restaurant_id: rid(), order_id: o.id, method: 'CASH', amount: 33.33,
      item_amounts: { [items[0].id]: 33.33 } }).select('*').single())!;
    checked(await db.from('table_splits').insert({ restaurant_id: rid(), table_number: 1, mode: 'byItem',
      people: [{ id: 'old', name: 'AUD histórico' }], assignment: { [items[0].id]: ['old'] }, paid: ['old'] }));
    const preview = await cobradoDeMesa(rid(), 1);
    expect(items.map((i: { id: string }) => preview.lineasPendientes?.[i.id])).toEqual([0, 33.34, 33.33]);
    success(await pay([items[1].id], 33.34));
    success(await pay([items[2].id], 33.33));
    expect(checked(await db.from('order_payments').select('*').eq('id', old.id).single())).toEqual(old);
    expect(net(await ledger(o.id))).toBe(10000);
  });

  it('una cuota fraccionada no se marca pagada antes de completar su centavo', async () => {
    const o = await order([30, 30, 30], { total: 100, tip: 20, discount: 10 });
    const items = [...o.items].sort((a, b) => a.id.localeCompare(b.id));
    success(await pay([items[0].id], 10));
    const preview = await cobradoDeMesa(rid(), 1);
    expect(preview.lineasPendientes?.[items[0].id]).toBe(23.34);
    expect(preview.lineasPagadas).not.toContain(items[0].id);
    success(await pay([items[0].id], 23.33));
    expect((await cobradoDeMesa(rid(), 1)).lineasPagadas).not.toContain(items[0].id);
    success(await pay([items[0].id], 0.01));
    expect((await cobradoDeMesa(rid(), 1)).lineasPagadas).toContain(items[0].id);
    for (const i of items.slice(1)) success(await pay([i.id], 33.33));
    expect(net(await ledger(o.id))).toBe(10000);
  });

  it('una línea gratuita no consume el residuo de las líneas cobrables', async () => {
    const o = await order([0, 1, 1], { total: 2.01, tip: 0.01 });
    const preview = await cobradoDeMesa(rid(), 1);
    expect(preview.lineasPendientes?.[o.items[0].id]).toBe(0);
    expect(o.items.slice(1).map((i: { id: string }) => preview.lineasPendientes![i.id]).sort()).toEqual([1, 1.01]);
    for (const i of o.items.slice(1)) success(await pay([i.id], preview.lineasPendientes![i.id]));
    expect(net(await ledger(o.id))).toBe(201);
  });

  it('no reconstruye el centavo de una cuenta histórica ya marcada saldada a Q99.99', async () => {
    const o = await order([30, 30, 30], { total: 100, tip: 20, discount: 10 });
    checked(await db.from('order_payments').insert(o.items.map((i: { id: string }) => ({ restaurant_id: rid(), order_id: o.id,
      method: 'CASH', amount: 33.33, item_amounts: { [i.id]: 33.33 } }))));
    checked(await db.from('table_splits').insert({ restaurant_id: rid(), table_number: 1, mode: 'byItem',
      people: [{ id: 'old', name: 'AUD histórico' }], assignment: Object.fromEntries(o.items.map((i: { id: string }) => [i.id, ['old']])), paid: ['old'] }));
    const before = await ledger(o.id);
    expect((await cobradoDeMesa(rid(), 1)).avisoCuotas).toMatch(/sin cambiar cobros anteriores/);
    expect((await pay([o.items[0].id], 0.01)).error).toMatch(/sin cambiar cobros anteriores/);
    expect(await ledger(o.id)).toEqual(before);
  });

  it('dos empleados no consumen dos veces la cuota que recibió el centavo', async () => {
    const o = await order([30, 30, 30], { total: 100, tip: 20, discount: 10 });
    const first = [...o.items].sort((a, b) => a.id.localeCompare(b.id))[0];
    const results = await Promise.all([actor(0, () => pay([first.id], 33.34)), actor(1, () => pay([first.id], 33.34))]);
    expect(results.filter((r) => !r.error)).toHaveLength(1);
    expect(net(await ledger(o.id))).toBe(3334);
  });

  it('los dos RPC de cuota y lectura son invoker y exclusivos del servicio', async () => {
    const { rows } = await sql.query("select prosecdef,has_function_privilege('anon',oid,'execute') anon,has_function_privilege('authenticated',oid,'execute') auth,has_function_privilege('service_role',oid,'execute') service from pg_proc where proname in ('leogin_cuotas_platos_pedido','leogin_saldos_platos_mesa')");
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row).toEqual({ prosecdef: false, anon: false, auth: false, service: true });
  });
});

describe('0.18 · pertenencia durable y cierre de caja coordinado', () => {
  const cerrar = (counts: Record<string, number> = {}) => closeCaja({ restaurantId: rid(), counts, openingFloat: 0, confirmPending: true });

  it.each(['guardar', 'descartar', 'abrir'] as const)('un %s desactualizado no reescribe un corte ya firmado', async (modo) => {
    if (modo === 'abrir') success(await saveCajaDraft({ restaurantId: rid(), counts: {}, openingFloat: 0 }));
    else success(await abrirTurno({ restaurantId: rid(), openingFloat: 0 }));
    let first: Awaited<ReturnType<typeof closeCaja>> | undefined;
    let guardado: Record<string, unknown> | undefined;
    state.beforeFetch = async (url, method) => {
      if (!first && method === 'PATCH' && url.pathname.endsWith('/cash_counts')) {
        first = await closeCaja({ restaurantId: rid(), counts: {}, openingFloat: 0, notes: 'AUD recibo firmado' });
        success(first);
        guardado = checked(await db.from('cash_counts').select('*').eq('id', first.result!.id).single())!;
      }
    };
    const result = modo === 'guardar' ? await saveCajaDraft({ restaurantId: rid(), counts: {}, openingFloat: 0 })
      : modo === 'descartar' ? await discardCajaDraft(rid()) : await abrirTurno({ restaurantId: rid(), openingFloat: 50 });
    state.beforeFetch = null;
    expect(first?.result).toBeDefined();
    expect(result.error).toMatch(/turno.*cerró/);
    expect(checked(await db.from('cash_counts').select('*').eq('id', first!.result!.id).single())).toEqual(guardado);
  });

  it('si gana el pago, la lectura del cierre espera su commit y lo incluye una vez', async () => {
    const o = await order([10]);
    success(await abrirTurno({ restaurantId: rid(), openingFloat: 0 }));
    await sql.query('begin');
    // La FK del firmante espera después del trigger de caja: el pago ya
    // conserva el bloqueo de caja pero todavía no ha confirmado su INSERT.
    const lock = await sql.query('select pg_backend_pid() pid,id from public.profiles where id=$1 for update', [state.users[0]]);
    const pago = pay([o.items[0].id], 10);
    let cierre: ReturnType<typeof cerrar> | undefined;
    let results;
    try {
      await waitForBlockedPayment(lock.rows[0].pid);
      const pagoPid = (await sql.query("select pid from pg_stat_activity where $1=any(pg_blocking_pids(pid)) and query ilike '%leogin_cobrar_parte_mesa%'", [lock.rows[0].pid])).rows[0].pid;
      cierre = cerrar({ bil_10: 1 });
      await waitForBlockedPayment(pagoPid);
    } finally {
      await sql.query('rollback');
      results = await Promise.all([pago, cierre]);
    }
    success(results[0]);
    expect(results[1]).toBeDefined();
    success(results[1]!);
    expect(results[1]!.result?.expected).toBe(10);
    expect((await period()).cuadre.efectivo).toBe(0);
    expect(net(await ledger(o.id))).toBe(1000);
  });

  it('un pago entre lectura y guardado rechaza el corte viejo sin modificar el turno', async () => {
    const o = await order([10, 10]);
    success(await abrirTurno({ restaurantId: rid(), openingFloat: 0 }));
    success(await pay([o.items[0].id], 10));
    let injected = false;
    state.beforeFetch = async (url, method) => {
      if (!injected && method === 'POST' && url.pathname.endsWith('/rpc/leogin_confirmar_cierre_caja_con_recibo')) {
        injected = true;
        success(await pay([o.items[1].id], 10));
      }
    };
    expect((await cerrar({ bil_10: 1 })).error).toMatch(/caja cambió/);
    state.beforeFetch = null;
    expect(injected).toBe(true);
    expect(checked(await db.from('cash_counts').select('status').eq('restaurant_id', rid()))).toEqual([{ status: 'OPEN' }]);
    const result = await cerrar({ bil_20: 1 });
    success(result);
    expect(result.result?.expected).toBe(20);
    expect(net(await ledger(o.id))).toBe(2000);
  });

  it('dos aparatos sobre la misma lectura no guardan dos cortes del turno', async () => {
    const o = await order([10]);
    success(await abrirTurno({ restaurantId: rid(), openingFloat: 0 }));
    success(await pay([o.items[0].id], 10));
    const gate = deferred();
    let readers = 0;
    state.beforeFetch = async (url, method) => {
      if (method === 'POST' && url.pathname.endsWith('/rpc/leogin_contexto_caja')) {
        if (++readers === 2) gate.resolve();
        await bounded(gate.promise);
      }
    };
    const results = await Promise.all([actor(0, () => cerrar({ bil_10: 1 })), actor(1, () => cerrar({ bil_10: 1 }))]);
    state.beforeFetch = null;
    expect(readers).toBe(2);
    expect(results.filter((r) => r.result)).toHaveLength(1);
    expect(results.filter((r) => r.error)).toHaveLength(1);
    expect(checked(await db.from('cash_counts').select('expected_cash').eq('restaurant_id', rid()).eq('status', 'CLOSED'))).toEqual([{ expected_cash: 10 }]);
  });

  it('una devolución después del corte no reescribe su recibo y pertenece al siguiente', async () => {
    const o = await order([10]);
    success(await pay([o.items[0].id], 10));
    success(await freeTable(rid(), 1));
    const first = await cerrar({ bil_10: 1 });
    success(first);
    const guardado = checked(await db.from('cash_counts').select('*').eq('id', first.result!.id).single());
    success(await devolverCobro({ restaurantId: rid(), orderId: o.id, reason: 'AUD devolución después del corte protegido' }));
    expect((await period()).cuadre.efectivo).toBe(-10);
    const second = await cerrar();
    success(second);
    expect(second.result?.expected).toBe(-10);
    expect(second.result?.refundsCash).toBe(10);
    expect(checked(await db.from('cash_counts').select('*').eq('id', first.result!.id).single())).toEqual(guardado);
    expect((await period()).cuadre.efectivo).toBe(0);
  });

  it('un fallo al ligar gastos revierte el corte en la misma transacción', async () => {
    success(await abrirTurno({ restaurantId: rid(), openingFloat: 0 }));
    const gasto = checked(await db.from('cash_expenses').insert({ restaurant_id: rid(), business_date: '2026-11-05', concept: 'AUD gasto', amount: 1 }).select('*').single())!;
    const l = await period();
    const before = checked(await db.from('cash_counts').select('*').eq('id', l.abierto!.id).single());
    const result = await db.rpc('leogin_confirmar_cierre_caja', { p_restaurant: rid(), p_revision: l.controlCaja!.revision,
      p_ultimo: l.controlCaja!.ultimoCierreId, p_hasta: l.hasta, p_abierto: l.abierto!.id,
      p_fila: { business_date: l.dia, opening_float: 0, expected_cash: 0, counted_cash: 0, difference: 1,
        by_method: {}, denomination_breakdown: {}, status: 'CLOSED', expenses_total: 1, tips_total: 0,
        period_start: l.desde, closed_at: l.hasta }, p_gastos: [gasto.id, gasto.id], p_actor: state.users[0] });
    expect(result.error?.message).toMatch(/gastos cambiaron/);
    expect(checked(await db.from('cash_counts').select('*').eq('id', l.abierto!.id).single())).toEqual(before);
    expect(checked(await db.from('cash_expenses').select('*').eq('id', gasto.id).single())).toEqual(gasto);
  });

  it('una entrega sin filas que confirma después del corte queda en el periodo siguiente', async () => {
    const o = await order([10]);
    checked(await db.from('orders').update({ order_type: 'PICKUP' }).eq('id', o.id));
    success(await abrirTurno({ restaurantId: rid(), openingFloat: 0 }));
    await sql.query('begin');
    const lock = await sql.query('select pg_backend_pid() pid,id from public.orders where id=$1 for update', [o.id]);
    const antes = (await sql.query('select clock_timestamp() ahora')).rows[0].ahora.toISOString();
    const entrega = db.from('orders').update({ status: 'DELIVERED', delivered_at: antes }).eq('id', o.id).then(checked);
    let close: Awaited<ReturnType<typeof cerrar>>;
    try {
      await waitForBlockedPayment(lock.rows[0].pid);
      close = await cerrar();
      success(close);
    } finally { await sql.query('rollback'); await entrega; }
    expect(close!.result?.expected).toBe(0);
    const next = await period();
    expect(next.cuadre.efectivo).toBe(10);
    expect(next.cuadre.cobrado).toBe(10);
    expect(next.cobros.find((c) => c.orderId === o.id)!.at > close!.result!.closedAt).toBe(true);
    expect(await ledger(o.id)).toEqual([]);
    const second = await cerrar({ bil_10: 1 });
    success(second);
    expect(second.result?.expected).toBe(10);
    expect((await period()).cuadre.efectivo).toBe(0);
  });

  it('el cuadre y el corte incluyen más de mil movimientos sin truncarlos', async () => {
    const o = await order([20]);
    checked(await db.from('order_payments').insert(Array.from({ length: 1200 }, () => ({ restaurant_id: rid(), order_id: o.id, method: 'CASH', amount: 0.01 }))));
    const l = await period();
    expect(l.cuadre.efectivo).toBe(12);
    expect(l.pendientes.total).toBe(8);
    const close = await cerrar({ bil_10: 1, mon_1: 2 });
    success(close);
    expect(close.result?.expected).toBe(12);
    expect((await period()).cuadre.efectivo).toBe(0);
  });

  it('la nueva marca conserva la ventana de negocio sin arrastrar dinero o gastos del día anterior', async () => {
    const o = await order([10]);
    success(await pay([o.items[0].id], 10));
    const gasto = checked(await db.from('cash_expenses').insert({ restaurant_id: rid(), business_date: '2026-11-04', concept: 'AUD día previo', amount: 1 }).select('id').single())!;
    // Fixture de un registro operativo previo al inicio, sin tocar created_at.
    await sql.query("update public.order_payments set caja_registrado_en='2026-11-05T10:59:59.999Z' where order_id=$1", [o.id]);
    await sql.query("update public.cash_expenses set caja_registrado_en='2026-11-05T10:59:59.999Z' where id=$1", [gasto.id]);
    const anterior = await period(new Date('2026-11-05T10:59:59.999Z'));
    const actual = await period(new Date('2026-11-05T12:00:00Z'));
    expect(anterior.cuadre.efectivo).toBe(10);
    expect(anterior.gastosTotal).toBe(1);
    expect(actual.cuadre.efectivo).toBe(0);
    expect(actual.gastosTotal).toBe(0);
  });

  it('una escritura de sesión autorizada invalida el corte sin dar acceso a caja_control', async () => {
    const o = await order([10]);
    checked(await db.from('profiles').update({ restaurant_id: rid() }).eq('id', state.users[0]));
    const before = await period();
    await sql.query('begin');
    try {
      await sql.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: state.users[0], role: 'authenticated', aal: 'aal2' })]);
      await sql.query('set local role authenticated');
      const updated = await sql.query("update public.orders set status='PREP' where id=$1 returning id", [o.id]);
      expect(updated.rowCount).toBe(1);
      await sql.query('reset role');
      const version = await sql.query('select revision from public.caja_control where restaurant_id=$1', [rid()]);
      expect(Number(version.rows[0].revision)).toBeGreaterThan(before.controlCaja!.revision);
    } finally { await sql.query('rollback'); }
  });

  it('RPC y control de caja no son accesibles a clientes; se conserva el candado MFA', async () => {
    const { rows } = await sql.query("select proname,has_function_privilege('anon',oid,'execute') anon,has_function_privilege('authenticated',oid,'execute') auth,has_function_privilege('service_role',oid,'execute') service from pg_proc where proname in ('leogin_contexto_caja','leogin_registrar_cambio_caja','leogin_leer_periodo_caja','leogin_confirmar_cierre_caja')");
    expect(rows).toHaveLength(4);
    for (const row of rows) expect(row).toMatchObject({ anon: false, auth: false, service: true });
    const table = await sql.query("select has_table_privilege('authenticated','public.caja_control','SELECT,INSERT,UPDATE,DELETE') auth,has_table_privilege('anon','public.caja_control','SELECT,INSERT,UPDATE,DELETE') anon, exists(select 1 from pg_policy where polrelid='public.caja_control'::regclass and polname='super_admin_segundo_factor' and not polpermissive) mfa");
    expect(table.rows[0]).toEqual({ auth: false, anon: false, mfa: true });
  });
});
