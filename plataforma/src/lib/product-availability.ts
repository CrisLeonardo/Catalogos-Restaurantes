/* ============================================================
   ¿ESTE PLATILLO SE PUEDE PEDIR AHORA MISMO?
   ------------------------------------------------------------
   Marcar un platillo como agotado NO es para siempre: a las 12
   horas vuelve solo al menú. La razón es que "agotado" en un
   restaurante casi siempre significa "se acabó HOY", y nadie se
   acuerda de reactivar a la mañana siguiente lo que se acabó
   anoche — el platillo se quedaba invisible durante semanas.

   La regla vivía suelta dentro de components/menu/catalog.tsx,
   que es el menú del comensal. Está aquí para que el panel
   pueda contestar la misma pregunta con la MISMA regla: si las
   dos se calcularan por separado, el panel acabaría diciéndole
   al restaurante que algo está fuera del menú mientras los
   clientes lo están pidiendo.

   Y eso fue exactamente lo que pasó (auditoría 2026-10-02, CAT-01):
   el reloj de 12 h solo existía en el menú. Nadie vuelve a poner
   `is_available = true` en la base, así que el servidor, la lista
   de Platillos y Tomar pedidos seguían leyendo la columna cruda:
   el comensal veía el platillo con su «+», lo pedía, y al confirmar
   le salía «ya no está disponible»; el mesero, a la vez, lo tenía
   bloqueado. Ahora TODOS preguntan aquí.

   EXISTENCIAS. Cuando el inventario llega a cero, `place_order`
   marca el platillo agotado CON hora (`unavailable_at = now()`),
   así que a las 12 h el reloj lo devolvía al menú aunque siguiera
   sin existencias — y `place_order` lo rechaza por stock. Por eso
   «sin existencias» manda sobre el reloj: hasta que se reponga, no
   se puede pedir. El menú público no recibe el stock (es dato de
   negocio): lib/db/menu.ts lo traduce antes a «agotado sin reloj».
   ============================================================ */

/** Lo marcado como agotado vuelve solo pasadas estas horas. */
export const AUTO_RESTORE_MS = 12 * 60 * 60 * 1000;

export interface AvailabilityFields {
  is_available?: boolean | null;
  unavailable_at?: string | null;
  /** Solo los conoce el panel y el servidor; el menú público no los recibe. */
  track_stock?: boolean | null;
  stock?: number | null;
}

/** ¿Lleva control de inventario y se quedó en cero? (`stock` nulo cuenta
 *  como cero: es lo mismo que hace `place_order` con su `coalesce`.) */
export function isOutOfStock(p: AvailabilityFields): boolean {
  return p.track_stock === true && Number(p.stock ?? 0) <= 0;
}

/** ¿Se marcó agotado hace tanto que ya volvió solo al menú? */
export function isAutoRestored(p: AvailabilityFields, now: number = Date.now()): boolean {
  if (p.is_available !== false) return false;
  if (isOutOfStock(p)) return false;
  // Sin marca de tiempo no hay reloj que corra: se queda fuera hasta que
  // alguien lo reactive a mano.
  if (!p.unavailable_at) return false;
  return now - new Date(p.unavailable_at).getTime() >= AUTO_RESTORE_MS;
}

/** ¿El comensal lo ve como no disponible AHORA? */
export function isUnavailable(p: AvailabilityFields, now: number = Date.now()): boolean {
  if (isOutOfStock(p)) return true;
  if (p.is_available !== false) return false;
  return !isAutoRestored(p, now);
}

/**
 * La misma lista con `is_available` ya resuelto: `true` si hoy se puede
 * pedir. Es para las pantallas que pintan la columna tal cual (lista de
 * Platillos, ficha del platillo, Tomar pedidos): se les entrega la
 * respuesta en vez de enseñarles la regla a cada una.
 */
export function withEffectiveAvailability<T extends AvailabilityFields>(items: T[], now: number = Date.now()): T[] {
  return items.map((p) => {
    const disponible = !isUnavailable(p, now);
    return p.is_available === disponible ? p : { ...p, is_available: disponible };
  });
}
