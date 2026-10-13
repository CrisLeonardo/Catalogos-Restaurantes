/**
 * LEER EL TURNO DE CAJA DESDE LA BASE
 * ------------------------------------------------------------
 * Migración 145. Todo lo que la pantalla de Caja, el cierre y las
 * correcciones necesitan saber del turno abierto, en un solo sitio:
 *
 *   · el turno abierto (si lo hay) y el último cierre;
 *   · desde cuándo cuenta el cuadre (`inicioDelPeriodo`);
 *   · el libro de cobros de ese periodo (`cuadrarPeriodo`);
 *   · los cobros pedido por pedido, para poder corregirlos;
 *   · gastos y propinas del periodo;
 *   · lo que queda sin cobrar (mesas abiertas, domicilios, para llevar).
 *
 * Sin `'use server'`: nada de aquí es una acción. Lo llaman las acciones
 * de `lib/actions/finanzas.ts` y `lib/actions/caja-correcciones.ts`
 * después de validar quién pregunta.
 */

import type { createServiceClient } from '@/lib/supabase/service';
import { faltaLaColumna, faltaLaMigracion } from '@/lib/db/migracion-ausente';
import { etiquetaDeMesa, mesaDeFila } from '@/lib/mesa';
import { diaDeNegocio } from './dia';
import {
  cuadrarPeriodo, inicioDelPeriodo, netoPorMetodo,
  type CuadreDelPeriodo, type Movimiento, type PedidoSinFilas, type ClaseMovimiento,
} from './libro';

type Db = ReturnType<typeof createServiceClient>;

const cent = (n: number) => Math.round(n * 100) / 100;

/** El turno abierto (o el cierre a medias de antes de la 145). */
export interface TurnoAbierto {
  id: string;
  openedAt: string | null;
  openedByName: string | null;
  openingFloat: number;
  shiftLabel: string | null;
  /** Lo que se dejó contado con «Guardar y seguir después». */
  draft: {
    counts: Record<string, number>;
    notes: string | null;
    tips: unknown;
    savedAt: string;
  } | null;
}

export interface UltimoCierre {
  id: string;
  closedAt: string;
  cashierName: string | null;
  shiftLabel: string | null;
}

/** Un pedido cobrado en el turno, para la lista de «Cobros de este turno». */
export interface CobroDelTurno {
  orderId: string;
  orderNumber: string;
  /** «Mesa 4», «Para llevar · Ana», «Domicilio · Calle 5». */
  label: string;
  orderType: string;
  tableNumber: number | null;
  /** Cuándo entró el dinero (el primer cobro del periodo). */
  at: string;
  total: number;
  /** Neto por método de TODO el pedido, con sus correcciones. */
  neto: Record<string, number>;
  devuelto: number;
  /** Se le cambió el método de pago. */
  corregido: boolean;
  /** La mesa se reabrió: su cobro se compensó y volvió al salón. */
  reabierta: boolean;
  /** Se puede reabrir: mesa cerrada en este turno y la mesa sigue libre. */
  reabrible: boolean;
  /** Mesa liberada sin cobrar (no hay dinero que corregir). */
  sinCobrar: boolean;
}

export interface Pendientes {
  mesas: { tableNumber: number; label: string; pedidos: number; porCobrar: number }[];
  domicilios: { orderId: string; orderNumber: string; total: number; status: string }[];
  paraLlevar: { orderId: string; orderNumber: string; total: number; status: string }[];
  total: number;
}

export interface PropinaPorPersona {
  profileId: string | null;
  name: string;
  tables: number;
  amount: number;
}

export interface LecturaDelTurno {
  /** Día de negocio del turno (YYYY-MM-DD). */
  dia: string;
  desde: string;
  hasta: string;
  abierto: TurnoAbierto | null;
  ultimoCierre: UltimoCierre | null;
  cuadre: CuadreDelPeriodo;
  cobros: CobroDelTurno[];
  gastos: { id: string; concept: string; amount: number; paid_by: string | null; receipt_url: string | null; notes: string | null; created_at: string }[];
  gastosTotal: number;
  propinas: PropinaPorPersona[];
  propinasTotal: number;
  pendientes: Pendientes;
  /** La 145 no ha corrido en esta base: no hay turnos ni correcciones. */
  sinMigracion: boolean;
}

/** El turno abierto. Lee también los DRAFT de antes de la 145. */
export async function turnoAbierto(db: Db, restaurantId: string): Promise<{ turno: TurnoAbierto | null; sinMigracion: boolean }> {
  const { data, error } = await db
    .from('cash_counts')
    .select('id, status, opened_at, opened_by_name, opening_float, shift_label, denomination_breakdown, notes, tips_distribution, draft_saved_at, created_at')
    .eq('restaurant_id', restaurantId)
    .in('status', ['OPEN', 'DRAFT'])
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) return { turno: null, sinMigracion: faltaLaMigracion(error) };
  const r = (data ?? [])[0] as Record<string, unknown> | undefined;
  if (!r) return { turno: null, sinMigracion: false };
  const guardado = (r.draft_saved_at as string | null) ?? (r.status === 'DRAFT' ? (r.created_at as string) : null);
  return {
    sinMigracion: false,
    turno: {
      id: r.id as string,
      openedAt: (r.opened_at as string | null) ?? null,
      openedByName: (r.opened_by_name as string | null) ?? null,
      openingFloat: Number(r.opening_float ?? 0),
      shiftLabel: (r.shift_label as string | null) ?? null,
      draft: guardado
        ? {
            counts: (r.denomination_breakdown as Record<string, number> | null) ?? {},
            notes: (r.notes as string | null) ?? null,
            tips: r.tips_distribution ?? null,
            savedAt: guardado,
          }
        : null,
    },
  };
}

/** El último corte cerrado (no anulado). */
export async function ultimoCierre(db: Db, restaurantId: string): Promise<UltimoCierre | null> {
  const { data, error } = await db
    .from('cash_counts')
    .select('id, closed_at, created_at, cashier_name, shift_label')
    .eq('restaurant_id', restaurantId)
    .eq('status', 'CLOSED')
    .order('closed_at', { ascending: false, nullsFirst: false })
    .limit(1);
  if (error) return null;
  const r = (data ?? [])[0] as Record<string, unknown> | undefined;
  if (!r) return null;
  return {
    id: r.id as string,
    closedAt: ((r.closed_at as string | null) ?? (r.created_at as string)),
    cashierName: (r.cashier_name as string | null) ?? null,
    shiftLabel: (r.shift_label as string | null) ?? null,
  };
}

type FilaPago = { id: string; order_id: string; method: string; amount: number | string; kind?: string | null; created_at: string };

/** Las filas de `order_payments` de unos pedidos, cualquiera sea su fecha. */
export async function filasDePedidos(db: Db, restaurantId: string, orderIds: string[]): Promise<FilaPago[]> {
  if (orderIds.length === 0) return [];
  const out: FilaPago[] = [];
  for (let i = 0; i < orderIds.length; i += 300) {
    const trozo = orderIds.slice(i, i + 300);
    let res = await db
      .from('order_payments')
      .select('id, order_id, method, amount, kind, created_at')
      .eq('restaurant_id', restaurantId)
      .in('order_id', trozo);
    if (res.error && faltaLaColumna(res.error)) {
      res = await db
        .from('order_payments')
        .select('id, order_id, method, amount, created_at')
        .eq('restaurant_id', restaurantId)
        .in('order_id', trozo) as typeof res;
    }
    out.push(...((res.data ?? []) as FilaPago[]));
  }
  return out;
}

const aMovimiento = (f: FilaPago): Movimiento => ({
  id: f.id,
  orderId: f.order_id,
  method: f.method,
  amount: Number(f.amount),
  kind: ((f.kind as ClaseMovimiento | null) ?? 'PAYMENT'),
  at: f.created_at,
});

type FilaPedido = {
  id: string; order_number: string | null; order_type: string; status: string;
  payment_method: string | null; total: number | string; tip: number | string | null;
  delivered_at: string | null; created_at: string; address: string | null;
  table_number?: number | null; customer_name: string | null; waiter_id: string | null;
  waiter?: { full_name: string | null } | null;
};

const COLS_PEDIDO = 'id, order_number, order_type, status, payment_method, total, tip, delivered_at, created_at, address, table_number, customer_name, waiter_id, waiter:profiles!orders_waiter_id_fkey(full_name)';

async function pedidos(db: Db, q: (cols: string) => PromiseLike<{ data: unknown; error: { code?: string } | null }>): Promise<FilaPedido[]> {
  let res = await q(COLS_PEDIDO);
  if (res.error && faltaLaColumna(res.error)) res = await q(COLS_PEDIDO.replace(', table_number', ''));
  return ((res.data ?? []) as FilaPedido[]);
}

function etiqueta(o: FilaPedido): string {
  if (o.order_type === 'DINE_IN') return etiquetaDeMesa(o);
  const nombre = o.customer_name?.trim();
  if (o.order_type === 'DELIVERY') return nombre ? `Domicilio · ${nombre}` : 'Domicilio';
  return nombre ? `Para llevar · ${nombre}` : 'Para llevar';
}

/**
 * Todo el turno, leído de la base.
 *
 * `hasta` es ahora: el cierre fija `closed_at` a este mismo instante, así
 * que lo que se cobre un segundo después ya es del turno siguiente.
 */
export async function leerTurno(db: Db, opts: {
  restaurantId: string;
  timezone: string;
  corteMin: number;
  ahora?: Date;
}): Promise<LecturaDelTurno> {
  const { restaurantId, timezone, corteMin } = opts;
  const ahora = opts.ahora ?? new Date();

  const [{ turno, sinMigracion }, cierre] = await Promise.all([
    turnoAbierto(db, restaurantId),
    ultimoCierre(db, restaurantId),
  ]);

  const desde = inicioDelPeriodo({
    ultimoCierre: cierre ? new Date(cierre.closedAt) : null,
    abiertoEn: turno?.openedAt ? new Date(turno.openedAt) : null,
    ahora,
    timezone,
    corteMin,
  });
  const desdeIso = desde.toISOString();
  const hastaIso = ahora.toISOString();
  const dia = diaDeNegocio(turno?.openedAt ? new Date(turno.openedAt) : ahora, timezone, corteMin);

  /* ── 1. El dinero que entró y salió en el periodo ── */
  let filasDelPeriodo: FilaPago[] = [];
  {
    let res = await db
      .from('order_payments')
      .select('id, order_id, method, amount, kind, created_at')
      .eq('restaurant_id', restaurantId)
      .gt('created_at', desdeIso)
      .lte('created_at', hastaIso)
      .limit(5000);
    if (res.error && faltaLaColumna(res.error)) {
      res = await db
        .from('order_payments')
        .select('id, order_id, method, amount, created_at')
        .eq('restaurant_id', restaurantId)
        .gt('created_at', desdeIso)
        .lte('created_at', hastaIso)
        .limit(5000) as typeof res;
    }
    filasDelPeriodo = (res.data ?? []) as FilaPago[];
  }

  /* ── 2. Los pedidos entregados en el periodo ── */
  const entregados = await pedidos(db, (cols) => db
    .from('orders')
    .select(cols)
    .eq('restaurant_id', restaurantId)
    .eq('status', 'DELIVERED')
    .gt('delivered_at', desdeIso)
    .lte('delivered_at', hastaIso)
    .limit(5000));

  /* Un pedido entregado usa sus filas si tiene ALGUNA, de cuando sea: un
     domicilio que se entregó hoy y se cobró por partes ayer no puede contar
     dos veces. */
  const filasDeEntregados = await filasDePedidos(db, restaurantId, entregados.map((o) => o.id));
  const conFilas = new Set(filasDeEntregados.map((f) => f.order_id));
  const sinFilas: PedidoSinFilas[] = entregados
    .filter((o) => !conFilas.has(o.id))
    .map((o) => ({
      orderId: o.id,
      orderType: o.order_type,
      method: o.payment_method ?? 'CASH',
      total: Number(o.total ?? 0),
      at: o.delivered_at as string,
    }));

  const movimientos = filasDelPeriodo.map(aMovimiento);
  const cuadre = cuadrarPeriodo(movimientos, sinFilas);

  /* ── 3. Los cobros, pedido por pedido ── */
  const idsConMovimiento = [...new Set(movimientos.map((m) => m.orderId))];
  const faltanDatos = idsConMovimiento.filter((id) => !entregados.some((o) => o.id === id));
  const otros = faltanDatos.length === 0 ? [] : await pedidos(db, (cols) => db
    .from('orders').select(cols).eq('restaurant_id', restaurantId).in('id', faltanDatos.slice(0, 1000)));
  const porId = new Map<string, FilaPedido>([...entregados, ...otros].map((o) => [o.id, o]));

  const todasLasFilas = await filasDePedidos(db, restaurantId, idsConMovimiento);
  const filasPorPedido = new Map<string, Movimiento[]>();
  for (const f of todasLasFilas) {
    const lista = filasPorPedido.get(f.order_id) ?? [];
    lista.push(aMovimiento(f));
    filasPorPedido.set(f.order_id, lista);
  }

  /* ¿Qué mesas están ocupadas ahora? Una mesa cobrada por error no se puede
     reabrir encima de otra cuenta. */
  const vivos = await pedidos(db, (cols) => db
    .from('orders')
    .select(cols)
    .eq('restaurant_id', restaurantId)
    .not('status', 'in', '("DELIVERED","CANCEL")')
    .gte('created_at', new Date(ahora.getTime() - 48 * 3600_000).toISOString())
    .limit(2000));
  const mesasOcupadas = new Set(
    vivos.filter((o) => o.order_type === 'DINE_IN').map((o) => mesaDeFila(o)).filter((n): n is number => n != null),
  );

  const cobros: CobroDelTurno[] = [];
  for (const id of idsConMovimiento) {
    const o = porId.get(id);
    if (!o) continue;
    const filas = filasPorPedido.get(id) ?? [];
    const delPeriodo = movimientos.filter((m) => m.orderId === id);
    // Una devolución de un pedido cobrado otro día también es un movimiento
    // de este turno, pero su «cuándo» es el de la devolución.
    const at = delPeriodo.map((m) => m.at).sort()[0] ?? o.delivered_at ?? o.created_at;
    const cerroAqui = o.status === 'DELIVERED' && !!o.delivered_at && o.delivered_at > desdeIso;
    const reabierta = filas.some((f) => f.kind === 'REOPEN');
    const mesa = mesaDeFila(o);
    cobros.push({
      orderId: id,
      orderNumber: o.order_number ?? '',
      label: etiqueta(o),
      orderType: o.order_type,
      tableNumber: mesa,
      at,
      total: Number(o.total ?? 0),
      neto: netoPorMetodo(filas),
      devuelto: cent(-filas.filter((f) => f.kind === 'REFUND').reduce((s, f) => s + f.amount, 0)),
      corregido: filas.some((f) => f.kind === 'METHOD_FIX'),
      reabierta,
      reabrible: o.order_type === 'DINE_IN' && cerroAqui && !reabierta && mesa != null && !mesasOcupadas.has(mesa)
        && filas.some((f) => f.kind === 'TABLE_CLOSE' || f.kind === 'PAYMENT'),
      sinCobrar: false,
    });
  }
  for (const p of sinFilas) {
    const o = porId.get(p.orderId);
    if (!o) continue;
    const mesa = mesaDeFila(o);
    cobros.push({
      orderId: o.id,
      orderNumber: o.order_number ?? '',
      label: etiqueta(o),
      orderType: o.order_type,
      tableNumber: mesa,
      at: p.at,
      total: Number(o.total ?? 0),
      neto: o.order_type === 'DINE_IN' ? {} : { [(o.payment_method ?? 'CASH').toUpperCase()]: Number(o.total ?? 0) },
      devuelto: 0,
      corregido: false,
      reabierta: false,
      reabrible: false,
      sinCobrar: o.order_type === 'DINE_IN',
    });
  }
  cobros.sort((a, b) => (a.at < b.at ? 1 : -1));

  /* ── 4. Gastos del periodo, todavía sin atar a ningún corte ── */
  let gastos: LecturaDelTurno['gastos'] = [];
  {
    const { data, error } = await db
      .from('cash_expenses')
      .select('id, concept, amount, paid_by, receipt_url, notes, created_at')
      .eq('restaurant_id', restaurantId)
      .is('cash_count_id', null)
      .gt('created_at', desdeIso)
      .order('created_at', { ascending: true });
    if (!error) gastos = (data ?? []).map((r) => ({ ...r, amount: Number(r.amount) })) as typeof gastos;
  }

  /* ── 5. Propinas de lo que se cerró en el periodo ──
     La propina va dentro del total del pedido, así que entra al cajón
     cuando se cobra el pedido: se reparte la de los pedidos cerrados en
     este turno. */
  const porMesero = new Map<string, { name: string; tables: Set<string>; amount: number }>();
  let propinasTotal = 0;
  for (const o of entregados) {
    const monto = Number(o.tip ?? 0);
    if (!(monto > 0)) continue;
    if (o.order_type === 'DINE_IN' && !conFilas.has(o.id)) continue; // liberada sin cobrar
    propinasTotal = cent(propinasTotal + monto);
    const key = o.waiter_id ?? '__casa__';
    const prev = porMesero.get(key) ?? {
      name: o.waiter?.full_name ?? (o.waiter_id ? 'Mesero' : 'Sin mesero (pedidos en línea)'),
      tables: new Set<string>(),
      amount: 0,
    };
    prev.amount = cent(prev.amount + monto);
    if (o.address) prev.tables.add(o.address);
    porMesero.set(key, prev);
  }
  const propinas: PropinaPorPersona[] = [...porMesero.entries()]
    .map(([key, v]) => ({ profileId: key === '__casa__' ? null : key, name: v.name, tables: v.tables.size, amount: v.amount }))
    .sort((a, b) => b.amount - a.amount);

  /* ── 6. Lo que queda sin cobrar ── */
  const pagadoVivo = await filasDePedidos(db, restaurantId, vivos.filter((o) => o.order_type === 'DINE_IN').map((o) => o.id));
  const pagadoPorPedido = new Map<string, number>();
  for (const f of pagadoVivo) pagadoPorPedido.set(f.order_id, cent((pagadoPorPedido.get(f.order_id) ?? 0) + Number(f.amount)));

  const mesas = new Map<number, { tableNumber: number; label: string; pedidos: number; porCobrar: number }>();
  const domicilios: Pendientes['domicilios'] = [];
  const paraLlevar: Pendientes['paraLlevar'] = [];
  for (const o of vivos) {
    const total = Number(o.total ?? 0);
    if (o.order_type === 'DINE_IN') {
      const n = mesaDeFila(o);
      if (n == null) continue;
      const m = mesas.get(n) ?? { tableNumber: n, label: etiquetaDeMesa(o), pedidos: 0, porCobrar: 0 };
      m.pedidos += 1;
      m.porCobrar = cent(m.porCobrar + Math.max(0, total - (pagadoPorPedido.get(o.id) ?? 0)));
      mesas.set(n, m);
    } else if (o.order_type === 'DELIVERY') {
      domicilios.push({ orderId: o.id, orderNumber: o.order_number ?? '', total, status: o.status });
    } else {
      paraLlevar.push({ orderId: o.id, orderNumber: o.order_number ?? '', total, status: o.status });
    }
  }
  const listaMesas = [...mesas.values()].sort((a, b) => a.tableNumber - b.tableNumber);
  const pendientes: Pendientes = {
    mesas: listaMesas,
    domicilios,
    paraLlevar,
    total: cent(
      listaMesas.reduce((s, m) => s + m.porCobrar, 0)
      + domicilios.reduce((s, d) => s + d.total, 0)
      + paraLlevar.reduce((s, d) => s + d.total, 0),
    ),
  };

  return {
    dia,
    desde: desdeIso,
    hasta: hastaIso,
    abierto: turno,
    ultimoCierre: cierre,
    cuadre,
    cobros,
    gastos,
    gastosTotal: cent(gastos.reduce((s, g) => s + g.amount, 0)),
    propinas,
    propinasTotal,
    pendientes,
    sinMigracion,
  };
}

/** ¿Hay algo sin cobrar que el cierre deba avisar? */
export function hayPendientes(p: Pendientes): boolean {
  return p.mesas.length + p.domicilios.length + p.paraLlevar.length > 0;
}
