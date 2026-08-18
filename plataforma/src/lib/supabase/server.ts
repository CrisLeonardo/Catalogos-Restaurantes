import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { DINER_COOKIE_NAME, defaultStorageKey, sessionCookieNames } from "@/lib/supabase/cookies";

export { DINER_COOKIE_NAME };

/**
 * Clientes Supabase para el SERVIDOR (Server Components, Route Handlers,
 * Server Actions). Leen/escriben la sesión vía cookies.
 *
 * HAY DOS SESIONES INDEPENDIENTES por navegador:
 *
 *  · PERSONAL (staff/dueño/super admin) → `createClient()`.
 *    Usa la cookie por defecto de Supabase (`sb-<ref>-auth-token`), así las
 *    sesiones existentes del personal sobreviven a los despliegues.
 *
 *  · COMENSAL (login con Google desde el menú) → `createDinerClient()`.
 *    Usa una cookie con nombre propio (DINER_COOKIE_NAME). Antes ambas
 *    identidades compartían un único "slot" de sesión: si el dueño probaba el
 *    menú y entraba con Google, esa sesión PISABA la del panel admin (y al
 *    revés), causando cierres de sesión fantasma. Con cookies separadas las
 *    dos conviven en el mismo navegador sin tocarse.
 *
 * ALCANCE de cada cookie:
 *  · PERSONAL → `.leogin.online` (todos los subdominios): la necesita para
 *    admin.slug.* y el dueño de grupo (slug-central.*).
 *  · COMENSAL → host-only: la sesión pertenece SOLO al subdominio del
 *    restaurante donde se inició. Antes era de dominio ancho y entrar en un
 *    restaurante te dejaba "logueado" en todos los demás de la plataforma.
 */
const rootDomainRaw = process.env.NEXT_PUBLIC_ROOT_DOMAIN?.split(",")[0].trim() ?? "";
const isLocalEnv = !rootDomainRaw || rootDomainRaw.includes("localhost");
/** `.leogin.online` en prod, undefined en local (no forzar dominio en localhost). */
const COOKIE_DOMAIN = isLocalEnv ? undefined : `.${rootDomainRaw.split(":")[0]}`;

async function createWithCookieName(cookieName?: string, ocultarSesionPrevia = false) {
  const cookieStore = await cookies();
  // Solo el PERSONAL (sin cookieName) comparte dominio; el COMENSAL es host-only.
  const domain = cookieName ? undefined : COOKIE_DOMAIN;
  // Bajo el link estable de mesa (dominio raíz, ver proxy.ts §1b), la cookie
  // del COMENSAL necesita quedar atada a `/m/<restaurantId>/` — si no, la
  // sesión de invitado de un restaurante (p.ej. tras el login de Google en
  // /auth/callback) se filtraría a /m/<otro-id>/ del mismo host. Mismo ajuste
  // que ya hacen proxy.ts y lib/supabase/client.ts para esta misma cookie.
  const stableId = cookieName ? (await headers()).get("x-tenant-stable-id") : null;
  const path = stableId ? `/m/${stableId}/` : undefined;

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      ...(cookieName ? { cookieOptions: { name: cookieName } } : {}),
      cookies: {
        getAll() {
          const todas = cookieStore.getAll();
          if (!ocultarSesionPrevia) return todas;
          // Ver createOAuthCallbackClient, más abajo.
          const clave = cookieName ?? defaultStorageKey(process.env.NEXT_PUBLIC_SUPABASE_URL!);
          if (!clave) return todas;
          const deLaSesion = new Set(sessionCookieNames(clave, todas.map(({ name }) => name)));
          return todas.filter(({ name }) => !deLaSesion.has(name));
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, {
                ...options,
                ...(domain ? { domain } : {}),
                ...(path ? { path } : {}),
              }),
            );
          } catch {
            // Llamado desde un Server Component: el middleware ya refresca
            // la sesión, así que se puede ignorar con seguridad.
          }
        },
      },
    },
  );
}

/** Sesión del PERSONAL (panel admin, mesero, cocina, grupo, super admin). */
export async function createClient() {
  return createWithCookieName();
}

/** Sesión del COMENSAL (menú público: cuenta Google, lealtad, mis pedidos). */
export async function createDinerClient() {
  return createWithCookieName(DINER_COOKIE_NAME);
}

/**
 * Cliente SOLO para canjear el código de un login con Google.
 *
 * Es igual que los de arriba salvo en una cosa: le esconde la cookie de
 * sesión que ya hubiera en el navegador. El motivo es que auth-js no lee
 * esa sesión de forma inocente — `createServerClient` registra un
 * `onAuthStateChange` que arranca solo, y si la sesión guardada no le
 * convence (forma inválida, trozos mezclados, refresco fallido) llama a
 * `_removeSession()`, que borra de la misma bolsa el VERIFICADOR PKCE.
 * Cuando eso gana la carrera contra `exchangeCodeForSession`, el canje se
 * queda sin verificador y muere con "PKCE code verifier not found in
 * storage", aunque la cookie hubiera llegado perfectamente.
 *
 * Aquí esa sesión previa no aporta nada: venimos justo a sustituirla. Sin
 * ella a la vista, auth-js no tiene nada que invalidar, el verificador
 * sobrevive y el canje escribe la sesión nueva con normalidad.
 */
export async function createOAuthCallbackClient(cookieName?: string) {
  return createWithCookieName(cookieName, true);
}
