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

/**
 * ¿Esta carga viene de un ícono "Añadir a inicio" (modo standalone)?
 * "Añadir a inicio" (a diferencia de una instalación real de PWA) guarda la
 * URL EXACTA que estaba abierta al agregarlo — si el comensal lo hizo justo
 * tras escanear el QR, ese ícono queda apuntando a ...?mesa=N para siempre.
 * Un escaneo real de QR siempre abre en el navegador normal (nunca directo
 * en el ícono standalone), así que aquí NUNCA hay que confiar en ?mesa= de
 * la URL: solo refleja lo que ya haya vigente en localStorage + su TTL.
 */
export function isStandaloneLaunch(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
    if ((window.navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
  } catch {
    /* noop */
  }
  return false;
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

/** Milisegundos hasta que expire la sesión de mesa vigente (null = no hay). */
export function scannedTableMsLeft(restaurantId: string): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKey(restaurantId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ts?: number };
    if (!Number.isFinite(parsed.ts)) return null;
    const left = (parsed.ts as number) + TTL_MS - Date.now();
    return left > 0 ? left : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------
   Re-validación reactiva del TTL.
   El bug que esto corrige: getScannedTable() solo se leía AL MONTAR
   la página. En un teléfono real la PWA/pestaña queda viva en
   memoria horas o días — al reabrirla NO se vuelve a montar nada,
   así que "Llamar al mesero" y "Comer en local" seguían ofreciéndose
   aunque el TTL de 3 horas ya hubiera vencido. Estos helpers avisan
   cuándo re-leer: al volver la pestaña a primer plano (visibilitychange/
   focus/pageshow) y en el instante exacto en que vence el TTL.
   ------------------------------------------------------------ */

/**
 * Suscribe una re-validación de la mesa escaneada. Llama a `onChange` con el
 * valor vigente (número de mesa o null) cada vez que puede haber cambiado.
 * Devuelve la función de limpieza (para el return del useEffect).
 */
export function watchScannedTable(
  restaurantId: string,
  onChange: (table: number | null) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};

  let expiryTimer: ReturnType<typeof setTimeout> | null = null;

  const check = () => {
    onChange(getScannedTable(restaurantId));
    // Programa el flip exacto al vencer el TTL (si hay sesión activa) para
    // que la opción desaparezca incluso con la página abierta todo el rato.
    if (expiryTimer) clearTimeout(expiryTimer);
    const left = scannedTableMsLeft(restaurantId);
    if (left != null) {
      // +1s de margen; tope de 24h por sanidad de setTimeout.
      expiryTimer = setTimeout(check, Math.min(left + 1000, 86_400_000));
    }
  };

  const onVisible = () => { if (!document.hidden) check(); };

  // Primer check en el siguiente tick, NO síncrono: los efectos de React
  // corren hijo→padre, y es el padre (menu-shell) quien guarda el ?mesa=
  // recién escaneado en localStorage — un check síncrono aquí leería el
  // valor viejo y apagaría la mesa que se acaba de escanear.
  const firstCheck = setTimeout(check, 0);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', check);
  window.addEventListener('pageshow', check);

  return () => {
    clearTimeout(firstCheck);
    if (expiryTimer) clearTimeout(expiryTimer);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', check);
    window.removeEventListener('pageshow', check);
  };
}
