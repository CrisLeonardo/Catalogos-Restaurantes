import { stableRootUrl, subdomainUrl } from '@/lib/tenant';

/* ============================================================
   EL PUENTE DE SESIÓN: BILLETERA → RESTAURANTE
   ------------------------------------------------------------
   PLAN_BILLETERA_COMENSAL_2026-10-25, BIL-02.

   La cuenta Leogin vive en el dominio raíz (`/billetera`, cookie
   WALLET_COOKIE_NAME) y la sesión de cada restaurante en su propio host
   (cookie del comensal, host-only). Una cookie no cruza de host a host,
   y eso es a propósito: entrar en un restaurante NO debe dejarte dentro
   de todos (lib/supabase/cookies.ts, el porqué del `-v2`).

   El puente pasa la identidad de uno a otro sin compartir cookies:

     /billetera/puente  (raíz)       → crea un código de un solo uso
     /auth/puente?codigo=…  (restaurante) → lo canjea en SU servidor y
                                        abre ahí la sesión del comensal

   Aquí solo está lo que no toca la base ni Node (lo usa también el menú,
   en el navegador): la ruta de vuelta y a qué URL se manda. El código y su
   hash, en lib/cuenta/puente-codigo.ts; la base, en lib/cuenta/puente-db.ts.
   ============================================================ */

/** Cuánto vive un código. Basta para un salto de redirección. */
export const PUENTE_TTL_MS = 60_000;

/** Por dónde se entra al restaurante: su subdominio o el link estable `/m/<slug>/`. */
export type ViaPuente = 'sub' | 'm';

/** ¿Tiene forma de código nuestro? Corta la basura antes de ir a la base. */
export function esCodigoValido(codigo: string | null | undefined): codigo is string {
  return typeof codigo === 'string' && /^[A-Za-z0-9_-]{43}$/.test(codigo);
}

/**
 * La ruta de vuelta DENTRO del restaurante, saneada.
 *
 * Solo rutas relativas del mismo origen (`/`, `/checkout?x=1`): nada de
 * `//otro.com`, `/\otro.com` (algunos navegadores lo leen como `//`), URLs
 * absolutas ni caracteres de control. Lo que no pasa, vuelve al inicio.
 */
export function vueltaSegura(cruda: string | null | undefined): string {
  if (!cruda || typeof cruda !== 'string') return '/';
  if (cruda.length > 512) return '/';
  if (!cruda.startsWith('/')) return '/';
  if (cruda.startsWith('//') || cruda.startsWith('/\\')) return '/';
  if (/[\u0000-\u001f\u007f\\]/.test(cruda)) return '/';
  return cruda;
}

export function viaSegura(cruda: string | null | undefined): ViaPuente {
  return cruda === 'm' ? 'm' : 'sub';
}

/** Raíz del restaurante según por dónde se entra (sin barra final). */
export function baseDelRestaurante(slug: string, via: ViaPuente): string {
  return via === 'm' ? `${stableRootUrl()}/m/${slug}` : subdomainUrl(slug);
}

/** A dónde se manda el código para canjearlo. */
export function urlDeCanje(slug: string, via: ViaPuente, codigo: string): string {
  return `${baseDelRestaurante(slug, via)}/auth/puente?codigo=${encodeURIComponent(codigo)}`;
}

/** Volver al restaurante SIN sesión (el comensal dijo «Ahora no»). */
export function urlSinPuente(slug: string, via: ViaPuente, vuelta: string): string {
  const ruta = vueltaSegura(vuelta);
  return `${baseDelRestaurante(slug, via)}${ruta === '/' && via === 'm' ? '' : ruta}`;
}

/**
 * Dirección de `/billetera/puente` para un restaurante: la arma el menú
 * (botón «Entrar con mi cuenta Leogin», con el id) y la billetera (con el
 * slug). `/billetera/puente` acepta los dos.
 */
export function urlDelPuente(restaurante: string, via: ViaPuente, vuelta: string): string {
  const q = new URLSearchParams({ r: restaurante, via, vuelta: vueltaSegura(vuelta) });
  return `${stableRootUrl()}/billetera/puente?${q.toString()}`;
}
