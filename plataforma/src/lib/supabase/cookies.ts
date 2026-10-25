/**
 * Nombre de la cookie de sesión del COMENSAL (login con Google del menú).
 *
 * Vive en su propio módulo sin dependencias para que lo puedan importar por
 * igual el proxy (Edge runtime), el cliente de servidor (next/headers) y el
 * de navegador. La sesión del PERSONAL usa la cookie por defecto de Supabase
 * (`sb-<ref>-auth-token`); ver lib/supabase/server.ts para el porqué de la
 * separación.
 *
 * "v2": la primera versión (`sb-leogin-diner`) se escribía con
 * `domain=.leogin.online`, así que iniciar sesión en un restaurante te dejaba
 * con sesión iniciada en TODOS los restaurantes de la plataforma. La v2 es
 * host-only: la sesión pertenece únicamente al subdominio del restaurante
 * donde se inició. Se renombró (en vez de solo quitar el domain) porque una
 * cookie vieja de dominio ancho conviviría con la nueva host-only bajo el
 * mismo nombre y el servidor leería una sesión inconsistente ("cookie
 * fantasma"); el proxy expira las viejas con LEGACY_DINER_COOKIE_PATTERN.
 */
export const DINER_COOKIE_NAME = "sb-leogin-diner-v2";

/**
 * Cookies de la v1 (dominio ancho), incluidas sus piezas troceadas
 * (`sb-leogin-diner.0`, `.1`, …) que @supabase/ssr crea cuando la sesión no
 * cabe en 4 KB. No matchea la v2 (el sufijo `-v2` rompe el patrón).
 */
export const LEGACY_DINER_COOKIE_PATTERN = /^sb-leogin-diner(\.\d+)?$/;

/* ============================================================
   LA COOKIE DEL COMENSAL BAJO EL LINK ESTABLE (`/m/<ref>`)
   ------------------------------------------------------------
   En el dominio raíz todos los restaurantes comparten host, así que la
   cookie del comensal se ata a la ruta de SU link: `/m/<ref>`.

   SIN barra final. Hasta el 2026-10-25 (BIL-03) se escribía con
   `Path=/m/<ref>/`, y Next hace 308 de `/m/<ref>/` a `/m/<ref>` (quita la
   barra): el navegador no manda una cookie de ruta `/m/<ref>/` a
   `/m/<ref>`, así que en la PORTADA del QR general la sesión no existía
   —ni la de Google ni la del puente de la billetera—; solo en `/m/<ref>/4`
   y demás subpáginas. Sin barra no se cuela a `/m/<ref>otro` (RFC 6265
   §5.1.4: tras el prefijo tiene que venir una `/`).

   La vieja la retira el proxy (bloque "MUDANZA DE LA COOKIE DEL COMENSAL"
   en proxy.ts): con las dos vivas, en `/m/<ref>/…` llegarían dos cookies con
   el mismo nombre — otra cookie fantasma.
   ============================================================ */

export function dinerStableCookiePath(ref: string): string {
  return `/m/${ref}`;
}

/** La ruta de antes de BIL-03; solo para borrar la cookie que quedó ahí. */
export function legacyDinerStableCookiePath(ref: string): string {
  return `/m/${ref}/`;
}

/**
 * Marca de "este navegador ya pasó su sesión a la ruta nueva" en este link.
 * Hace falta porque en `/m/<ref>/…` llegan las cookies de las dos rutas y la
 * cabecera `Cookie` no dice de cuál es cada una: sin la marca, el proxy
 * tendría que reescribir la sesión entera en CADA petición, por si acaso.
 */
export const DINER_PATH_MARKER_COOKIE = "leogin-diner-ruta";

/** Los nombres de la sesión del comensal presentes (clave + trozos `.N`). */
export function dinerSessionCookieNames(presentNames: readonly string[]): string[] {
  return sessionCookieNames(DINER_COOKIE_NAME, presentNames);
}

/* ============================================================
   LEER LA COOKIE DE SESIÓN SIN CREERLE DE MÁS
   ------------------------------------------------------------
   Todo lo de abajo existe por un mismo problema: el navegador puede tener
   DOS cookies con el mismo nombre —una host-only y otra de dominio ancho—
   y en la cabecera `Cookie` las manda las dos, sin decir cuál es cuál. Es
   la "cookie fantasma" que ya nos costó la sesión del comensal (ver arriba,
   el porqué del `-v2`).

   La del PERSONAL nunca se renombró: sigue siendo la cookie por defecto de
   Supabase. Cualquier navegador que iniciara sesión ANTES de que el
   servidor empezara a escribirla con `domain=.<dominio>` conserva la vieja
   host-only, y desde entonces manda las dos. Como la sesión no cabe en 4 KB
   se parte en trozos (`.0`, `.1`, …), así que lo que se arma al leerlas es
   una mezcla de dos generaciones: un refresh token que Supabase no
   reconoce → `refresh_token_not_found` en CADA petición, para siempre,
   porque un `Set-Cookie` con `Domain=` solo borra la de dominio y nunca
   toca a la fantasma.
   ============================================================ */

/**
 * Códigos con los que Supabase dice "este refresh token ya no existe".
 * Los tres significan lo mismo de cara al navegador: soltar la cookie, no
 * reintentar — reintentar es justamente lo que llena los logs.
 */
const DEAD_SESSION_CODES = new Set([
  "refresh_token_not_found",
  "refresh_token_already_used",
  "session_not_found",
]);

export function isDeadSessionCode(code: string | null | undefined): boolean {
  return !!code && DEAD_SESSION_CODES.has(code);
}

/**
 * El verificador PKCE de un login con Google a medio camino.
 *
 * El proxy no participa en PKCE —lo escribe el navegador al pulsar
 * "Continuar con Google" y lo consume el callback— así que no tiene ningún
 * motivo legítimo para tocarlo, y sí uno muy concreto para no hacerlo: si
 * lo borra mientras el usuario está en la pantalla de Google, al volver ya
 * no hay con qué canjear el `code` y el login falla con `?auth_error=1`.
 */
export function isCodeVerifierCookie(name: string): boolean {
  return name.endsWith("-code-verifier");
}

/**
 * ¿Es la cookie de sesión del PERSONAL (o uno de sus trozos)?
 * Deja fuera la del comensal —las dos empiezan por `sb-`— y el verificador.
 */
export function isStaffSessionCookie(name: string): boolean {
  return (
    name.startsWith("sb-") &&
    !name.startsWith(DINER_COOKIE_NAME) &&
    !LEGACY_DINER_COOKIE_PATTERN.test(name) &&
    !isCodeVerifierCookie(name)
  );
}

/**
 * Nombres que vienen REPETIDOS en la cabecera `Cookie` cruda.
 *
 * Hay que mirar la cabecera en bruto: cualquier API que dé las cookies ya
 * parseadas (`request.cookies`, `cookies()` de next/headers) las guarda en
 * un mapa por nombre, así que el duplicado ya se perdió — se quedó con uno
 * de los dos valores en silencio. Un nombre repetido no es nunca algo que
 * la app haya querido: es siempre una cookie fantasma.
 */
export function duplicateCookieNames(cookieHeader: string | null | undefined): string[] {
  const seen = new Set<string>();
  const duplicated = new Set<string>();
  for (const pair of (cookieHeader ?? "").split(";")) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    const name = eq === -1 ? trimmed : trimmed.slice(0, eq);
    if (seen.has(name)) duplicated.add(name);
    else seen.add(name);
  }
  return [...duplicated];
}

/**
 * La clave con la que supabase-js guarda la sesión del PERSONAL:
 * `sb-<ref-del-proyecto>-auth-token`, sacada del host de la URL de Supabase.
 * Es la misma cuenta que hace supabase-js por dentro cuando no le pasas un
 * `storageKey`; el proxy la necesita para poder limpiar una sesión muerta
 * por su cuenta, sin depender de que auth-js lo haga a tiempo.
 */
export function defaultStorageKey(supabaseUrl: string): string | null {
  try {
    return `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
  } catch {
    return null;
  }
}

/**
 * Los nombres de cookie que componen UNA sesión: la clave a secas y sus
 * trozos `.0`, `.1`, … (@supabase/ssr parte el valor cuando no cabe en 4 KB).
 * No incluye el verificador PKCE aunque comparta prefijo — ver
 * `isCodeVerifierCookie`.
 */
export function sessionCookieNames(storageKey: string, presentNames: readonly string[]): string[] {
  return presentNames.filter(
    (name) =>
      !isCodeVerifierCookie(name) &&
      (name === storageKey || (name.startsWith(`${storageKey}.`) && /^\d+$/.test(name.slice(storageKey.length + 1)))),
  );
}

/**
 * El verificador PKCE de un login del PERSONAL (no el del comensal).
 * Es la prueba de que un `code` que llega a este navegador pertenece a un
 * acceso del panel empezado aquí mismo.
 */
export function isStaffCodeVerifierCookie(name: string): boolean {
  return isCodeVerifierCookie(name) && name.startsWith("sb-") && !name.startsWith(DINER_COOKIE_NAME);
}

/**
 * El `domain` con el que hay que escribir la cookie de sesión EN ESTE HOST.
 *
 * Antes salía de `NEXT_PUBLIC_ROOT_DOMAIN` a secas, sin mirar dónde se
 * estaba sirviendo. En el dominio de siempre funciona; en cualquier otro
 * host —la URL de Render, una previa, un dominio de marca anterior— el
 * navegador RECHAZA una cookie con `Domain=` de otro dominio, en silencio y
 * sin error. Ahí no fallaba solo la sesión: no se podía guardar ni el
 * verificador PKCE, así que "Continuar con Google" salía, volvía, y el
 * canje no encontraba nada. Sin una sola cookie en la petición y sin nada
 * en los logs que dijera por qué.
 *
 * Devuelve `undefined` (cookie host-only, válida en cualquier sitio) cuando
 * el host no cuelga de ninguno de los dominios configurados. Se pierde
 * compartir la sesión entre subdominios, que es justo lo que ese host no
 * tiene.
 */
export function cookieDomainForHost(
  host: string | null | undefined,
  rootDomainEnv: string | null | undefined,
): string | undefined {
  if (!host || !rootDomainEnv) return undefined;
  const hostname = host.toLowerCase().split(":")[0];
  for (const crudo of rootDomainEnv.split(",")) {
    const root = crudo.trim().toLowerCase().split(":")[0];
    // En local no se fuerza dominio: los subdominios *.localhost no lo
    // admiten en todos los navegadores.
    if (!root || root.includes("localhost")) continue;
    if (hostname === root || hostname.endsWith(`.${root}`)) return `.${root}`;
  }
  return undefined;
}
