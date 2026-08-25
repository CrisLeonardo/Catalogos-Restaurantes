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
   ============================================================ */

/** Lo marcado como agotado vuelve solo pasadas estas horas. */
export const AUTO_RESTORE_MS = 12 * 60 * 60 * 1000;

export interface AvailabilityFields {
  is_available?: boolean | null;
  unavailable_at?: string | null;
}

/** ¿Se marcó agotado hace tanto que ya volvió solo al menú? */
export function isAutoRestored(p: AvailabilityFields, now: number = Date.now()): boolean {
  if (p.is_available !== false) return false;
  // Sin marca de tiempo no hay reloj que corra: se queda fuera hasta que
  // alguien lo reactive a mano.
  if (!p.unavailable_at) return false;
  return now - new Date(p.unavailable_at).getTime() >= AUTO_RESTORE_MS;
}

/** ¿El comensal lo ve como no disponible AHORA? */
export function isUnavailable(p: AvailabilityFields, now: number = Date.now()): boolean {
  if (p.is_available !== false) return false;
  return !isAutoRestored(p, now);
}
