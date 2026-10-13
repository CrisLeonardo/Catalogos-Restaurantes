'use server';

/* ════════════════════════════════════════════════════════════
   CORREGIR UN COBRO (PROD-05, migración 145)
   ------------------------------------------------------------
   El error humano más frecuente en una caja, y hasta ahora sin arreglo:
   `voidOrder` rechaza un pedido entregado y no había forma de reabrir una
   mesa ni de cambiar cómo se pagó.

     1. Cambiar el método — «cobré Efectivo y era Tarjeta».
     2. Reabrir una mesa — «cobré la 4 y era la 5».
     3. Devolver — todo o una línea, cuando el cliente reclama.

   Las tres comparten las reglas que el dueño eligió el 2026-10-09:

     · las inicia cualquiera con acceso a Caja; si no es dueño o
       encargado, firma un encargado con su PIN (el de las anulaciones);
     · llevan motivo y quedan en la bitácora;
     · NUNCA borran la venta: escriben filas nuevas en `order_payments`
       —negativas donde sale dinero— y el cuadre las lee en el turno en
       que ocurren (`lib/caja/libro.ts`).
   ════════════════════════════════════════════════════════════ */

import { revalidatePath } from 'next/cache';
import { authRestaurant, firmar, type CajaCtx, type FirmaInput } from '@/lib/caja/acceso';
import { leerTurno, filasDePedidos } from '@/lib/caja/turno-servidor';
import {
  netoPorMetodo, filasDeCambioDeMetodo, metodoPrincipal, devolvible, montoDeLinea,
  type Movimiento,
} from '@/lib/caja/libro';
import { isPaymentMethod, labelOf } from '@/lib/payment-method';
import { logActivity } from '@/lib/activity';
import { revalidarSalon } from '@/lib/salon-cache';
import { mesaDeFila } from '@/lib/mesa';
import { faltaLaColumna, faltaLaTabla } from '@/lib/db/migracion-ausente';

const UUID_RE = /^[0-9a-f-]{36}$/i;
const cent = (n: number) => Math.round(n * 100) / 100;

/** Devoluciones: sobre pedidos cobrados en los últimos 3 días (decisión del dueño). */
const VENTANA_DEVOLUCION_MS = 3 * 24 * 60 * 60 * 1000;

type Db = CajaCtx['db'];

function motivoValido(reason: string): string | { error: string } {
  const m = (reason ?? '').trim();
  if (m.length < 3) return { error: 'Escribe el motivo.' };
  if (m.length > 200) return { error: 'El motivo es demasiado largo.' };
  return m;
}

interface PedidoCobrado {
  id: string;
  restaurant_id: string;
  order_number: string | null;
  order_type: string;
  status: string;
  payment_method: string | null;
  total: number;
  subtotal: number;
  delivered_at: string | null;
  created_at: string;
  address: string | null;
  table_number?: number | null;
}

async function leerPedido(db: Db, restaurantId: string, orderId: string): Promise<PedidoCobrado | null> {
  const cols = 'id, restaurant_id, order_number, order_type, status, payment_method, total, subtotal, delivered_at, created_at, address, table_number';
  let res = await db.from('orders').select(cols).eq('id', orderId).maybeSingle();
  if (res.error && faltaLaColumna(res.error)) {
    res = await db.from('orders').select(cols.replace(', table_number', '')).eq('id', orderId).maybeSingle() as typeof res;
  }
  const o = res.data as unknown as PedidoCobrado | null;
  if (!o || o.restaurant_id !== restaurantId) return null;
  return { ...o, total: Number(o.total ?? 0), subtotal: Number(o.subtotal ?? 0) };
}

const aMov = (f: { id: string; order_id: string; method: string; amount: number | string; kind?: string | null; created_at: string }): Movimiento => ({
  id: f.id, orderId: f.order_id, method: f.method, amount: Number(f.amount),
  kind: (f.kind as Movimiento['kind'] | null) ?? 'PAYMENT', at: f.created_at,
});

/**
 * Las filas del pedido, y si no tiene ninguna, la del cobro que el libro
 * le suponía.
 *
 * Un domicilio del menú en línea entregado no tiene filas: el libro lo
 * cuenta con su total y su método. Si se le escribiera SOLO la corrección,
 * pasaría a tener filas y el libro dejaría de suponerle el cobro — la caja
 * perdería el pedido entero. Así que primero se escribe el cobro tal como
 * se supuso (con la hora de entrega) y encima la corrección.
 */
async function asegurarFilas(
  db: Db, ctx: CajaCtx, o: PedidoCobrado,
): Promise<{ filas: Movimiento[] } | { error: string }> {
  const crudas = await filasDePedidos(db, o.restaurant_id, [o.id]);
  if (crudas.length > 0) return { filas: crudas.map(aMov) };

  if (o.order_type === 'DINE_IN') return { error: 'Esta mesa se liberó sin cobrar: no hay cobro que corregir.' };
  if (o.status !== 'DELIVERED' || !(o.total > 0)) return { error: 'Este pedido todavía no se ha cobrado.' };

  const { data, error } = await db.from('order_payments').insert({
    restaurant_id: o.restaurant_id,
    order_id: o.id,
    method: (o.payment_method ?? 'CASH').toUpperCase(),
    amount: o.total,
    kind: 'PAYMENT',
    taken_by: ctx.userId,
    created_at: o.delivered_at ?? o.created_at,
  }).select('id, order_id, method, amount, kind, created_at').single();
  if (error) {
    if (faltaLaTabla(error) || faltaLaColumna(error)) return { error: 'Falta la migración 145 para poder corregir cobros.' };
    return { error: error.message };
  }
  return { filas: [aMov(data)] };
}

async function escribirFilas(db: Db, ctx: CajaCtx, o: PedidoCobrado, filas: {
  method: string; amount: number; kind: string; reversesId?: string | null;
  orderItemId?: string | null; quantity?: number | null;
}[], motivo: string, firmante: string): Promise<{ error?: string }> {
  if (filas.length === 0) return {};
  const { error } = await db.from('order_payments').insert(filas.map((f) => ({
    restaurant_id: o.restaurant_id,
    order_id: o.id,
    method: f.method,
    amount: f.amount,
    kind: f.kind,
    reverses_id: f.reversesId ?? null,
    order_item_id: f.orderItemId ?? null,
    quantity: f.quantity ?? null,
    reason: motivo,
    approved_by: firmante,
    taken_by: ctx.userId,
  })));
  if (error) {
    if (faltaLaColumna(error)) return { error: 'Falta la migración 145 para poder corregir cobros.' };
    return { error: error.message };
  }
  return {};
}

function revalidar() {
  revalidatePath('/admin/caja');
  revalidatePath('/admin/finanzas');
  revalidatePath('/admin/pedidos');
}

/* ── 1. Cambiar el método ─────────────────────────────────────── */

export async function corregirMetodoDePago(input: FirmaInput & {
  restaurantId: string;
  orderId: string;
  /** El método con que de verdad se pagó. */
  method: string;
  /** Mover solo lo cobrado con este método (null = todo lo de otros). */
  from?: string | null;
  reason: string;
}): Promise<{ ok?: true; error?: string }> {
  if (!UUID_RE.test(input.orderId)) return { error: 'Pedido inválido.' };
  if (!isPaymentMethod(input.method)) return { error: 'Forma de pago inválida.' };
  const motivo = motivoValido(input.reason);
  if (typeof motivo !== 'string') return motivo;

  const ctx = await authRestaurant(input.restaurantId);
  if (!ctx) return { error: 'No autorizado.' };
  const { db } = ctx;

  const o = await leerPedido(db, input.restaurantId, input.orderId);
  if (!o) return { error: 'Pedido no encontrado.' };

  /* Solo antes del corte. Un cobro que ya entró en un corte cerrado es
     dinero que alguien contó y firmó: moverlo ahora descuadraría el turno
     de ESTA noche con algo que pasó en otro. Para eso está la devolución. */
  const turno = await leerTurno(db, { restaurantId: input.restaurantId, timezone: ctx.tz, corteMin: ctx.corte });
  if (turno.sinMigracion) return { error: 'Falta la migración 145 para poder corregir cobros.' };

  const asegurado = await asegurarFilas(db, ctx, o);
  if ('error' in asegurado) return asegurado;
  const cobros = asegurado.filas.filter((f) => f.kind === 'PAYMENT' || f.kind === 'TABLE_CLOSE');
  if (cobros.length === 0) return { error: 'Este pedido no tiene cobro que corregir.' };
  if (cobros.some((f) => f.at <= turno.desde)) {
    return { error: 'Ese cobro ya entró en un corte cerrado. Si el cliente pide su dinero, haz una devolución.' };
  }

  const neto = netoPorMetodo(asegurado.filas);
  const nuevas = filasDeCambioDeMetodo(neto, input.method, input.from ?? null);
  if (nuevas.length === 0) return { error: `Este pedido ya está cobrado en ${labelOf(input.method)}.` };

  const firma = await firmar(ctx, input.restaurantId, input);
  if ('error' in firma) return firma;

  const escrito = await escribirFilas(db, ctx, o, nuevas, motivo, firma.id);
  if (escrito.error) return escrito;

  // La palabra del pedido sigue al dinero: el ticket, los informes y
  // analítica la leen así desde siempre.
  const despues = netoPorMetodo([...asegurado.filas, ...nuevas.map((f) => ({ method: f.method, amount: f.amount }))]);
  const principal = metodoPrincipal(despues, input.method);
  await db.from('orders').update({
    payment_method: principal,
    ...(principal === 'CASH' ? {} : { cash_amount: null }),
  }).eq('id', o.id);

  await logActivity({
    restaurantId: input.restaurantId,
    actorId: ctx.userId,
    action: 'cobro_metodo_corregido',
    entity: o.order_number ?? o.id,
    meta: {
      orderId: o.id,
      de: nuevas.filter((f) => f.amount < 0).map((f) => ({ metodo: f.method, monto: -f.amount })),
      a: input.method,
      motivo,
      firmante: firma.id,
      firmadoPorOtro: firma.id !== ctx.userId,
    },
  });

  revalidar();
  return { ok: true };
}

/* ── 2. Reabrir una mesa cobrada por error ────────────────────── */

export async function reabrirMesaCobrada(input: FirmaInput & {
  restaurantId: string;
  /** Cualquier pedido de la mesa que se cerró. */
  orderId: string;
  reason: string;
}): Promise<{ ok?: true; tableNumber?: number; error?: string }> {
  if (!UUID_RE.test(input.orderId)) return { error: 'Pedido inválido.' };
  const motivo = motivoValido(input.reason);
  if (typeof motivo !== 'string') return motivo;

  const ctx = await authRestaurant(input.restaurantId);
  if (!ctx) return { error: 'No autorizado.' };
  const { db } = ctx;

  const o = await leerPedido(db, input.restaurantId, input.orderId);
  if (!o) return { error: 'Pedido no encontrado.' };
  const mesa = mesaDeFila(o);
  if (o.order_type !== 'DINE_IN' || mesa == null) return { error: 'Solo se reabre una mesa.' };
  if (o.status !== 'DELIVERED' || !o.delivered_at) return { error: 'Esa mesa no está cobrada.' };

  /* Mientras el turno en que se cobró siga abierto (decisión del dueño):
     después, ese dinero ya se contó y lo que toca es una devolución. */
  const turno = await leerTurno(db, { restaurantId: input.restaurantId, timezone: ctx.tz, corteMin: ctx.corte });
  if (turno.sinMigracion) return { error: 'Falta la migración 145 para poder reabrir mesas.' };
  if (o.delivered_at <= turno.desde) return { error: 'Esa mesa se cobró en un turno ya cerrado. Usa una devolución.' };

  // Encima de otra cuenta, no: se mezclarían dos grupos de gente.
  if (turno.pendientes.mesas.some((m) => m.tableNumber === mesa)) {
    return { error: `La mesa ${mesa} ya tiene otra cuenta abierta. Muévela o ciérrala antes de reabrir.` };
  }

  /* Todos los pedidos que ese cobro cerró: `freeTable` les pone la MISMA
     hora de entrega. */
  const colMesa = o.table_number != null ? 'table_number' : 'address';
  const valMesa = o.table_number != null ? o.table_number : o.address;
  const { data: hermanos } = await db
    .from('orders')
    .select('id')
    .eq('restaurant_id', input.restaurantId)
    .eq('order_type', 'DINE_IN')
    .eq('status', 'DELIVERED')
    .eq(colMesa, valMesa as string | number)
    .eq('delivered_at', o.delivered_at);
  const ids = [...new Set([o.id, ...((hermanos ?? []).map((h) => h.id as string))])];

  // Con factura emitida no: la factura hay que anularla antes, en FEL.
  const { data: facturas, error: errFel } = await db
    .from('fel_documents').select('id').in('order_id', ids).eq('estado', 'CERTIFICADO').limit(1);
  if (!errFel && (facturas ?? []).length > 0) {
    return { error: 'Esta mesa ya tiene factura electrónica. Anúlala en Facturación antes de reabrir.' };
  }

  /* Lo que se compensa es el cobro de CIERRE y sus correcciones, no los
     cobros por partes de antes: esa gente sí pagó lo suyo. Las filas sin
     clase (de antes de la 145) cuentan si se escribieron al cerrar. */
  const filas = (await filasDePedidos(db, input.restaurantId, ids)).map(aMov);
  if (filas.some((f) => f.kind === 'REOPEN')) return { error: 'Esta mesa ya se reabrió una vez.' };
  const cierreMs = new Date(o.delivered_at).getTime();
  const delCierre = filas.filter((f) =>
    f.kind === 'TABLE_CLOSE' || f.kind === 'METHOD_FIX'
    || (f.kind === 'PAYMENT' && Math.abs(new Date(f.at).getTime() - cierreMs) < 60_000));

  const firma = await firmar(ctx, input.restaurantId, input);
  if ('error' in firma) return firma;

  /* Una fila negativa por pedido y método, con lo neto de su cierre. */
  const porPedido = new Map<string, Movimiento[]>();
  for (const f of delCierre) porPedido.set(f.orderId, [...(porPedido.get(f.orderId) ?? []), f]);
  for (const [orderId, suyas] of porPedido) {
    const neto = netoPorMetodo(suyas);
    const filasReapertura = Object.entries(neto)
      .filter(([, monto]) => monto > 0)
      .map(([method, monto]) => ({
        method, amount: -cent(monto), kind: 'REOPEN',
        reversesId: suyas.find((f) => f.method === method && f.amount > 0)?.id ?? null,
      }));
    const pedido = { ...o, id: orderId };
    const escrito = await escribirFilas(db, ctx, pedido, filasReapertura, motivo, firma.id);
    if (escrito.error) return escrito;
  }

  // Los pedidos vuelven a la mesa, servidos: la gente ya comió.
  const { error: errVolver } = await db
    .from('orders')
    .update({ status: 'SERVED', delivered_at: null })
    .in('id', ids)
    .eq('status', 'DELIVERED');
  if (errVolver) return { error: errVolver.message };

  /* Y la mesa vuelve a estar sentada (migración 128). Sin la tabla, la
     mesa vuelve a ocuparse por sus pedidos vivos, que es como era antes. */
  const { data: turnoMesa, error: errTurno } = await db
    .from('table_sessions')
    .select('id')
    .eq('restaurant_id', input.restaurantId)
    .eq('table_number', mesa)
    .gte('closed_at', new Date(cierreMs - 60_000).toISOString())
    .order('closed_at', { ascending: false })
    .limit(1);
  if (!errTurno && turnoMesa && turnoMesa[0]) {
    await db.from('table_sessions').update({ closed_at: null }).eq('id', turnoMesa[0].id as string);
  }

  await logActivity({
    restaurantId: input.restaurantId,
    actorId: ctx.userId,
    action: 'mesa_reabierta',
    entity: String(mesa),
    meta: { pedidos: ids, motivo, firmante: firma.id, firmadoPorOtro: firma.id !== ctx.userId },
  });

  revalidar();
  revalidarSalon();
  return { ok: true, tableNumber: mesa };
}

/* ── 3. Devolver ──────────────────────────────────────────────── */

/** Lo que el diálogo de devolución necesita: líneas y cuánto queda por devolver. */
export interface PedidoDevolvible {
  orderId: string;
  orderNumber: string;
  total: number;
  neto: Record<string, number>;
  restante: number;
  principal: string;
  lineas: { id: string; name: string; quantity: number; refundedQty: number; unitAmount: number }[];
}

export async function getPedidoDevolvible(
  restaurantId: string,
  ref: { orderId?: string; orderNumber?: string },
): Promise<{ order?: PedidoDevolvible; error?: string }> {
  const ctx = await authRestaurant(restaurantId);
  if (!ctx) return { error: 'No autorizado.' };
  const { db } = ctx;

  let orderId = ref.orderId ?? null;
  if (!orderId && ref.orderNumber) {
    const numero = ref.orderNumber.trim().toUpperCase();
    if (!/^[A-Z0-9-]{3,30}$/.test(numero)) return { error: 'Ese número de pedido no es válido.' };
    // «00123» o «ORD-2026-00123»: el cajero escribe lo que ve en el ticket.
    const { data } = await db.from('orders').select('id, order_number')
      .eq('restaurant_id', restaurantId).ilike('order_number', `%${numero}`)
      .order('created_at', { ascending: false }).limit(1);
    orderId = (data?.[0]?.id as string | undefined) ?? null;
  }
  if (!orderId || !UUID_RE.test(orderId)) return { error: 'No encontré ese pedido.' };

  const o = await leerPedido(db, restaurantId, orderId);
  if (!o) return { error: 'No encontré ese pedido.' };
  if (o.status !== 'DELIVERED') return { error: 'Ese pedido todavía no está cobrado.' };
  if (o.delivered_at && Date.now() - new Date(o.delivered_at).getTime() > VENTANA_DEVOLUCION_MS) {
    return { error: 'Solo se devuelven pedidos cobrados en los últimos 3 días.' };
  }

  const crudas = await filasDePedidos(db, restaurantId, [o.id]);
  const filas = crudas.map(aMov);
  const neto = filas.length > 0
    ? netoPorMetodo(filas)
    : o.order_type === 'DINE_IN' ? {} : { [(o.payment_method ?? 'CASH').toUpperCase()]: o.total };
  if (Object.keys(neto).length === 0) return { error: 'Esta mesa se liberó sin cobrar: no hay nada que devolver.' };

  const { data: items } = await db.from('order_items')
    .select('id, name_snapshot, quantity, subtotal').eq('order_id', o.id);
  const { data: anuladas } = await db.from('order_voids')
    .select('item_id, quantity').eq('order_id', o.id).not('item_id', 'is', null);
  const { data: devueltas } = await db.from('order_payments')
    .select('order_item_id, quantity').eq('order_id', o.id).eq('kind', 'REFUND').not('order_item_id', 'is', null);

  const sumaPor = (rows: { order_item_id: string | null; quantity: number | null }[] | null) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) if (r.order_item_id) m.set(r.order_item_id, (m.get(r.order_item_id) ?? 0) + Number(r.quantity ?? 0));
    return m;
  };
  const anuladasPor = sumaPor(((anuladas ?? []) as { item_id: string | null; quantity: number | null }[])
    .map((a) => ({ order_item_id: a.item_id, quantity: a.quantity })));
  const devueltasPor = sumaPor(devueltas as { order_item_id: string | null; quantity: number | null }[] | null);
  /* Lo que de verdad se consumió: una anulación baja el total del pedido
     pero no la línea (`order_voids` resta aparte), así que el consumo se
     cuenta con lo que quedó de cada línea. */
  const vivas = (items ?? []).map((it) => {
    const pedida = Number(it.quantity ?? 0);
    const queda = Math.max(0, pedida - (anuladasPor.get(it.id as string) ?? 0));
    const unidad = pedida > 0 ? Number(it.subtotal ?? 0) / pedida : 0;
    return { it, queda, unidad };
  });
  const consumo = vivas.reduce((s, v) => s + v.unidad * v.queda, 0);

  return {
    order: {
      orderId: o.id,
      orderNumber: o.order_number ?? '',
      total: o.total,
      neto,
      restante: devolvible(neto),
      principal: metodoPrincipal(neto),
      lineas: vivas.map(({ it, queda, unidad }) => ({
        id: it.id as string,
        name: it.name_snapshot as string,
        quantity: queda,
        refundedQty: devueltasPor.get(it.id as string) ?? 0,
        unitAmount: montoDeLinea({
          lineaSubtotal: unidad, lineaCantidad: 1,
          cantidad: 1, consumoPedido: consumo, totalPedido: o.total,
        }),
      })).filter((l) => l.quantity > 0),
    },
  };
}

export async function devolverCobro(input: FirmaInput & {
  restaurantId: string;
  orderId: string;
  /** null = devolver todo lo que queda del pedido. */
  itemId?: string | null;
  quantity?: number | null;
  /** Por dónde sale el dinero. null = el método principal del cobro. */
  method?: string | null;
  reason: string;
}): Promise<{ ok?: true; amount?: number; error?: string }> {
  const motivo = motivoValido(input.reason);
  if (typeof motivo !== 'string') return motivo;
  if (input.method != null && !isPaymentMethod(input.method)) return { error: 'Forma de pago inválida.' };

  const leido = await getPedidoDevolvible(input.restaurantId, { orderId: input.orderId });
  if (leido.error || !leido.order) return { error: leido.error ?? 'No encontré ese pedido.' };
  const p = leido.order;
  if (!(p.restante > 0)) return { error: 'Este pedido ya se devolvió completo.' };

  const ctx = await authRestaurant(input.restaurantId);
  if (!ctx) return { error: 'No autorizado.' };
  const { db } = ctx;

  let monto = p.restante;
  let cantidad: number | null = null;
  if (input.itemId) {
    const linea = p.lineas.find((l) => l.id === input.itemId);
    if (!linea) return { error: 'Esa línea no está en el pedido.' };
    const disponibles = linea.quantity - linea.refundedQty;
    cantidad = Math.trunc(input.quantity ?? 1);
    if (cantidad < 1 || cantidad > disponibles) return { error: `De esa línea quedan ${disponibles} por devolver.` };
    monto = Math.min(cent(linea.unitAmount * cantidad), p.restante);
  }
  if (!(monto > 0)) return { error: 'No hay nada que devolver.' };

  const firma = await firmar(ctx, input.restaurantId, input);
  if ('error' in firma) return firma;

  const o = await leerPedido(db, input.restaurantId, p.orderId);
  if (!o) return { error: 'Pedido no encontrado.' };
  const asegurado = await asegurarFilas(db, ctx, o);
  if ('error' in asegurado) return asegurado;

  const metodo = (input.method ?? p.principal).toUpperCase();
  const escrito = await escribirFilas(db, ctx, o, [{
    method: metodo, amount: -monto, kind: 'REFUND', orderItemId: input.itemId ?? null, quantity: cantidad,
  }], motivo, firma.id);
  if (escrito.error) return escrito;

  await logActivity({
    restaurantId: input.restaurantId,
    actorId: ctx.userId,
    action: 'devolucion',
    entity: p.orderNumber || p.orderId,
    meta: {
      orderId: p.orderId,
      monto,
      metodo,
      linea: input.itemId ?? null,
      cantidad,
      motivo,
      firmante: firma.id,
      firmadoPorOtro: firma.id !== ctx.userId,
    },
  });

  revalidar();
  return { ok: true, amount: monto };
}
