import { createServiceClient } from '@/lib/supabase/service';
import { getActiveTableNumbers, getDayPace, type DayPace } from '@/lib/db/orders';
import { getReservations } from '@/lib/db/reservaciones';

/* ============================================================
   LOS WIDGETS DE "HOY" — de dónde salen los datos
   ------------------------------------------------------------
   Regla única de esta capa: **un widget que no tiene nada que
   decir devuelve null**, y la pantalla no pinta nada. No hay
   tarjetas vacías, ni "sin datos todavía", ni un cero grande
   ocupando el mismo espacio que ocuparía un número real. Un
   martes a las diez de la mañana Hoy es una pantalla corta, y
   eso es la intención, no un fallo.

   Todo lo de aquí está acotado a propósito: cada consulta trae
   decenas de filas, no miles, y solo se lanza si el módulo que
   la alimenta está activo. Un restaurante en plan Básico no
   hace ninguna; uno con todo encendido, seis, y las seis en
   paralelo.
   ============================================================ */

/** Qué módulos están activos. Los resuelve la pantalla, igual que el nav. */
export interface HoyFlags {
  orders: boolean;
  dineIn: boolean;
  waitlist: boolean;
  reservations: boolean;
  inventory: boolean;
  surveys: boolean;
}

export interface HouseData {
  tables: { occupied: number; total: number; oldest: { n: number; since: string } | null } | null;
  waiting: { count: number; since: string } | null;
  reservation: { time: string; name: string; partySize: number; more: number } | null;
}

export interface StockItem { name: string; stock: number; threshold: number }
export interface StockData { out: StockItem[]; low: StockItem[]; total: number }

export interface RatingsData {
  count: number;
  average: number;
  /** De 5 a 1 estrellas, en ese orden. */
  distribution: number[];
  latest: { rating: number; comment: string; who: string | null; at: string } | null;
}

export interface OnlineData {
  today: number;
  uniqueToday: number;
  /** Media diaria de los últimos 7 días, para tener con qué comparar hoy. */
  typicalDay: number;
  orders: number;
}

export interface HoyWidgets {
  pace: DayPace | null;
  house: HouseData | null;
  stock: StockData | null;
  ratings: RatingsData | null;
  online: OnlineData | null;
}

/* ── Piezas sueltas ──────────────────────────────────────────── */

/** Mesas ocupadas ahora y cuál lleva más tiempo abierta. */
async function loadTables(restaurantId: string, total: number): Promise<HouseData['tables']> {
  const activas = await getActiveTableNumbers(restaurantId);
  const numeros = Object.keys(activas).map(Number);
  if (numeros.length === 0) return null;

  // La más antigua: la que lleva más rato sin cerrarse, que es la que hay
  // que ir a ver. getActiveTableNumbers ya guardó el pedido más viejo de
  // cada mesa, así que aquí solo se elige el mínimo.
  let oldest: { n: number; since: string } | null = null;
  for (const n of numeros) {
    const since = activas[n].since;
    if (!oldest || since < oldest.since) oldest = { n, since };
  }
  return { occupied: numeros.length, total, oldest };
}

/** Cuánta gente espera mesa y desde cuándo el primero de la fila. */
async function loadWaitlist(restaurantId: string): Promise<HouseData['waiting']> {
  const db = createServiceClient();
  const { data } = await db
    .from('waitlist_entries')
    .select('created_at')
    .eq('restaurant_id', restaurantId)
    .in('status', ['WAITING', 'NOTIFIED'])
    .order('created_at', { ascending: true })
    .limit(100);

  const filas = data ?? [];
  if (filas.length === 0) return null;
  return { count: filas.length, since: filas[0].created_at as string };
}

/** La siguiente reserva de HOY que todavía no se sentó. */
async function loadReservation(restaurantId: string, timezone: string): Promise<HouseData['reservation']> {
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: timezone });
  const reservas = await getReservations(restaurantId, hoy, hoy);
  const pendientes = reservas.filter((r) => r.status === 'PENDING' || r.status === 'CONFIRMED');
  if (pendientes.length === 0) return null;

  // getReservations ya ordena por fecha y hora, así que la primera es la próxima.
  const [siguiente] = pendientes;
  return {
    time: siguiente.time.slice(0, 5),
    name: siguiente.customer_name,
    partySize: siguiente.party_size,
    more: pendientes.length - 1,
  };
}

/**
 * Lo que se está acabando.
 *
 * El umbral es una columna, no una constante, así que la comparación
 * "stock <= umbral" no se puede escribir en el filtro de PostgREST. Se piden
 * los cuarenta con MENOS existencias —que son los únicos que pueden estar
 * bajos— y se termina de filtrar aquí. Cuarenta filas de tres columnas.
 */
async function loadStock(restaurantId: string): Promise<StockData | null> {
  const db = createServiceClient();
  const { data } = await db
    .from('products')
    .select('name, stock, low_stock_threshold')
    .eq('restaurant_id', restaurantId)
    .eq('track_stock', true)
    .eq('is_active', true)
    .order('stock', { ascending: true })
    .limit(40);

  const out: StockItem[] = [];
  const low: StockItem[] = [];
  for (const p of data ?? []) {
    const item: StockItem = {
      name: p.name as string,
      stock: Number(p.stock ?? 0),
      threshold: Number(p.low_stock_threshold ?? 0),
    };
    if (item.stock <= 0) out.push(item);
    else if (item.stock <= item.threshold) low.push(item);
  }

  if (out.length === 0 && low.length === 0) return null;
  // Lo agotado primero: es lo que ya está costando pedidos.
  return { out: out.slice(0, 3), low: low.slice(0, 3), total: out.length + low.length };
}

/**
 * Lo que dicen los clientes ESTA SEMANA.
 *
 * Semana y no histórico a propósito: el promedio de siempre no se mueve y no
 * es noticia de hoy. Y con menos de tres opiniones el widget no aparece —
 * una sola no dice nada y ocuparía el mismo sitio que un dato de verdad.
 */
async function loadRatings(restaurantId: string): Promise<RatingsData | null> {
  const desde = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const db = createServiceClient();
  const { data } = await db
    .from('order_ratings')
    .select('rating, comment, customer_name, created_at')
    .eq('restaurant_id', restaurantId)
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(200);

  const filas = data ?? [];
  if (filas.length < 3) return null;

  const dist = [0, 0, 0, 0, 0]; // índice 0 = cinco estrellas
  let suma = 0;
  let latest: RatingsData['latest'] = null;
  for (const r of filas) {
    const estrellas = Math.min(5, Math.max(1, Number(r.rating)));
    dist[5 - estrellas]++;
    suma += estrellas;
    const comentario = (r.comment as string | null)?.trim();
    // Las filas vienen de la más nueva a la más vieja: el primer comentario
    // que aparece es el último que escribieron.
    if (!latest && comentario) {
      latest = {
        rating: estrellas,
        comment: comentario,
        who: (r.customer_name as string | null) ?? null,
        at: r.created_at as string,
      };
    }
  }

  return { count: filas.length, average: suma / filas.length, distribution: dist, latest };
}

/* ── El paquete completo ─────────────────────────────────────── */

/**
 * Todo lo que necesitan los widgets de Hoy, en paralelo y solo lo que aplica.
 *
 * `todayOrders` y `visits` entran como parámetros en vez de volver a
 * consultarse: la pantalla ya tiene el primero de getOrderStats, y las
 * visitas las pide ella misma para el aviso del plan gratuito. Pedirlas aquí
 * otra vez significaba ejecutar el RPC `visit_stats` DOS veces en cada carga
 * de la portada de un restaurante en plan Básico.
 */
export async function getHoyWidgets(
  restaurantId: string,
  timezone: string,
  flags: HoyFlags,
  opts: {
    tableCount: number;
    todayOrders: number;
    visits: { today: number; uniqueToday: number; last7: number } | null;
  },
): Promise<HoyWidgets> {
  const [pace, tables, waiting, reservation, stock, ratings] = await Promise.all([
    flags.orders ? getDayPace(restaurantId, timezone) : null,
    flags.dineIn ? loadTables(restaurantId, opts.tableCount) : null,
    flags.waitlist ? loadWaitlist(restaurantId) : null,
    flags.reservations ? loadReservation(restaurantId, timezone) : null,
    flags.inventory ? loadStock(restaurantId) : null,
    flags.surveys ? loadRatings(restaurantId) : null,
  ]);

  // "La casa" es UN widget con tres filas, no tres widgets: quien mira la
  // sala tiene una sola pregunta. Si las tres filas están vacías, no hay
  // nada que enseñar.
  const house: HouseData | null =
    tables || waiting || reservation ? { tables, waiting, reservation } : null;

  const online: OnlineData | null = opts.visits && opts.visits.today > 0
    ? {
        today: opts.visits.today,
        uniqueToday: opts.visits.uniqueToday,
        typicalDay: opts.visits.last7 / 7,
        orders: opts.todayOrders,
      }
    : null;

  return { pace, house, stock, ratings, online };
}
