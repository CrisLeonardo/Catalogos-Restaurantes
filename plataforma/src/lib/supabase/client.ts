import { createBrowserClient } from "@supabase/ssr";
import { DINER_COOKIE_NAME, WALLET_COOKIE_NAME, cookieDomainForHost } from "@/lib/supabase/cookies";
import { getStableLinkPrefix } from "@/lib/tenant-client";

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
/** El dominio se decide POR HOST, no por la variable de entorno a secas:
    en un host que no cuelga del dominio configurado (la URL de Render, una
    previa) el navegador rechazaría la cookie sin decir nada. Ver
    `cookieDomainForHost`. */
function dominioDeCookie(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return cookieDomainForHost(window.location.hostname, process.env.NEXT_PUBLIC_ROOT_DOMAIN);
}

/* ------------------------------------------------------------------
   Un cliente por sesión, cacheado AQUÍ y no por @supabase/ssr.

   `createBrowserClient` guarda un único cliente por página y lo devuelve
   a todo el que lo pida, ignorando las opciones de las llamadas
   siguientes (`cachedBrowserClient`, con `isSingleton` implícito en el
   navegador). Con dos sesiones como las nuestras eso las funde: quien
   llame segundo recibe el cliente del primero, con SU clave de cookie.

   Se veía en el peor sitio posible: si en la página se construía antes el
   cliente del COMENSAL, "Continuar con Google" del personal guardaba el
   verificador PKCE como `sb-leogin-diner-v2-code-verifier`, y el callback
   del panel —que busca `sb-<ref>-auth-token-code-verifier`— se encontraba
   sin nada que canjear: "PKCE code verifier not found in storage", login
   con Google fallido. Al revés es igual de malo: la sesión del comensal
   escribiendo sobre la del panel, que es justo lo que las dos cookies
   separadas existen para impedir.

   Con `isSingleton: false` cada llamada crea el suyo, y la caché de aquí
   —por nombre de cookie— conserva la ventaja de no rehacer el cliente en
   cada render.
   ------------------------------------------------------------------ */
function nuevoCliente(cookieOptions: Record<string, unknown>) {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      isSingleton: false,
      ...(Object.keys(cookieOptions).length > 0 ? { cookieOptions } : {}),
    },
  );
}

const clientesPorCookie = new Map<string, ReturnType<typeof nuevoCliente>>();

function createWithCookieName(cookieName?: string) {
  // Solo el PERSONAL (sin cookieName) comparte dominio; el COMENSAL es host-only.
  const domain = cookieName ? undefined : dominioDeCookie();
  // Bajo el link estable de mesa (dominio raíz), la cookie del COMENSAL debe
  // quedar atada a `/m/<ref>` — si no, la sesión de invitado de un
  // restaurante se vería en /m/<otro-ref> del mismo host (ver proxy.ts, que
  // hace lo mismo del lado servidor para esta misma cookie). Sin barra
  // final: ver `dinerStableCookiePath`. Solo la del comensal, no la de la
  // cuenta Leogin.
  const stablePrefix = cookieName === DINER_COOKIE_NAME ? getStableLinkPrefix() : null;
  const baseOptions = domain
    ? { domain, path: "/", sameSite: "lax" as const }
    : stablePrefix
      ? { path: stablePrefix }
      : {};
  const cookieOptions = {
    ...baseOptions,
    ...(cookieName ? { name: cookieName } : {}),
  };

  const cacheKey = cookieName ?? "personal";
  const yaCreado = clientesPorCookie.get(cacheKey);
  if (yaCreado) return yaCreado;

  const cliente = nuevoCliente(cookieOptions);
  clientesPorCookie.set(cacheKey, cliente);
  return cliente;
}

/** Sesión del PERSONAL (panel admin, mesero, cocina, realtime del panel). */
export function createClient() {
  return createWithCookieName();
}

/** Sesión del COMENSAL (menú público: login Google, lealtad, cerrar sesión). */
export function createDinerClient() {
  return createWithCookieName(DINER_COOKIE_NAME);
}

/** Sesión de la CUENTA LEOGIN (`/billetera`): login con Google y cerrar sesión. */
export function createWalletClient() {
  return createWithCookieName(WALLET_COOKIE_NAME);
}
