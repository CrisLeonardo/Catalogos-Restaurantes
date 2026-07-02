/* ============================================================
   MESA ESCANEADA — fuente única de verdad
   ------------------------------------------------------------
   El comensal "está en una mesa" solo si escaneó el QR de su mesa
   (la URL trae ?mesa=N). Ese número se guarda aquí y lo leen:
     · el botón flotante "Llamar al mesero" (solo aparece si hay mesa),
     · el checkout (la opción "Comer en local" solo aparece si hay mesa).

   Antes el checkout BORRABA la clave al leerla, dejando sin mesa al
   botón de llamar. Ahora nadie la borra al leer: solo se limpia al
   terminar un pedido DINE_IN (clearScannedTable) o al expirar el TTL
   (quien vuelve horas/días después por un acceso directo guardado no
   debe seguir viendo la mesa de su última visita).
   ============================================================ */

const STORAGE_PREFIX = 'qr-mesa-';
const TTL_MS = 3 * 60 * 60 * 1000; // 3 horas: cubre una visita normal al restaurante

function storageKey(restaurantId: string): string {
  return `${STORAGE_PREFIX}${restaurantId}`;
}

/** Mesa escaneada por el comensal, o null si no escaneó el QR de mesa (o ya expiró). */
export function getScannedTable(restaurantId: string): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const key = storageKey(restaurantId);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { table?: number; ts?: number };
    const n = parsed.table;
    const ts = parsed.ts;
    if (!Number.isFinite(n) || !n || n <= 0 || !Number.isFinite(ts)) {
      localStorage.removeItem(key);
      return null;
    }
    if (Date.now() - (ts as number) > TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return n as number;
  } catch {
    return null;
  }
}

/** Guarda la mesa escaneada (se llama desde el menú cuando llega ?mesa=N). */
export function setScannedTable(restaurantId: string, table: number): void {
  if (typeof window === 'undefined') return;
  try {
    if (table > 0) {
      localStorage.setItem(storageKey(restaurantId), JSON.stringify({ table, ts: Date.now() }));
    }
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
