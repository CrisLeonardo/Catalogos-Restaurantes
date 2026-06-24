/* ============================================================
   MESA ESCANEADA — fuente única de verdad
   ------------------------------------------------------------
   El comensal "está en una mesa" solo si escaneó el QR de su mesa
   (la URL trae ?mesa=N). Ese número se guarda aquí y lo leen:
     · el botón flotante "Llamar al mesero" (solo aparece si hay mesa),
     · el checkout (la opción "Comer en local" solo aparece si hay mesa).

   Antes el checkout BORRABA la clave al leerla, dejando sin mesa al
   botón de llamar. Ahora nadie la borra al leer: solo se limpia al
   terminar un pedido DINE_IN (clearScannedTable).
   ============================================================ */

const STORAGE_PREFIX = 'qr-mesa-';

function storageKey(restaurantId: string): string {
  return `${STORAGE_PREFIX}${restaurantId}`;
}

/** Mesa escaneada por el comensal, o null si no escaneó el QR de mesa. */
export function getScannedTable(restaurantId: string): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKey(restaurantId));
    if (!raw) return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** Guarda la mesa escaneada (se llama desde el menú cuando llega ?mesa=N). */
export function setScannedTable(restaurantId: string, table: number): void {
  if (typeof window === 'undefined') return;
  try {
    if (table > 0) localStorage.setItem(storageKey(restaurantId), String(table));
  } catch {
    /* localStorage no disponible */
  }
}

/** Limpia la mesa (al cerrar la sesión de mesa: tras un pedido DINE_IN). */
export function clearScannedTable(restaurantId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(storageKey(restaurantId));
  } catch {
    /* noop */
  }
}
