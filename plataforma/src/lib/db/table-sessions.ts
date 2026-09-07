/**
 * El turno de una mesa: quién la sentó, cuántos son y desde cuándo.
 * ------------------------------------------------------------
 * Migración 128 (hallazgo M-02). Hasta aquí una mesa solo existía si
 * tenía un pedido —`getActiveTableNumbers` la construye entera desde
 * `orders`—, así que el salón no sabía decir «hay cuatro personas en la
 * 7 desde hace seis minutos y todavía no han pedido».
 *
 * La ocupación del salón es la UNIÓN de las dos cosas:
 *
 *   · mesas con pedido DINE_IN vivo  → `TableOccupancy` (como siempre);
 *   · mesas sentadas sin pedido      → `TableSeating`   (esto).
 *
 * Se mantienen separadas a propósito. Un pedido que entra por el QR sin
 * que nadie haya sentado la mesa tiene que seguir ocupándola, y una mesa
 * sentada sin pedido no tiene estado de pedido que enseñar: fundirlas
 * obligaría a inventarle un `status` a gente que todavía está leyendo la
 * carta. `lib/table-state.ts` recibe las dos y decide.
 */
import { createServiceClient } from '@/lib/supabase/service';
import { getActiveTableNumbers } from '@/lib/db/orders';
import { resolveTheme, type ThemeRow } from '@/lib/theme/resolve';

/** Una mesa sentada. Es el turno abierto, no el pedido. */
export type TableSeating = {
  id: string;
  /** Comensales sentados. `null` = nadie lo anotó; la ficha omite el dato. */
  partySize: number | null;
  /** A quién le toca la mesa. `null` = sin repartir. */
  waiterId: string | null;
  waiterName: string | null;
  /** Quién la sentó, para la ficha del encargado. */
  seatedByName: string | null;
  seatedAt: string;
  source: 'walk_in' | 'reservation' | 'waitlist' | 'order';
  note: string | null;
};

/**
 * ¿Existe ya `table_sessions`? (migración 128)
 *
 * Las migraciones de este proyecto corren a mano y con retraso: entre que
 * el código sale y la migración se aplica hay una ventana en la que la
 * tabla no existe. Preguntar por ella tumbaría la consulta y el salón se
 * quedaría sin pintar. Mismo patrón —y misma vida corta— que
 * `hayColumnaMesa` para la 127: el día que la 128 esté en producción esto
 * se borra.
 */
let cache: Promise<boolean> | null = null;

export function hayTurnosDeMesa(): Promise<boolean> {
  if (!cache) {
    cache = (async () => {
      try {
        const db = createServiceClient();
        const { error } = await db.from('table_sessions').select('id').limit(1);
        // 42P01 = undefined_table. Cualquier otro fallo (red, permisos) NO
        // significa que la tabla falte: se asume que sí y el error se
        // manifiesta donde de verdad esté.
        return !(error && error.code === '42P01');
      } catch {
        return true;
      }
    })();
  }
  return cache;
}

/** Solo para las pruebas: olvida lo que se averiguó. */
export function _resetCacheTurnos() {
  cache = null;
}

/** Las mesas sentadas ahora mismo, por número. */
export async function getOpenTableSessions(
  restaurantId: string,
): Promise<Record<number, TableSeating>> {
  if (!restaurantId) return {};
  if (!(await hayTurnosDeMesa())) return {};

  const db = createServiceClient();
  const { data, error } = await db
    .from('table_sessions')
    .select(
      'id, table_number, party_size, waiter_id, seated_at, source, note,'
      + ' waiter:profiles!table_sessions_waiter_id_fkey(full_name),'
      + ' anfitrion:profiles!table_sessions_seated_by_fkey(full_name)',
    )
    .eq('restaurant_id', restaurantId)
    .is('closed_at', null)
    .order('seated_at', { ascending: true })
    .limit(300);

  if (error) return {};

  const out: Record<number, TableSeating> = {};
  for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
    const n = Number(row.table_number);
    if (!Number.isFinite(n) || n < 1) continue;
    const waiter = row.waiter as { full_name: string | null } | null | undefined;
    const anfitrion = row.anfitrion as { full_name: string | null } | null | undefined;
    /* El índice único parcial garantiza un solo turno abierto por mesa, así
       que aquí no puede haber choque; si lo hubiera (base sin la 128 en un
       entorno viejo), gana el más antiguo — que es el que la gente vive. */
    if (out[n]) continue;
    out[n] = {
      id: String(row.id),
      partySize: row.party_size == null ? null : Number(row.party_size),
      waiterId: (row.waiter_id as string | null) ?? null,
      waiterName: waiter?.full_name ?? null,
      seatedByName: anfitrion?.full_name ?? null,
      seatedAt: String(row.seated_at),
      source: (row.source as TableSeating['source']) ?? 'walk_in',
      note: (row.note as string | null) ?? null,
    };
  }
  return out;
}

/**
 * Las mesas donde de verdad se puede sentar a alguien ahora.
 *
 * Es lo que le faltaba al puesto de host (M-04): la lista de espera y las
 * reservas tenían estado «sentados» y ningún sitio donde decir en qué mesa,
 * así que el WhatsApp prometía «ya tenemos mesa lista» sin saber cuál. Una
 * mesa está libre si no tiene ni pedido vivo ni turno abierto — las dos
 * mitades de la ocupación, igual que en el salón.
 */
export async function getFreeTableNumbers(restaurantId: string): Promise<number[]> {
  if (!restaurantId) return [];
  const db = createServiceClient();

  const [{ data: themeRow }, ocupadas, sentadas] = await Promise.all([
    db.from('restaurant_themes').select('*').eq('restaurant_id', restaurantId).maybeSingle(),
    getActiveTableNumbers(restaurantId),
    getOpenTableSessions(restaurantId),
  ]);

  const total = resolveTheme((themeRow as ThemeRow) ?? null).config.dineInTableCount;
  const tomadas = new Set([
    ...Object.keys(ocupadas).map(Number),
    ...Object.keys(sentadas).map(Number),
  ]);

  const libres: number[] = [];
  for (let n = 1; n <= total; n++) if (!tomadas.has(n)) libres.push(n);
  return libres;
}

/**
 * Cierra el turno abierto de una mesa, si lo hay.
 *
 * Lo llama `freeTable` al cobrar: la gente se fue, así que la mesa deja de
 * estar sentada en el mismo acto en que sus pedidos pasan a DELIVERED. Sin
 * esto, cobrar dejaría la mesa ocupada para siempre —el peor fallo posible
 * de esta migración, porque el salón entero dejaría de vaciarse.
 *
 * No devuelve error a propósito: si la 128 todavía no corrió, cobrar tiene
 * que seguir funcionando igual que antes.
 */
export async function cerrarTurnoDeMesa(
  restaurantId: string,
  tableNumber: number,
): Promise<void> {
  if (!restaurantId || !tableNumber) return;
  if (!(await hayTurnosDeMesa())) return;
  const db = createServiceClient();
  await db
    .from('table_sessions')
    .update({ closed_at: new Date().toISOString() })
    .eq('restaurant_id', restaurantId)
    .eq('table_number', tableNumber)
    .is('closed_at', null);
}

/** Alguien a quien se le puede dar una mesa. */
export type WaiterOption = { id: string; name: string };

/**
 * Quién puede quedarse una mesa.
 *
 * Es la misma regla que `listWaiters` (lib/actions/staff.ts) —personal con
 * permiso «mesero»— más el DUEÑO, que en un local de veinte mesas trabaja el
 * salón como uno más y ahí no aparece porque su rol es otro.
 *
 * No se reutiliza `listWaiters` porque esa pasa por `buildMemberList`, que
 * consulta Auth una vez por persona para saber cómo entra cada quien: aquí
 * solo hacen falta el nombre y el id, y esto se carga con el salón entero
 * (ver M-23, el peso de esta pantalla).
 */
export async function getWaiterRoster(restaurantId: string): Promise<WaiterOption[]> {
  if (!restaurantId) return [];
  const db = createServiceClient();
  const { data, error } = await db
    .from('profiles')
    .select('id, full_name, role, permissions')
    .eq('restaurant_id', restaurantId)
    .in('role', ['RESTAURANT_OWNER', 'RESTAURANT_STAFF', 'RESTAURANT_WAITER'])
    .order('full_name', { ascending: true })
    .limit(60);

  if (error) return [];
  const out: WaiterOption[] = [];
  for (const p of data ?? []) {
    const role = p.role as string | null;
    const perms = (p.permissions as string[] | null) ?? null;
    // El dueño entra siempre; el personal, solo si toma pedidos.
    if (role !== 'RESTAURANT_OWNER' && !perms?.includes('mesero')) continue;
    const name = (p.full_name as string | null)?.trim();
    if (!name) continue;
    out.push({ id: String(p.id), name });
  }
  return out;
}
