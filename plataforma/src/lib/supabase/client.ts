import { createBrowserClient } from "@supabase/ssr";
import { DINER_COOKIE_NAME } from "@/lib/supabase/cookies";

/**
 * Clientes Supabase para el NAVEGADOR (Client Components, Realtime).
 * Usan solo la clave pública `anon` — protegida por RLS.
 *
 * HAY DOS SESIONES INDEPENDIENTES por navegador (ver lib/supabase/server.ts):
 *  · `createClient()`      → sesión del PERSONAL (cookie por defecto de Supabase).
 *  · `createDinerClient()` → sesión del COMENSAL (cookie propia DINER_COOKIE_NAME).
 * Separadas, el login con Google del comensal ya no pisa la sesión del panel
 * admin abierta en el mismo navegador (ni al revés).
 *
 * IMPORTANTE — dominio de cookie:
 * · PERSONAL: en producción la sesión se comparte entre subdominios (admin.*,
 *   *-central.*) usando `domain=.leogin.online`. El servidor (proxy + server
 *   client) ya escribe la cookie con ese dominio. Si el navegador refrescara
 *   el token con el dominio por defecto (host-only), quedarían DOS cookies con
 *   el mismo nombre → el servidor leería una sesión inconsistente y cerraría
 *   sesión de forma intermitente. Forzar el mismo dominio aquí elimina esa
 *   cookie fantasma.
 * · COMENSAL: host-only a propósito — la sesión de Google vale SOLO para el
 *   subdominio del restaurante donde se inició, no para toda la plataforma.
 *   Cliente y servidor escriben host-only por igual: sin cookies fantasma.
 */
const rootDomainRaw = process.env.NEXT_PUBLIC_ROOT_DOMAIN?.split(",")[0].trim() ?? "";
const isLocalEnv = !rootDomainRaw || rootDomainRaw.includes("localhost");
/** `.leogin.online` en prod, undefined en local (no forzar dominio en localhost). */
const COOKIE_DOMAIN = isLocalEnv ? undefined : `.${rootDomainRaw.split(":")[0]}`;

function createWithCookieName(cookieName?: string) {
  // Solo el PERSONAL (sin cookieName) comparte dominio; el COMENSAL es host-only.
  const domain = cookieName ? undefined : COOKIE_DOMAIN;
  const baseOptions = domain
    ? { domain, path: "/", sameSite: "lax" as const }
    : {};
  const cookieOptions = {
    ...baseOptions,
    ...(cookieName ? { name: cookieName } : {}),
  };

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    Object.keys(cookieOptions).length > 0 ? { cookieOptions } : undefined,
  );
}

/** Sesión del PERSONAL (panel admin, mesero, cocina, realtime del panel). */
export function createClient() {
  return createWithCookieName();
}

/** Sesión del COMENSAL (menú público: login Google, lealtad, cerrar sesión). */
export function createDinerClient() {
  return createWithCookieName(DINER_COOKIE_NAME);
}
