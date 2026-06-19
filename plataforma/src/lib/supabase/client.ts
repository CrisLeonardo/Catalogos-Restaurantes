import { createBrowserClient } from "@supabase/ssr";

/**
 * Cliente Supabase para el NAVEGADOR (Client Components, Realtime).
 * Usa solo la clave pública `anon` — protegida por RLS.
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

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    COOKIE_DOMAIN
      ? { cookieOptions: { domain: COOKIE_DOMAIN, path: "/", sameSite: "lax" } }
      : undefined,
  );
}
