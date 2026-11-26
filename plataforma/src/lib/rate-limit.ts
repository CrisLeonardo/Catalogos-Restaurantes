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

/**
 * IP del cliente para limitar intentos y anotar accesos.
 *
 * Auditoría de lanzamiento 2026-11-23: antes se tomaba la PRIMERA entrada de
 * `x-forwarded-for`, y esa la escribe el propio cliente: los proxys agregan
 * la IP real al final, no la reemplazan. Comprobado en producción con
 * `/api/v1/me` (30 por minuto): 35 peticiones con una IP falsa distinta en
 * cada una nunca dieron 429; sin la cabecera, la 31 sí. Así se saltaban los
 * límites de PIN, login, recuperación de contraseña, segundo factor y pedidos.
 *
 * Render atiende detrás de Cloudflare (también `*.onrender.com`), y
 * Cloudflare pone en `cf-connecting-ip` la IP que se conectó a él,
 * reemplazando la que mande el cliente. Esa va primero. Sin Cloudflare
 * (desarrollo local u otro proveedor) se conserva el comportamiento anterior.
 *
 * Una IPv6 se agrupa por su /64: un solo hogar o teléfono recibe el bloque
 * entero y podría estrenar dirección en cada intento.
 */
export function clientIp(headers: Headers): string {
  const ip = ipDelCliente(headers);
  return ip ? agruparIpv6(ip) : 'unknown';
}

/** La IP tal cual, sin agrupar (la analítica la reenvía). Mismo orden de confianza que `clientIp`. */
export function ipDelCliente(headers: Headers): string | null {
  const cf = headers.get('cf-connecting-ip')?.trim();
  if (cf) return cf;
  const fwd = headers.get('x-forwarded-for')?.split(',')[0].trim();
  if (fwd) return fwd;
  return headers.get('x-real-ip')?.trim() || null;
}

/** `2001:db8:1:2:aaaa::1` → `2001:db8:1:2::/64`; una IPv4 queda igual. */
function agruparIpv6(ip: string): string {
  if (!ip.includes(':')) return ip;
  const sinZona = ip.split('%')[0].toLowerCase();
  // IPv4 escrita como IPv6 (::ffff:203.0.113.7): es una IPv4.
  const v4 = sinZona.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) return v4[1];
  const [izq, der] = sinZona.split('::');
  const a = izq ? izq.split(':') : [];
  const b = der !== undefined && der !== '' ? der.split(':') : [];
  const relleno = der !== undefined ? Array(Math.max(0, 8 - a.length - b.length)).fill('0') : [];
  const grupos = [...a, ...relleno, ...b];
  if (grupos.length !== 8 || grupos.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return sinZona;
  return `${grupos.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':')}::/64`;
}
