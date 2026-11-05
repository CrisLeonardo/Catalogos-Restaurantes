import { beforeEach, describe, expect, it, vi } from 'vitest';

/* ── Contexto ─────────────────────────────────────────────────────
   AUDITORIA_SALIDA_PRODUCCION_2026-10-09: tres acciones de pedidos que
   hacían algo sensato en la prueba de una sola persona y algo mal cuando
   dos cosas pasaban a la vez, o cuando quien pulsaba no tenía restaurante
   «de casa» en su perfil. Se prueban con un doble de Supabase que anota
   cada consulta (tabla, operación, filtros) y contesta lo que el caso
   necesita: lo que importa aquí es QUÉ se le pide a la base, no la base. */

interface Consulta {
  tabla: string;
  op: 'select' | 'update' | 'insert' | 'delete' | 'rpc';
  valores?: unknown;
  filtros: [string, string, unknown][];
}

type Responder = (c: Consulta) => { data?: unknown; error?: unknown } | undefined;

function dobleDeSupabase(responder: Responder) {
  const consultas: Consulta[] = [];
  const contestar = (c: Consulta) => Promise.resolve({ data: null, error: null, ...(responder(c) ?? {}) });

  const from = (tabla: string) => {
    const c: Consulta = { tabla, op: 'select', filtros: [] };
    const cadena: Record<string, unknown> = {};
    const filtro = (tipo: string) => (col: string, val: unknown, extra?: unknown) => {
      c.filtros.push([tipo, col, extra === undefined ? val : [val, extra]]);
      return cadena;
    };
    for (const f of ['eq', 'neq', 'in', 'gte', 'lte', 'is']) cadena[f] = filtro(f);
    cadena.not = (col: string, op: string, val: unknown) => { c.filtros.push(['not', col, [op, val]]); return cadena; };
    cadena.order = () => cadena;
    cadena.limit = () => cadena;
    cadena.select = () => cadena;
    cadena.update = (v: unknown) => { c.op = 'update'; c.valores = v; consultas.push(c); return cadena; };
    cadena.insert = (v: unknown) => { c.op = 'insert'; c.valores = v; consultas.push(c); return cadena; };
    cadena.delete = () => { c.op = 'delete'; consultas.push(c); return cadena; };
    cadena.single = () => { if (c.op === 'select') consultas.push(c); return contestar(c); };
    cadena.maybeSingle = cadena.single;
    cadena.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => {
      if (c.op === 'select' && !consultas.includes(c)) consultas.push(c);
      return contestar(c).then(ok, ko);
    };
    return cadena;
  };

  const rpc = (nombre: string, args: unknown) => {
    const c: Consulta = { tabla: nombre, op: 'rpc', valores: args, filtros: [] };
    consultas.push(c);
    return contestar(c);
  };

  return { cliente: { from, rpc }, consultas };
}

/* ── Dobles de los módulos con efectos ───────────────────────────── */
const h = vi.hoisted(() => ({
  sesion: null as unknown as ReturnType<typeof dobleDeSupabase>,
  servicio: null as unknown as ReturnType<typeof dobleDeSupabase>,
  pendientes: [] as (() => unknown)[],
}));

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()), cookies: vi.fn() }));
vi.mock('next/server', () => ({ after: (fn: () => unknown) => { h.pendientes.push(fn); } }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => h.sesion.cliente),
  createDinerClient: vi.fn(async () => h.sesion.cliente),
  getStaffUser: vi.fn(async () => ({ data: { user: { id: 'u-1' } } })),
}));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn(() => h.servicio.cliente) }));
vi.mock('@/lib/salon-cache', () => ({ revalidarSalon: vi.fn() }));
vi.mock('@/lib/activity', () => ({ logActivity: vi.fn(async () => {}) }));
vi.mock('@/lib/print-agent', () => ({
  enqueueKitchenForOrder: vi.fn(async () => {}),
  enqueueReceiptForOrder: vi.fn(async () => {}),
  enqueueSplitBillTicket: vi.fn(async () => {}),
}));
vi.mock('@/lib/actions/loyalty', () => ({
  awardLoyaltyForOrder: vi.fn(async () => {}),
  maybeAwardSignupBonus: vi.fn(async () => {}),
}));
vi.mock('@/lib/whatsapp/notify', () => ({ notifyOrderStatus: vi.fn(async () => {}) }));
vi.mock('@/lib/actions/fel', () => ({ emitirFacturaAutomatica: vi.fn(async () => {}) }));
vi.mock('@/lib/push', () => ({ sendPushToRestaurant: vi.fn(async () => {}) }));
vi.mock('@/lib/auth/table-access', () => ({
  assertTableAccess: vi.fn(async () => ({ actor: { userId: 'u-1' } })),
}));
vi.mock('@/lib/db/table-sessions', () => ({
  cerrarTurnoDeMesa: vi.fn(async () => {}),
  hayPagosDeMesa: vi.fn(async () => true),
}));
vi.mock('@/lib/db/mesa-columna', () => ({
  hayColumnaMesa: vi.fn(async () => true),
  direccionDeMesa: (n: number) => `Mesa ${n}`,
}));

import { cancelPublicOrder, freeTable, updateOrderStatus } from './orders';
import { cobrarParteDeMesa } from './servicio';
import { assertTableAccess } from '@/lib/auth/table-access';
import { logActivity } from '@/lib/activity';
import { enqueueKitchenForOrder } from '@/lib/print-agent';
import { awardLoyaltyForOrder } from '@/lib/actions/loyalty';
import { emitirFacturaAutomatica } from '@/lib/actions/fel';

const RID = '11111111-1111-4111-8111-111111111111';
const CASA = '99999999-9999-4999-8999-999999999999';
const TOKEN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

beforeEach(() => {
  vi.clearAllMocks();
  h.pendientes = [];
});

async function correrPendientes() {
  for (const fn of h.pendientes) await fn();
}

describe('updateOrderStatus usa el restaurante del pedido (PROD-08)', () => {
  function montar(perfilRid: string | null) {
    h.sesion = dobleDeSupabase((c) => {
      if (c.tabla === 'profiles') return { data: { role: 'RESTAURANT_OWNER', restaurant_id: perfilRid } };
      if (c.tabla === 'orders' && c.op === 'update') return { data: [{ id: 'o-1', restaurant_id: RID }] };
    });
    h.servicio = dobleDeSupabase(() => undefined);
  }

  it('dueño registrado solo (perfil sin restaurante): la bitácora sí se escribe', async () => {
    montar(null);
    expect(await updateOrderStatus('o-1', 'PREP')).toEqual({});
    expect(enqueueKitchenForOrder).toHaveBeenCalledWith(RID, 'o-1');
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ restaurantId: RID, action: 'order_status' }));
  });

  it('operando su segundo local: comanda, puntos, factura y bitácora van al del pedido', async () => {
    montar(CASA);
    await updateOrderStatus('o-1', 'PREP');
    expect(enqueueKitchenForOrder).toHaveBeenCalledWith(RID, 'o-1');

    await updateOrderStatus('o-1', 'DELIVERED');
    await correrPendientes();
    expect(awardLoyaltyForOrder).toHaveBeenCalledWith(RID, 'o-1');
    expect(emitirFacturaAutomatica).toHaveBeenCalledWith(RID, 'o-1');
    for (const [arg] of vi.mocked(logActivity).mock.calls) {
      expect(arg.restaurantId).toBe(RID);
    }
  });

  it('si el pedido ya estaba en ese estado no repite efectos', async () => {
    h.sesion = dobleDeSupabase((c) => {
      if (c.tabla === 'profiles') return { data: { role: 'RESTAURANT_OWNER', restaurant_id: CASA } };
      if (c.tabla === 'orders' && c.op === 'update') return { data: [] };
    });
    await updateOrderStatus('o-1', 'PREP');
    expect(enqueueKitchenForOrder).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
  });
});

describe('freeTable confirma el snapshot en una transacción (0.14)', () => {
  function montar(rpc: { data?: unknown; error?: unknown }) {
    h.sesion = dobleDeSupabase(() => undefined);
    h.servicio = dobleDeSupabase((c) => {
      if (c.tabla === 'orders' && c.op === 'select') return { data: [{ id: 'o-1', total: 60 }, { id: 'o-2', total: 40 }] };
      if (c.tabla === 'leogin_cerrar_saldo_mesa') return rpc;
    });
  }
  it('envía únicamente los pedidos leídos y difiere FEL para los confirmados', async () => {
    montar({ data: { intentoId: TOKEN, cobrado: 100, paymentIds: ['p-1'], orderIds: ['o-1', 'o-2'] } });
    expect(await freeTable(RID, 4, { method: 'CASH' }, TOKEN)).toMatchObject({ intentoId: TOKEN, cobrado: 100 });
    const args = h.servicio.consultas.find((c) => c.tabla === 'leogin_cerrar_saldo_mesa')!.valores as {
      p_orders: string[]; p_pagos: { method: string }[];
    };
    expect(args.p_orders).toEqual(['o-1', 'o-2']);
    expect(args.p_pagos).toEqual([{ method: 'CASH' }]);
    await correrPendientes();
    expect(emitirFacturaAutomatica).toHaveBeenCalledWith(RID, 'o-1');
    expect(emitirFacturaAutomatica).toHaveBeenCalledWith(RID, 'o-2');
  });
  it('un conflicto no escribe dinero fuera del RPC ni programa facturación', async () => {
    montar({ error: { code: 'LGD01', message: 'La cuenta cambió.' } });
    expect(await freeTable(RID, 4, { method: 'CASH' }, TOKEN)).toEqual({ error: 'La cuenta cambió.', incierto: false });
    expect(h.servicio.consultas.some((c) => c.op === 'insert' || c.op === 'update')).toBe(false);
    expect(h.pendientes).toEqual([]);
  });
  it('sin la migración 163 no vuelve al cierre inseguro anterior', async () => {
    montar({ error: { code: 'PGRST202', message: 'Could not find the function' } });
    expect((await freeTable(RID, 4, { method: 'CARD' }, TOKEN)).error).toMatch(/migración 163/);
    expect(h.servicio.consultas.some((c) => c.op === 'insert' || c.op === 'update')).toBe(false);
  });
  it('recupera antes de leer una mesa reutilizada y devuelve el resultado guardado', async () => {
    const original = { intentoId: TOKEN, cobrado: 100, paymentIds: ['p-original'], orderIds: ['o-original'] };
    h.servicio = dobleDeSupabase((c) => c.tabla === 'leogin_recuperar_intento_cobro' ? { data: original } : undefined);
    expect(await freeTable(RID, 4, { method: 'CARD', amount: 100 }, TOKEN)).toEqual(original);
    expect(h.servicio.consultas.map((c) => c.tabla)).toEqual(['leogin_recuperar_intento_cobro']);
    expect(h.pendientes).toEqual([]);
  });
  it('sin la recuperación de la 161 no vuelve a leer ni intenta cobrar', async () => {
    h.servicio = dobleDeSupabase(() => ({ error: { code: 'PGRST202', message: 'Could not find the function' } }));
    expect((await freeTable(RID, 4, { method: 'CARD', amount: 100 }, TOKEN)).error).toMatch(/migración 161/);
    expect(h.servicio.consultas.map((c) => c.tabla)).toEqual(['leogin_recuperar_intento_cobro']);
  });
});

describe('cobro parcial conserva el límite de autorización (0.14)', () => {
  it('una petición sin identidad se rechaza sin tocar la base', async () => {
    h.servicio = dobleDeSupabase(() => undefined);
    expect((await cobrarParteDeMesa(RID, 1, ['i-1'], [{ method: 'CARD', amount: 10 }], '')).error).toMatch(/identidad/);
    expect((await freeTable(RID, 1, { method: 'CARD', amount: 10 })).error).toMatch(/identidad/);
    expect(h.servicio.consultas).toEqual([]);
  });
  it('una respuesta de transporte incierta conserva la identidad para recuperarla', async () => {
    h.servicio = dobleDeSupabase(() => ({ error: { code: '', message: 'Failed to fetch' } }));
    expect(await cobrarParteDeMesa(RID, 1, ['i-1'], [{ method: 'CARD', amount: 10 }], TOKEN))
      .toEqual({ error: 'Failed to fetch', incierto: true });
    expect(h.servicio.consultas[0]).toMatchObject({ tabla: 'leogin_cobrar_parte_mesa_idempotente', valores: { p_intento: TOKEN } });
  });
  it('sin sesión autorizada no invoca la base ni el RPC', async () => {
    vi.mocked(assertTableAccess).mockResolvedValueOnce({ error: 'No autorizado.' });
    h.servicio = dobleDeSupabase(() => undefined);
    expect(await cobrarParteDeMesa(RID, 1, ['i-1'], [{ method: 'CASH', amount: 10 }], TOKEN)).toEqual({ error: 'No autorizado.' });
    expect(h.servicio.consultas).toEqual([]);
  });
  it('sin la migración 161 rechaza antes de recurrir a escrituras separadas', async () => {
    h.servicio = dobleDeSupabase((c) => c.op === 'rpc'
      ? { error: { code: 'PGRST202', message: 'Could not find the function' } } : undefined);
    const result = await cobrarParteDeMesa(RID, 1, ['i-1'], [{ method: 'CARD', amount: 10 }], TOKEN);
    expect(result).toMatchObject({ needsMigration: true });
    expect(result.error).toMatch(/migración 161/);
    expect(h.servicio.consultas.some((c) => c.op === 'insert' || c.op === 'update')).toBe(false);
  });
});

describe('cancelPublicOrder no pisa la confirmación de cocina (PROD-09)', () => {
  function montar(rpc: { data?: unknown; error?: unknown }) {
    h.sesion = dobleDeSupabase(() => undefined);
    h.servicio = dobleDeSupabase((c) => {
      if (c.tabla === 'orders' && c.op === 'select') return { data: { id: 'o-1', status: 'NEW', restaurant_id: RID } };
      if (c.tabla === 'cancel_public_order') return rpc;
    });
  }
  const rpcs = () => h.servicio.consultas.filter((c) => c.op === 'rpc').map((c) => c.tabla);
  const updates = () => h.servicio.consultas.filter((c) => c.tabla === 'orders' && c.op === 'update');

  it('cancela y repone de una vez, en la base (migración 143)', async () => {
    montar({ data: true });
    expect(await cancelPublicOrder(TOKEN, RID)).toEqual({ success: true });
    expect(rpcs()).toEqual(['cancel_public_order']);
    expect(h.servicio.consultas.find((c) => c.op === 'rpc')!.valores).toEqual({ p_order_id: 'o-1', p_restaurant_id: RID });
    expect(updates()).toHaveLength(0);
  });

  it('si cocina aceptó en ese segundo: no cancela ni repone stock', async () => {
    montar({ data: false });
    const res = await cancelPublicOrder(TOKEN, RID);
    expect(res.error).toMatch(/confirmado/);
    expect(rpcs()).not.toContain('restock_order');
    expect(updates()).toHaveLength(0);
  });

  it('sin la 143 en la base vuelve al camino de antes', async () => {
    montar({ error: { code: 'PGRST202', message: 'Could not find the function' } });
    expect(await cancelPublicOrder(TOKEN, RID)).toEqual({ success: true });
    expect(rpcs()).toEqual(['cancel_public_order', 'restock_order']);
    expect(updates()).toHaveLength(1);
  });
});
