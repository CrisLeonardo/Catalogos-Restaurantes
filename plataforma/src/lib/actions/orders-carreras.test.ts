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

const filtro = (c: Consulta, tipo: string, col: string) =>
  c.filtros.find(([t, k]) => t === tipo && k === col)?.[2];

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
import { logActivity } from '@/lib/activity';
import { enqueueKitchenForOrder } from '@/lib/print-agent';
import { awardLoyaltyForOrder } from '@/lib/actions/loyalty';
import { emitirFacturaAutomatica } from '@/lib/actions/fel';
import { cerrarTurnoDeMesa } from '@/lib/db/table-sessions';

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
