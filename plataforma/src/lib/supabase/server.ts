import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { DINER_COOKIE_NAME } from "@/lib/supabase/cookies";

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

async function createWithCookieName(cookieName?: string) {
  const cookieStore = await cookies();
  // Solo el PERSONAL (sin cookieName) comparte dominio; el COMENSAL es host-only.
  const domain = cookieName ? undefined : COOKIE_DOMAIN;

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      ...(cookieName ? { cookieOptions: { name: cookieName } } : {}),
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, {
                ...options,
                ...(domain ? { domain } : {}),
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
