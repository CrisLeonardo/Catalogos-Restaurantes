/* ============================================================
   RATE LIMIT — limitador de tasa en memoria (por instancia)
   ------------------------------------------------------------
   Ventana fija por clave (p.ej. "order:<ip>:<restaurante>").
   Pensado para frenar abuso/inundación en endpoints públicos sin
   login (createOrder, trackVisit) sin añadir dependencias.

   Límites:
   · Vive en el proceso → con varias instancias (escalado horizontal)
     cada una cuenta por separado. Para un límite global y robusto,
     migrar a Redis/Upstash con la MISMA interfaz `rateLimit()`.
   · En serverless se reinicia en cada cold start. En un server
     persistente (Render) se mantiene entre requests, que es el caso.
   ============================================================ */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 50_000; // techo de memoria; si se supera, purga lo vencido

/**
 * Devuelve `true` si la acción se permite, `false` si excede el límite.
 * @param key     Identificador del cubo (incluye IP y/o restaurante).
 * @param max     Máximo de acciones permitidas en la ventana.
 * @param windowMs Tamaño de la ventana en milisegundos.
 */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);

  if (!b || now > b.resetAt) {
    if (buckets.size > MAX_KEYS) prune(now);
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (b.count >= max) return false;
  b.count += 1;
  return true;
}

/** Quita los cubos ya vencidos para que el Map no crezca sin límite. */
function prune(now: number): void {
  for (const [k, b] of buckets) {
    if (now > b.resetAt) buckets.delete(k);
  }
}

/** Extrae la IP del cliente de los headers (Render/Vercel ponen x-forwarded-for). */
export function clientIp(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return headers.get('x-real-ip')?.trim() || 'unknown';
}
