import { createServiceClient } from '@/lib/supabase/service';
import { faltaLaColumna } from '@/lib/db/migracion-ausente';
import { hayColumnaMesa, mesaDeFila, direccionDeMesa } from '@/lib/db/mesa-columna';
import { localDateKey } from '@/lib/hours';
import type { Order, OrderItem, OrderStatus, OrderVoid } from '@/types';

export type OrderWithItems = Order & {
  items: OrderItem[];
  /** Anulaciones de este pedido/sus ítems (migración 079). [] si ninguna. */
  voids: OrderVoid[];
  /** Nombre del mesero que tomó el pedido (migración 030). Solo DINE_IN por mesero. */
  waiter_name?: string | null;
};

/** Unidades de un ítem que ya se anularon (suma de order_voids con ese item_id). */
export function voidedQuantity(item: OrderItem, voids: OrderVoid[]): number {
  return voids.reduce((s, v) => (v.item_id === item.id ? s + (v.quantity ?? 0) : s), 0);
}

/** Unidades de un ítem que quedan en pie (nunca negativo). */
export function remainingQuantity(item: OrderItem, voids: OrderVoid[]): number {
  return Math.max(0, item.quantity - voidedQuantity(item, voids));
}

const ORDER_SELECT =
  '*, items:order_items(*), voids:order_voids(*), waiter:profiles!orders_waiter_id_fkey(full_name)';

function mapOrderRows(data: unknown): OrderWithItems[] {
  return ((data ?? []) as (Record<string, unknown>)[]).map((row) => {
    const { waiter, ...order } = row as Record<string, unknown> & { waiter?: { full_name: string | null } | null };
    return { ...order, waiter_name: waiter?.full_name ?? null } as OrderWithItems;
  });
}

/** Cuándo se cerró un pedido: entregado, servido o anulado. Sin marca de
 *  tiempo (pedidos viejos, cierres por SQL) se cae a created_at. */
export function orderClosedAt(o: Pick<Order, 'delivered_at' | 'cancelled_at' | 'served_at' | 'created_at'>): string {
  return o.delivered_at ?? o.cancelled_at ?? o.served_at ?? o.created_at;
}

export interface PanelOrders {
  /** Todo lo que sigue en curso, del más viejo al más nuevo (FIFO). */
  active: OrderWithItems[];
  /** Cerrados HOY según la hora del restaurante, del cierre más reciente atrás. */
  closedToday: OrderWithItems[];
}

/**
 * Pedidos del panel, en DOS consultas separadas a propósito.
 *
 * Antes era una sola: "los últimos 100 por fecha de creación", y de ahí se
 * separaba en memoria. En un local con movimiento eso escondía pedidos: una
 * mesa abierta desde el mediodía se caía de la ventana de 100 en cuanto
 * entraban 100 pedidos más nuevos, y desaparecía del tablero sin cerrarse.
 * Los activos ahora se piden aparte y sin competir con el historial.
 */
export async function getPanelOrders(
  restaurantId: string,
  timezone: string = 'America/Guatemala',
): Promise<PanelOrders> {
  const db = createServiceClient();

  // Ventana amplia para el corte del día: se filtra con precisión abajo, en la
  // zona horaria real del restaurante (SQL no conoce esa zona aquí).
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const [activeRes, closedRes] = await Promise.all([
    db
      .from('orders')
      .select(ORDER_SELECT)
      .eq('restaurant_id', restaurantId)
      .not('status', 'in', '("DELIVERED","CANCEL")')
      // FIFO: el que lleva más esperando, primero. En un restaurante el orden
      // de atención es la antigüedad, no la novedad.
      .order('created_at', { ascending: true })
      // Techo de seguridad, no un límite operativo real: con el auto-archivo
      // de DINE_IN (24h, mig. 080) y de DELIVERY/PICKUP (6h, mig. 099) los
      // activos genuinos deberían quedar muy por debajo de esto.
      .limit(500),
    db
      .from('orders')
      .select(ORDER_SELECT)
      .eq('restaurant_id', restaurantId)
      .in('status', ['DELIVERED', 'CANCEL'])
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(150),
  ]);

  const todayKey = localDateKey(new Date(), timezone);
  const closedToday = mapOrderRows(closedRes.data)
    .filter((o) => localDateKey(new Date(orderClosedAt(o)), timezone) === todayKey)
    .sort((a, b) => orderClosedAt(b).localeCompare(orderClosedAt(a)));

  return { active: mapOrderRows(activeRes.data), closedToday };
}

/** Una fila de "En curso" en la pantalla Hoy: lo justo para pintarla. */
export interface ActiveOrderPreview {
  id: string;
  order_number: string;
  order_type: Order['order_type'];
  /** En DINE_IN trae "Mesa N": el texto que se imprime. */
  address: string | null;
  /** La mesa de verdad (migración 127). Ausente donde no ha corrido. */
  table_number?: number | null;
  customer_name: string;
  status: OrderStatus;
  total: number;
  created_at: string;
}

export interface ActiveOrdersPreview {
  /** Los más viejos primero (FIFO, igual que el panel de pedidos). */
  orders: ActiveOrderPreview[];
  /** Cuántos hay en curso EN TOTAL, no cuántos vienen en `orders`. */
  total: number;
}

/**
 * Vista corta de los pedidos en curso para la pantalla Hoy.
 *
 * Deliberadamente NO reusa getPanelOrders: ese trae hasta 500 pedidos con
 * todos sus ítems y anulaciones porque el panel los necesita para trabajar.
 * Hoy solo enseña cuatro renglones y un total, así que pide cuatro filas y
 * el conteo — la portada del panel no debe costar lo que cuesta el panel.
 */
export async function getActiveOrdersPreview(
  restaurantId: string,
  limit = 4,
): Promise<ActiveOrdersPreview> {
  const db = createServiceClient();
  const cols = `id, order_number, order_type, address, customer_name, status, total, created_at${
    (await hayColumnaMesa()) ? ', table_number' : ''}`;
  const { data, count } = await db
    .from('orders')
    .select(cols, { count: 'exact' })
    .eq('restaurant_id', restaurantId)
    .not('status', 'in', '("DELIVERED","CANCEL")')
    .order('created_at', { ascending: true })
    .limit(limit);

  return {
    orders: (data ?? []) as unknown as ActiveOrderPreview[],
    total: count ?? (data?.length ?? 0),
  };
}

/** Pedidos activos del mesero (para la interfaz /admin/mesero). */
export async function getWaiterActiveOrders(
  restaurantId: string,
  waiterId: string,
): Promise<OrderWithItems[]> {
  const db = createServiceClient();
  const { data } = await db
    .from('orders')
    .select('*, items:order_items(*), voids:order_voids(*)')
    .eq('restaurant_id', restaurantId)
    .eq('waiter_id', waiterId)
    .not('status', 'in', '("DELIVERED","CANCEL")')
    .order('created_at', { ascending: false })
    .limit(50);

  return ((data ?? []) as (Record<string, unknown>)[]).map((row) => ({
    ...row,
    waiter_name: null,
  } as OrderWithItems));
}

/** Pedidos activos (no entregados/cancelados) de UNA mesa — todas las
 *  "rondas" acumuladas mientras la mesa sigue ocupada, con sus ítems y
 *  anulaciones. Base de la "cuenta de mesa" (ver waiter-panel.tsx). */
export async function getOrdersForTable(
  restaurantId: string,
  tableNumber: number,
): Promise<OrderWithItems[]> {
  const db = createServiceClient();
  /* Por NÚMERO, no por el texto «Mesa 4» (migración 127). Mientras la
     columna no exista en producción se sigue filtrando por la dirección:
     ver lib/db/mesa-columna.ts. */
  const porNumero = await hayColumnaMesa();
  let q = db
    .from('orders')
    .select('*, items:order_items(*), voids:order_voids(*), waiter:profiles!orders_waiter_id_fkey(full_name)')
    .eq('restaurant_id', restaurantId)
    .eq('order_type', 'DINE_IN');
  q = porNumero ? q.eq('table_number', tableNumber) : q.eq('address', direccionDeMesa(tableNumber));
  const { data } = await q
    .not('status', 'in', '("DELIVERED","CANCEL")')
    .order('created_at', { ascending: true });

  return ((data ?? []) as (Record<string, unknown>)[]).map((row) => {
    const { waiter, ...order } = row as Record<string, unknown> & { waiter?: { full_name: string | null } | null };
    return { ...order, waiter_name: waiter?.full_name ?? null } as OrderWithItems;
  });
}

/**
 * Pedidos para la pantalla de cocina (KDS).
 * - confirmFirst=true: solo muestra PREP (confirmados desde el panel de pedidos).
 * - confirmFirst=false: muestra NEW + PREP (llegan directamente a cocina).
 * Orden FIFO: el que más lleva esperando va primero.
 */
export async function getKitchenOrders(
  restaurantId: string,
  confirmFirst = false,
): Promise<OrderWithItems[]> {
  const db = createServiceClient();
  const statuses = confirmFirst ? ['PREP'] : ['NEW', 'PREP'];
  const { data } = await db
    .from('orders')
    .select('*, items:order_items(*), voids:order_voids(*), waiter:profiles!orders_waiter_id_fkey(full_name)')
    .eq('restaurant_id', restaurantId)
    .in('status', statuses)
    .order('created_at', { ascending: true })
    .limit(60);

  return ((data ?? []) as (Record<string, unknown>)[]).map((row) => {
    const { waiter, ...order } = row as Record<string, unknown> & { waiter?: { full_name: string | null } | null };
    return {
      ...order,
      waiter_name: waiter?.full_name ?? null,
    } as OrderWithItems;
  });
}

/** Mesa ocupada. Además del "desde cuándo" y el "quién atiende" de siempre,
    ahora carga lo que la ficha de mesa necesita mostrar sin pedir nada más:
    qué estado manda, cuántos platos hay, cuánto lleva y los relojes que
    disparan un aviso (ver lib/table-state.ts). */
export type TableOccupancy = {
  /** created_at del pedido más antiguo, si hay varios acumulados. */
  since: string;
  /** Mesero que tomó el pedido, o `null` si el comensal ordenó por su cuenta. */
  waiterName: string | null;
  /** Estado que MANDA en la mesa: el menos avanzado de sus pedidos. Una mesa
      con un plato servido y otro en cocina sigue siendo "en cocina". */
  status: OrderStatus;
  /** Platos en la mesa, sumando todos los pedidos activos. */
  itemCount: number;
  /** Lo que lleva consumido la mesa. */
  total: number;
  /** Si TODOS sus pedidos están servidos, cuándo se sirvió el último. Es lo
      que permite avisar de la mesa que ya comió y nadie cobró. */
  servedAt: string | null;
  /** El READY más viejo sin entregar, si lo hay: el plato que lleva rato en
      la barra esperando que alguien lo lleve. */
  readySince: string | null;
  /** Comensales sentados (migración 123). `null` = nadie lo anotó — la ficha
      omite el dato en vez de inventar un número. */
  partySize: number | null;
  /** Cuándo salió el último plato a cocina (accepted_at más reciente). Es lo
      que la línea del ciclo enseña como "salió 20:12". */
  firedAt: string | null;
  /** Lo que la mesa ya pagó en cobros por partes (`order_payments`, mig.
      129). `total - paid` es lo que de verdad falta por cobrar: sin restarlo,
      «Sin cobrar» en Mesas seguía contando entero el dinero ya cobrado. */
  paid?: number;
};

/** Cuál de dos estados "manda" en la mesa: el menos avanzado. */
const STATUS_RANK: Record<string, number> = { NEW: 0, PREP: 1, READY: 2, TRANSIT: 2, SERVED: 3 };

/** Mesas con un pedido DINE_IN activo (no entregado/cancelado). Se usa para
    marcar mesas ocupadas + su temporizador + quién atiende en el panel del
    mesero (varios meseros comparten el salón: evita que dos atiendan la
    misma mesa sin saberlo). */
export async function getActiveTableNumbers(restaurantId: string): Promise<Record<number, TableOccupancy>> {
  const db = createServiceClient();
  const pedir = (cols: string) => db
    .from('orders')
    .select(cols)
    .eq('restaurant_id', restaurantId)
    .eq('order_type', 'DINE_IN')
    .not('status', 'in', '("DELIVERED","CANCEL")')
    .order('created_at', { ascending: true })
    .limit(200);

  const BASE = 'id, address, created_at, accepted_at, status, total, served_at, ready_at, items:order_items(quantity), waiter:profiles!orders_waiter_id_fkey(full_name)';
  const MESA = (await hayColumnaMesa()) ? ', table_number' : '';

  /* `party_size` es de la migración 123. Donde todavía no corrió, pedirla
     tumba la consulta ENTERA y el salón se quedaría sin ver ninguna mesa
     ocupada — mucho peor que no saber cuánta gente hay. Si falta la columna
     se reintenta sin ella y las personas quedan en null, que es justo lo que
     la ficha sabe omitir. (Mismo patrón que `reason` en las llamadas.) */
  const conPax = await pedir(`${BASE}${MESA}, party_size`);
  const { error } = conPax;
  const data = error && faltaLaColumna(error) && /party_size/i.test(error.message ?? '')
    ? (await pedir(`${BASE}${MESA}`)).data
    : conPax.data;

  const result: Record<number, TableOccupancy> = {};
  /** Mesas donde algún pedido NO está servido: no pueden reportar servedAt. */
  const sinServir = new Set<number>();
  /** De qué mesa es cada pedido, para repartir después lo ya cobrado. */
  const mesaDePedido = new Map<string, number>();

  for (const row of (data ?? []) as unknown as (Record<string, unknown>)[]) {
    const { created_at, accepted_at, status, total, served_at, ready_at, party_size, items, waiter } = row as {
      address: string | null; created_at: string; accepted_at: string | null; status: OrderStatus;
      total: number | string | null; served_at: string | null; ready_at: string | null;
      party_size?: number | null;
      items?: { quantity: number }[] | null;
      waiter?: { full_name: string | null } | null;
    };
    const n = mesaDeFila(row as { table_number?: number | null; address?: string | null });
    if (n == null) continue;
    if (typeof row.id === 'string') mesaDePedido.set(row.id, n);
    const platos = (items ?? []).reduce((s, it) => s + (it.quantity ?? 0), 0);

    const prev = result[n];
    if (!prev) {
      // Orden ascendente → el primero que vemos es el más antiguo.
      result[n] = {
        since: created_at,
        waiterName: waiter?.full_name ?? null,
        status,
        itemCount: platos,
        total: Number(total ?? 0),
        servedAt: status === 'SERVED' ? served_at : null,
        readySince: status === 'READY' ? ready_at : null,
        partySize: party_size ?? null,
        firedAt: accepted_at ?? null,
      };
    } else {
      prev.itemCount += platos;
      prev.total += Number(total ?? 0);
      if ((STATUS_RANK[status] ?? 0) < (STATUS_RANK[prev.status] ?? 0)) prev.status = status;
      if (status === 'SERVED' && served_at && (!prev.servedAt || served_at > prev.servedAt)) prev.servedAt = served_at;
      if (status === 'READY' && ready_at && (!prev.readySince || ready_at < prev.readySince)) prev.readySince = ready_at;
      // La mesa la ocupa la ronda MÁS GRANDE que alguien anotó: si la segunda
      // comanda se tomó sin preguntar, no por eso se sentó menos gente.
      if (party_size != null && party_size > (prev.partySize ?? 0)) prev.partySize = party_size;
      if (accepted_at && (!prev.firedAt || accepted_at > prev.firedAt)) prev.firedAt = accepted_at;
    }
    if (status !== 'SERVED') sinServir.add(n);
  }

  // servedAt solo tiene sentido si la mesa ENTERA está servida: si queda algo
  // en cocina, la mesa no está esperando que la cobren, está esperando comida.
  for (const n of sinServir) {
    const occ = result[Number(n)];
    if (occ) occ.servedAt = null;
  }

  /* Lo ya cobrado en partes. Consulta APARTE y sin exigir nada: donde la
     migración 129 todavía no corrió la tabla no existe, y eso no puede
     tumbar el salón — se queda en 0, que es lo que valía antes. */
  if (mesaDePedido.size > 0) {
    const { data: pagos, error: errPagos } = await db
      .from('order_payments')
      .select('order_id, amount')
      .in('order_id', [...mesaDePedido.keys()]);
    if (!errPagos) {
      for (const p of (pagos ?? []) as { order_id: string; amount: number | string }[]) {
        const occ = result[mesaDePedido.get(p.order_id) ?? -1];
        if (occ) occ.paid = Math.round(((occ.paid ?? 0) + Number(p.amount ?? 0)) * 100) / 100;
      }
    }
  }
  return result;
}

/** Llamada del comensal pendiente en una mesa (migración 048 + 122). */
export type TableCall = { reason: 'call' | 'bill'; since: string };

/** Llamadas sin resolver, por mesa. La más reciente de cada mesa gana, y
    "pide la cuenta" pesa más que "llamar al mesero" aunque sea más vieja:
    cobrar libera la mesa, traer una salsa no. */
export async function getPendingTableCalls(restaurantId: string): Promise<Record<number, TableCall>> {
  const db = createServiceClient();
  const pedir = (cols: string) => db
    .from('waiter_calls')
    .select(cols)
    .eq('restaurant_id', restaurantId)
    .is('resolved_at', null)
    .order('created_at', { ascending: false })
    .limit(100);

  /* `reason` es de la migración 122. Donde todavía no corrió, pedirla tumba
     la consulta entera y el salón se quedaría sin ver NINGUNA llamada — peor
     que antes de la mejora. Si falta la columna se reintenta sin ella y todas
     las llamadas cuentan como genéricas, que es justo lo que eran. */
  const conMotivo = await pedir('table_number, reason, created_at');
  const { error } = conMotivo;
  const data = error && faltaLaColumna(error) && /reason/i.test(error.message ?? '')
    ? (await pedir('table_number, created_at')).data
    : conMotivo.data;

  const result: Record<number, TableCall> = {};
  for (const row of (data ?? []) as unknown as { table_number: number | null; reason: string | null; created_at: string }[]) {
    const n = row.table_number;
    if (n == null) continue;
    const reason: 'call' | 'bill' = row.reason === 'bill' ? 'bill' : 'call';
    const prev = result[n];
    if (!prev) { result[n] = { reason, since: row.created_at }; continue; }
    if (prev.reason !== 'bill' && reason === 'bill') result[n] = { reason, since: row.created_at };
  }
  return result;
}

/**
 * Cuántas veces se ha ocupado una mesa hoy («Rotación hoy» de la tira de
 * resumen). Es el número que dice si un salón de 14 mesas trabajó o no:
 * nueve mesas llenas a las 21:00 significan cosas muy distintas si el día
 * lleva 31 rotaciones o si lleva 9.
 *
 * Cómo se cuenta: cada CIERRE de mesa es una rotación. Al liberar una mesa
 * (`freeTable`) todos sus pedidos se marcan DELIVERED con la MISMA marca de
 * tiempo, así que agrupar por mesa + minuto de cierre da exactamente una
 * rotación por cada vez que la mesa se vació. Se suman las que están
 * ocupadas ahora, que también son gente que se sentó hoy.
 */
export async function getTableTurnsToday(restaurantId: string, timezone: string): Promise<number> {
  const db = createServiceClient();

  // Se pide desde ayer y se filtra por día local: el corte del día del
  // restaurante no es medianoche UTC (mismo criterio que getCashSummary).
  const desde = new Date();
  desde.setUTCDate(desde.getUTCDate() - 1);

  /* La lista de columnas se arma en tiempo de ejecución (la 127 puede no
     haber corrido), así que el analizador de tipos de Supabase no puede
     deducir la forma: se declara a mano. */
  const cols = `address, delivered_at${(await hayColumnaMesa()) ? ', table_number' : ''}`;
  const { data } = await db
    .from('orders')
    .select(cols)
    .eq('restaurant_id', restaurantId)
    .eq('order_type', 'DINE_IN')
    .eq('status', 'DELIVERED')
    .gte('delivered_at', desde.toISOString())
    .limit(2000);

  const hoy = localDateKey(new Date(), timezone);
  const cierres = new Set<string>();
  type FilaCierre = { address: string | null; table_number?: number | null; delivered_at: string | null };
  for (const row of (data ?? []) as unknown as FilaCierre[]) {
    if (!row.delivered_at) continue;
    if (localDateKey(new Date(row.delivered_at), timezone) !== hoy) continue;
    const n = mesaDeFila(row);
    if (n == null) continue;
    // Minuto de cierre: una mesa liberada de golpe cuenta una sola vez
    // aunque tuviera cuatro comandas acumuladas.
    cierres.add(`${n}|${row.delivered_at.slice(0, 16)}`);
  }
  return cierres.size;
}

export type DaySale    = { label: string; total: number; isToday: boolean };
export type TopProduct = { name: string; qty: number };

/**
 * Cómo va el día COMPARADO con los días iguales anteriores.
 *
 * La comparación honesta de un día a medias no es contra el total de otro
 * día, es contra lo que ese otro día llevaba A ESTA MISMA HORA: a la una de
 * la tarde un jueves normal lleva un tercio de lo que cerrará. Por eso
 * `typicalSoFar` suma solo los pedidos anteriores a la hora local actual.
 */
export interface DayPace {
  /** Cuántos días iguales (mismo día de la semana) se pudieron promediar. */
  samples: number;
  /** Lo que un día igual llevaba a esta hora, en promedio. */
  typicalSoFar: number;
  /** Con lo que un día igual terminó, en promedio. */
  typicalFullDay: number;
}

export interface OrderStats {
  series:   DaySale[];
  topToday: TopProduct[];
  totalLast14: number;
  /** KPIs de HOY según la zona horaria del restaurante (no "últimos 100"). */
  todaySales: number;
  todayOrders: number;
  todayTicket: number;
}

/**
 * Estadísticas de ventas. TODOS los cortes de día usan la zona horaria del
 * restaurante: un pedido de las 7 p.m. en Guatemala cuenta para ese día,
 * aunque en UTC ya sea el siguiente.
 */
export async function getOrderStats(
  restaurantId: string,
  timezone: string = 'America/Guatemala',
): Promise<OrderStats> {
  const db = createServiceClient();

  // Ventana de 14 días: margen de 1 día extra para cubrir el desfase UTC↔local.
  const since = new Date();
  since.setDate(since.getDate() - 14);
  since.setHours(0, 0, 0, 0);

  const { data } = await db
    .from('orders')
    .select('id, created_at, total')
    .eq('restaurant_id', restaurantId)
    .neq('status', 'CANCEL')
    .gte('created_at', since.toISOString());

  const rawOrders = data ?? [];
  const now = new Date();
  const todayKey = localDateKey(now, timezone);

  // Total por día local (clave YYYY-MM-DD en la zona del restaurante).
  const byDay = new Map<string, number>();
  const todayIds: string[] = [];
  let todaySales = 0;
  for (const o of rawOrders) {
    const key = localDateKey(new Date(o.created_at as string), timezone);
    byDay.set(key, (byDay.get(key) ?? 0) + Number(o.total));
    if (key === todayKey) {
      todayIds.push(o.id as string);
      todaySales += Number(o.total);
    }
  }

  // Serie de 14 días terminando hoy (en hora local del restaurante).
  const series: DaySale[] = [];
  let totalLast14 = 0;
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = localDateKey(d, timezone);
    const dayTotal = byDay.get(key) ?? 0;
    totalLast14 += dayTotal;
    let label: string;
    try {
      const short = d.toLocaleDateString('es', { weekday: 'short', timeZone: timezone });
      label = short.charAt(0).toUpperCase() + short.slice(1, 2);
    } catch {
      label = '·';
    }
    series.push({ label, total: dayTotal, isToday: i === 0 });
  }

  // Top de productos de hoy.
  let topToday: TopProduct[] = [];
  if (todayIds.length > 0) {
    const { data: items } = await db
      .from('order_items')
      .select('name_snapshot, quantity')
      .in('order_id', todayIds);

    const map: Record<string, number> = {};
    (items ?? []).forEach((it: { name_snapshot: string; quantity: number }) => {
      map[it.name_snapshot] = (map[it.name_snapshot] ?? 0) + it.quantity;
    });
    topToday = Object.entries(map)
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
  }

  const todayOrders = todayIds.length;
  return {
    series,
    topToday,
    totalLast14,
    todaySales,
    todayOrders,
    todayTicket: todayOrders > 0 ? todaySales / todayOrders : 0,
  };
}

/* ============================================================
   CÓMO VA EL DÍA — comparación contra los días iguales
   ------------------------------------------------------------
   Un total suelto no dice nada: Q3,480 puede ser un jueves
   flojo o el mejor martes del mes. Lo que informa es la
   comparación, y la comparación honesta de un día a medias no
   es contra el TOTAL de otro día —a la una de la tarde nadie
   lleva lo que cerrará— sino contra lo que ese otro día
   llevaba A ESTA MISMA HORA.

   Se piden solo los CUATRO días iguales anteriores (los cuatro
   jueves pasados si hoy es jueves), acotados por rango exacto,
   no cinco semanas de pedidos para tirar el 80 %.
   ============================================================ */

/** Minutos transcurridos del día local en la zona del restaurante. */
function localMinutesOfDay(date: Date, timezone: string): number {
  try {
    const hhmm = date.toLocaleTimeString('en-GB', {
      timeZone: timezone, hour12: false, hour: '2-digit', minute: '2-digit',
    });
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  } catch {
    return date.getHours() * 60 + date.getMinutes();
  }
}

/**
 * Instante UTC en que empieza un día local ("YYYY-MM-DD") de una zona.
 *
 * Se deduce del desfase que esa zona tenía en ese momento en vez de
 * codificarlo: Guatemala no cambia de hora, pero el panel ya se vende fuera
 * y una constante -6 sería una bomba de tiempo.
 */
function zonedDayStart(dateKey: string, timezone: string): Date {
  const guess = new Date(`${dateKey}T00:00:00Z`);
  try {
    const asLocal = new Date(guess.toLocaleString('en-US', { timeZone: timezone }));
    const asUtc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }));
    return new Date(guess.getTime() + (asUtc.getTime() - asLocal.getTime()));
  } catch {
    return guess;
  }
}

export interface DayPace {
  /** Cuántos días iguales se pudieron promediar (0 = no hay con qué comparar). */
  samples: number;
  /** Lo que un día igual llevaba a esta hora, en promedio. */
  typicalSoFar: number;
  /** Con cuánto cerró un día igual, en promedio. */
  typicalFullDay: number;
}

export async function getDayPace(
  restaurantId: string,
  timezone: string = 'America/Guatemala',
): Promise<DayPace | null> {
  const now = new Date();
  const cutoffMinutes = localMinutesOfDay(now, timezone);

  // Los cuatro días iguales anteriores, con sus bordes exactos en UTC.
  const ventanas: { key: string; from: Date; to: Date }[] = [];
  for (let semanas = 1; semanas <= 4; semanas++) {
    const d = new Date(now);
    d.setDate(d.getDate() - semanas * 7);
    const key = localDateKey(d, timezone);
    const from = zonedDayStart(key, timezone);
    const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
    ventanas.push({ key, from, to });
  }

  const db = createServiceClient();
  const { data } = await db
    .from('orders')
    .select('created_at, total')
    .eq('restaurant_id', restaurantId)
    .neq('status', 'CANCEL')
    .or(ventanas
      .map((v) => `and(created_at.gte.${v.from.toISOString()},created_at.lt.${v.to.toISOString()})`)
      .join(','))
    .limit(2000);

  if (!data || data.length === 0) return null;

  const soFar = new Map<string, number>();
  const fullDay = new Map<string, number>();
  for (const o of data) {
    const at = new Date(o.created_at as string);
    const key = localDateKey(at, timezone);
    const monto = Number(o.total);
    fullDay.set(key, (fullDay.get(key) ?? 0) + monto);
    if (localMinutesOfDay(at, timezone) <= cutoffMinutes) {
      soFar.set(key, (soFar.get(key) ?? 0) + monto);
    }
  }

  // Solo cuentan los días que de verdad tuvieron movimiento: promediar
  // incluyendo un lunes que el local estuvo cerrado hunde la referencia y
  // hace que cualquier día parezca extraordinario.
  const diasConVenta = ventanas.map((v) => v.key).filter((k) => (fullDay.get(k) ?? 0) > 0);
  if (diasConVenta.length === 0) return null;

  const media = (m: Map<string, number>) =>
    diasConVenta.reduce((s, k) => s + (m.get(k) ?? 0), 0) / diasConVenta.length;

  return {
    samples: diasConVenta.length,
    typicalSoFar: media(soFar),
    typicalFullDay: media(fullDay),
  };
}
