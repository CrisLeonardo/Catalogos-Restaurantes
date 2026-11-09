/* ============================================================
   ¿ESTE PLATILLO SE PUEDE PEDIR AHORA MISMO?
   ------------------------------------------------------------
   Auditoría 1.10 (O04, F17): agotar dice HASTA CUÁNDO.
     · «Hasta mañana»: vuelve a la hora de corte del siguiente día de
       negocio (`vuelve_at`, lo calcula la base con la zona y el corte
       del local, migración 180).
     · «Hasta reponer»: no vuelve por reloj; al haber existencias la
       base lo devuelve sola.
     · «Hasta que lo active» y «por ingrediente»: no vuelven solos.
   Antes había un reloj fijo de 12 h para todo lo agotado, lo hubiera
   decidido el negocio o no.

   La regla vive aquí para que el menú, el servidor al validar un pedido,
   el agente sin conexión, Catálogo, Inventario y Servicio contesten la
   MISMA pregunta (auditoría 2026-10-02, CAT-01): si se calculara por
   separado, el panel diría que algo está fuera mientras los clientes lo
   piden.

   EXISTENCIAS. Sin existencias manda sobre todo: hasta que se reponga,
   no se puede pedir. El menú público no recibe el stock (dato de
   negocio): lib/db/menu.ts lo traduce antes a «agotado sin vuelta».
   ============================================================ */

export type AgotadoHasta = 'manana' | 'reponer' | 'manual';
export type AgotadoMotivo = AgotadoHasta | 'ingrediente';

/** Las tres opciones al agotar, en el orden en que se ofrecen. */
export const OPCIONES_AGOTADO: { key: AgotadoHasta; label: string; detalle: string }[] = [
  { key: 'manana', label: 'Hasta mañana', detalle: 'Vuelve al empezar el siguiente día, a la hora de corte del local.' },
  { key: 'reponer', label: 'Hasta reponer', detalle: 'Vuelve cuando registres existencias o lo marques disponible.' },
  { key: 'manual', label: 'Hasta que lo active', detalle: 'No vuelve solo.' },
];

/** La que viene elegida (decisión del dueño, 2026-11-09). */
export const AGOTADO_POR_OMISION: AgotadoHasta = 'manana';

export interface AvailabilityFields {
  is_available?: boolean | null;
  unavailable_at?: string | null;
  /** Cuándo vuelve un agotado «hasta mañana»; null = no vuelve por reloj. */
  vuelve_at?: string | null;
  agotado_motivo?: string | null;
  /** Solo los conoce el panel y el servidor; el menú público no los recibe. */
  track_stock?: boolean | null;
  stock?: number | null;
}

/** ¿Lleva control de inventario y se quedó en cero? (`stock` nulo cuenta
 *  como cero: es lo mismo que hace `place_order` con su `coalesce`.) */
export function isOutOfStock(p: AvailabilityFields): boolean {
  return p.track_stock === true && Number(p.stock ?? 0) <= 0;
}

/** ¿Se agotó «hasta mañana» y ya llegó la hora? */
export function isAutoRestored(p: AvailabilityFields, now: number = Date.now()): boolean {
  if (p.is_available !== false) return false;
  if (isOutOfStock(p)) return false;
  if (!p.vuelve_at) return false;
  return now >= new Date(p.vuelve_at).getTime();
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
 * Platillos, ficha del platillo, Tomar pedidos).
 */
export function withEffectiveAvailability<T extends AvailabilityFields>(items: T[], now: number = Date.now()): T[] {
  return items.map((p) => {
    const disponible = !isUnavailable(p, now);
    return p.is_available === disponible ? p : { ...p, is_available: disponible };
  });
}

/** «mañana a las 05:00», «hoy a las 05:00» o «el lun 10 a las 05:00», en la zona del local. */
export function cuandoVuelveTexto(vuelveAt: string, timezone = 'America/Guatemala', now: number = Date.now()): string {
  const d = new Date(vuelveAt);
  const fecha = (x: Date) => {
    try { return x.toLocaleDateString('en-CA', { timeZone: timezone }); } catch { return x.toLocaleDateString('en-CA'); }
  };
  let hora: string;
  try {
    hora = d.toLocaleTimeString('es-GT', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    hora = d.toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  const hoy = fecha(new Date(now));
  const manana = fecha(new Date(now + 24 * 3600_000));
  if (fecha(d) === hoy) return `hoy a las ${hora}`;
  if (fecha(d) === manana) return `mañana a las ${hora}`;
  let dia: string;
  try { dia = d.toLocaleDateString('es-GT', { timeZone: timezone, weekday: 'short', day: 'numeric' }); } catch { dia = d.toLocaleDateString('es-GT'); }
  return `el ${dia} a las ${hora}`;
}

/** Por qué está agotado y cuándo vuelve, en una línea para el panel. */
export function razonDeAgotado(p: AvailabilityFields, timezone?: string, now: number = Date.now()): string {
  if (isOutOfStock(p)) return 'Sin existencias · vuelve al reponer';
  if (p.is_available !== false) return '';
  switch (p.agotado_motivo) {
    case 'manana': return p.vuelve_at ? `Agotado · vuelve ${cuandoVuelveTexto(p.vuelve_at, timezone, now)}` : 'Agotado hasta mañana';
    case 'reponer': return 'Agotado · vuelve al reponer';
    case 'ingrediente': return 'Le falta un ingrediente · vuelve al decir «Ya hay»';
    default: return 'Agotado · hasta que lo actives';
  }
}
