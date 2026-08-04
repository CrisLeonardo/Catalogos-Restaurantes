import { createServiceClient } from '@/lib/supabase/service';

/* ============================================================
   RATE LIMIT — limitador de tasa compartido (Postgres, mig. 100)
   ------------------------------------------------------------
   Ventana fija por clave (p.ej. "order:<ip>:<restaurante>").
   Pensado para frenar abuso/inundación en endpoints públicos sin
   login (createOrder, trackVisit).

   Antes vivía en un Map del proceso: inofensivo con 1 sola instancia
   de Render, pero cada instancia contaba por separado en cuanto se
   escalara horizontalmente. leogin_rate_limit() (mig. 100) hace el
   mismo conteo por ventana fija, pero en una tabla compartida — el
   límite es real sin importar cuántas instancias sirvan el tráfico.

   Fail-open a propósito: si la consulta a Postgres falla (blip de red,
   DB caída), se PERMITE la acción en vez de bloquearla. El rate limit es
   una defensa contra abuso, no el único candado (RLS + validaciones de
   negocio siguen aplicando) — tumbar checkout/login enteros por un
   problema de infraestructura del limitador sería un daño mayor que
   dejar pasar algunas acciones de más durante el blip.
   ============================================================ */

/**
 * Devuelve `true` si la acción se permite, `false` si excede el límite.
 * @param key      Identificador del cubo (incluye IP y/o restaurante).
 * @param max      Máximo de acciones permitidas en la ventana.
 * @param windowMs Tamaño de la ventana en milisegundos.
 */
export async function rateLimit(key: string, max: number, windowMs: number): Promise<boolean> {
  const db = createServiceClient();
  const { data, error } = await db.rpc('leogin_rate_limit', {
    p_key: key,
    p_max: max,
    p_window_ms: windowMs,
  });

  if (error) return true; // fail-open, ver nota arriba
  return data === true;
}

/** Extrae la IP del cliente de los headers (Render/Vercel ponen x-forwarded-for). */
export function clientIp(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return headers.get('x-real-ip')?.trim() || 'unknown';
}
