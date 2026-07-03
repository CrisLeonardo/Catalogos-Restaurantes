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
 * En producción la sesión se comparte entre subdominios (admin.*, slug.*,
 * *-central.*) usando `domain=.leogin.online`. El servidor (proxy + server
 * client) ya escribe la cookie con ese dominio. Si el navegador refresca el
 * token con el dominio por defecto (host-only), quedan DOS cookies con el
 * mismo nombre → el servidor lee una sesión inconsistente y cierra sesión de
 * forma intermitente ("solo la primera vez al entrar al mesero"). Forzar el
 * mismo dominio aquí elimina la cookie fantasma y el cierre de sesión.
 */
const rootDomainRaw = process.env.NEXT_PUBLIC_ROOT_DOMAIN?.split(",")[0].trim() ?? "";
const isLocalEnv = !rootDomainRaw || rootDomainRaw.includes("localhost");
/** `.leogin.online` en prod, undefined en local (no forzar dominio en localhost). */
const COOKIE_DOMAIN = isLocalEnv ? undefined : `.${rootDomainRaw.split(":")[0]}`;

function createWithCookieName(cookieName?: string) {
  const baseOptions = COOKIE_DOMAIN
    ? { domain: COOKIE_DOMAIN, path: "/", sameSite: "lax" as const }
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
