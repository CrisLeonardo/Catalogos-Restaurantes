/**
 * LA PAUSA DE PEDIDOS
 * ------------------------------------------------------------
 * Auditoría 2026-11-03, ficha 0.4 (X01). Única forma de responder «¿este
 * restaurante está recibiendo pedidos en línea ahora mismo?». La usan el
 * servidor al crear un pedido, el checkout, la tarjeta del panel y los
 * selectores de restaurante.
 *
 * Una pausa con hora de fin (migración 155) termina sola: nadie la apaga,
 * simplemente deja de valer. Por eso `orders_paused = true` con una fecha
 * ya pasada significa «la pausa terminó a esa hora», no «en pausa».
 *
 * Sin base de datos a propósito, para poder probarlo.
 */

export interface PausaGuardada {
  orders_paused: boolean | null | undefined;
  /** null/undefined = sin fecha (hasta reactivar, o base sin la migración 155). */
  orders_paused_until?: string | null;
}

/** Duraciones que ofrece el panel, en minutos. 0 = hasta reactivar. */
export const DURACIONES_PAUSA = [15, 30, 60, 0] as const;
export type DuracionPausa = (typeof DURACIONES_PAUSA)[number];

/** Lo más que se puede extender una pausa de una vez desde el panel. */
export const EXTENSION_PAUSA_MIN = 15;

export type EstadoPausa =
  | { tipo: 'recibiendo' }
  | { tipo: 'recibiendo'; terminoEn: string }
  | { tipo: 'pausa'; hasta: string | null };

export function estadoDePausa(r: PausaGuardada, ahora: number = Date.now()): EstadoPausa {
  if (r.orders_paused !== true) return { tipo: 'recibiendo' };
  const hasta = r.orders_paused_until ?? null;
  if (hasta && ahora >= new Date(hasta).getTime()) return { tipo: 'recibiendo', terminoEn: hasta };
  return { tipo: 'pausa', hasta };
}

export function pausaVigente(r: PausaGuardada, ahora: number = Date.now()): boolean {
  return estadoDePausa(r, ahora).tipo === 'pausa';
}

/** ¿Es una duración que ofrece el panel? */
export function esDuracionPausa(v: unknown): v is DuracionPausa {
  return typeof v === 'number' && (DURACIONES_PAUSA as readonly number[]).includes(v);
}

/** Fin de una pausa que empieza ahora. 0 = sin fin (null). */
export function finDePausa(minutos: DuracionPausa, ahora: number = Date.now()): string | null {
  return minutos === 0 ? null : new Date(ahora + minutos * 60_000).toISOString();
}

/**
 * «+15 min». Se suma a la hora de fin si todavía no llegó; si ya pasó, a
 * ahora. Una pausa sin fin no se extiende: ya dura hasta que la quiten.
 */
export function extenderPausa(hasta: string | null, ahora: number = Date.now()): string | null {
  if (!hasta) return null;
  const base = Math.max(new Date(hasta).getTime(), ahora);
  return new Date(base + EXTENSION_PAUSA_MIN * 60_000).toISOString();
}

/** «3:45 p. m.» en la zona del restaurante. */
export function horaDePausa(iso: string, timezone: string): string {
  const d = new Date(iso);
  const formato: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', hour12: true };
  try {
    return d.toLocaleTimeString('es-GT', { ...formato, timeZone: timezone });
  } catch {
    return d.toLocaleTimeString('es-GT', formato);
  }
}

/** «Volvemos a recibir pedidos a las 3:45 p. m.», o null si la pausa no tiene fin. */
export function fraseDeRegreso(hasta: string | null, timezone: string): string | null {
  if (!hasta) return null;
  // «p. m.» ya trae su punto: sin esto salía «3:45 p. m..».
  return conPunto(`Volvemos a recibir pedidos a las ${horaDePausa(hasta, timezone)}`);
}

/** El mensaje del dueño termina en punto, para poder seguirlo con otra frase. */
export function conPunto(texto: string): string {
  const t = texto.trim();
  return !t || /[.!?…]$/.test(t) ? t : `${t}.`;
}

/** Minutos que faltan, redondeando hacia arriba (59 s → «1 min»). */
export function minutosRestantes(hasta: string, ahora: number = Date.now()): number {
  return Math.max(0, Math.ceil((new Date(hasta).getTime() - ahora) / 60_000));
}
