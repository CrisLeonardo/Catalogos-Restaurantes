/**
 * Las estaciones de un local: dónde se hace la comida.
 * ------------------------------------------------------------
 * Migración 130 (hallazgo M-07). Hasta aquí un restaurante tenía dos
 * destinos de impresión y punto —`print_agents.kitchen_target` y
 * `receipt_target`—, así que todo lo que se cocina salía por el mismo
 * papel y un local con barra mandaba las cervezas a la plancha.
 *
 * Una ESTACIÓN es Cocina, Barra, Parrilla: un nombre y una impresora.
 * Cada línea de un pedido se resuelve así, al imprimir:
 *
 *     producto.station_id ?? categoría.station_id ?? la de por defecto
 *
 * Este archivo solo LEE ese mapa. Repartir las líneas con él es trabajo
 * de `lib/printing/routing.ts`, que es una función pura y no toca la
 * base — la misma separación que `lib/table-payments.ts` con el reparto
 * del dinero.
 */
import { createServiceClient } from '@/lib/supabase/service';
import { faltaLaTabla } from '@/lib/db/migracion-ausente';

/** Una estación tal y como la configuró el local. */
export interface PrintStation {
  id: string;
  name: string;
  /** "winspool:EPSON TM-T20" | "tcp:192.168.1.51:9100". `null` = declarada
      pero todavía sin impresora asignada. */
  target: string | null;
  sortOrder: number;
  /** La que recoge lo que nadie mapeó, artículos libres incluidos. */
  isDefault: boolean;
}

/**
 * ¿Existe ya `print_stations`? (migración 130)
 *
 * Las migraciones de este proyecto corren a mano y con retraso: entre que
 * el código sale y la migración se aplica hay una ventana en la que nada
 * de la 130 existe. Preguntar por ello tumbaría el encolado, y quedarse
 * sin comanda es mucho peor que quedarse sin estaciones.
 *
 * UNA sola comprobación cubre las cuatro cosas que trae la 130 —la tabla
 * y las columnas `station_id` de `categories`, `products` y
 * `print_jobs`—: o entró toda o no entró nada. Mismo patrón y misma vida
 * corta que `hayTurnosDeMesa` (128) y `hayPagosDeMesa` (129): el día que
 * la 130 esté en producción, esto se borra.
 */
let cache: Promise<boolean> | null = null;

export function hayEstaciones(): Promise<boolean> {
  if (!cache) {
    cache = (async () => {
      try {
        const db = createServiceClient();
        const { error } = await db.from('print_stations').select('id').limit(1);
        // Cualquier otro fallo (red, permisos) NO significa que la tabla
        // falte: se asume que sí y el error se manifiesta donde de verdad
        // esté. Ver `migracion-ausente.ts` para los códigos.
        return !faltaLaTabla(error);
      } catch {
        return true;
      }
    })();
  }
  return cache;
}

/** Solo para las pruebas: olvida lo que se averiguó. */
export function _resetCacheEstaciones() {
  cache = null;
}

/**
 * Las estaciones del local, en el orden en que salen los papeles.
 * Lista vacía = este restaurante no tiene ninguna (o la 130 no ha
 * corrido), que significa «como antes de la 130»: un solo destino.
 */
export async function getPrintStations(restaurantId: string): Promise<PrintStation[]> {
  if (!(await hayEstaciones())) return [];

  const db = createServiceClient();
  const { data } = await db
    .from('print_stations')
    .select('id, name, target, sort_order, is_default')
    .eq('restaurant_id', restaurantId)
    .order('sort_order')
    .order('name');

  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    target: (r.target as string | null) ?? null,
    sortOrder: (r.sort_order as number) ?? 0,
    isDefault: (r.is_default as boolean) === true,
  }));
}

/**
 * El mapa que necesita el reparto de UNA comanda.
 *
 * `null` significa «aquí no hay estaciones» —la 130 no corrió, o el local
 * no ha configurado ninguna— y es la señal de que quien llama debe
 * imprimir exactamente como antes: un papel, al destino de siempre. Una
 * sola señal para los dos casos, porque para quien imprime son el mismo.
 */
export interface MapaDeEstaciones {
  /** Todas las del local, por `sort_order`. */
  estaciones: PrintStation[];
  /** La que recoge lo que nadie mapeó. `null` si el local se quedó sin
      ninguna marcada (el índice único impide dos, no impide cero). */
  porDefecto: PrintStation | null;
  /** `product_id` → id de estación, ya resuelto: primero la del producto,
      si no la de su categoría. Los productos que no aparecen aquí caen en
      la de por defecto, igual que los ítems SIN producto. */
  porProducto: Record<string, string>;
}

/**
 * Resuelve el mapa para los productos de un pedido concreto.
 *
 * Se pregunta por los productos del pedido y no por el catálogo entero a
 * propósito: esto corre dentro de «mandar a cocina», que ya es un camino
 * con varias consultas, y un local puede tener mil productos de los que
 * esta comanda usa cuatro.
 *
 * Se resuelve AL IMPRIMIR y no se congela en `order_items` porque
 * congelarlo obligaría a reescribir `place_order`, que es SQL y es la
 * función por la que pasa cada pedido del sistema. Y además es lo
 * correcto: si la barra se mudó de impresora, una reimpresión de hace dos
 * horas debe salir por la nueva.
 */
export async function getStationMap(
  restaurantId: string,
  productIds: readonly (string | null | undefined)[],
): Promise<MapaDeEstaciones | null> {
  const estaciones = await getPrintStations(restaurantId);
  if (estaciones.length === 0) return null;

  const porDefecto = estaciones.find((e) => e.isDefault) ?? null;
  const ids = [...new Set(productIds.filter((id): id is string => !!id))];
  const porProducto: Record<string, string> = {};

  // Un pedido entero de artículos libres no tiene un solo producto contra
  // el que preguntar: todo cae en la de por defecto y sobran las dos
  // consultas de abajo.
  if (ids.length === 0) return { estaciones, porDefecto, porProducto };

  const db = createServiceClient();
  const { data: productos } = await db
    .from('products')
    .select('id, category_id, station_id')
    .eq('restaurant_id', restaurantId)
    .in('id', ids);

  // Categorías que hacen falta: solo las de los productos que no traen
  // estación propia. Un producto con anulación no necesita a su categoría.
  const categoriasPendientes = new Set<string>();
  for (const p of productos ?? []) {
    const station = (p.station_id as string | null) ?? null;
    const categoria = (p.category_id as string | null) ?? null;
    if (station) porProducto[p.id as string] = station;
    else if (categoria) categoriasPendientes.add(categoria);
  }

  if (categoriasPendientes.size > 0) {
    const { data: categorias } = await db
      .from('categories')
      .select('id, station_id')
      .eq('restaurant_id', restaurantId)
      .in('id', [...categoriasPendientes]);

    const porCategoria = new Map<string, string>();
    for (const c of categorias ?? []) {
      const station = (c.station_id as string | null) ?? null;
      if (station) porCategoria.set(c.id as string, station);
    }

    for (const p of productos ?? []) {
      const id = p.id as string;
      if (porProducto[id]) continue;
      const station = porCategoria.get((p.category_id as string | null) ?? '');
      if (station) porProducto[id] = station;
    }
  }

  return { estaciones, porDefecto, porProducto };
}
