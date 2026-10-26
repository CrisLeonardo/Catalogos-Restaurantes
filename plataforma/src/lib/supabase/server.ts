import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { AuthError, type UserResponse } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { DINER_COOKIE_NAME, WALLET_COOKIE_NAME, cookieDomainForHost, defaultStorageKey, isCodeVerifierCookie, sessionCookieNames } from "@/lib/supabase/cookies";
import { aalDelToken, pasoSegundoFactor, type Aal } from "@/lib/auth/segundo-factor-policy";
import { autenticadoEnMs } from "@/lib/auth/reauth-policy";

export { DINER_COOKIE_NAME, WALLET_COOKIE_NAME };

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

async function createWithCookieName(cookieName?: string, ocultarSesionPrevia = false) {
  const cookieStore = await cookies();
  const cabeceras = await headers();
  // Solo el PERSONAL (sin cookieName) comparte dominio; el COMENSAL es
  // host-only. Y el dominio se decide por el HOST de esta petición: en un
  // host ajeno al configurado, escribir `Domain=` deja la cookie en nada
  // —el navegador la descarta— y la sesión no llega a existir.
  const domain = cookieName
    ? undefined
    : cookieDomainForHost(
        cabeceras.get("x-forwarded-host") ?? cabeceras.get("host"),
        process.env.NEXT_PUBLIC_ROOT_DOMAIN,
      );
  // Bajo el link estable de mesa (dominio raíz, ver proxy.ts §1b), la cookie
  // del COMENSAL necesita quedar atada a `/m/<restaurantId>/` — si no, la
  // sesión de invitado de un restaurante (p.ej. tras el login de Google en
  // /auth/callback) se filtraría a /m/<otro-id>/ del mismo host. Mismo ajuste
  // que ya hacen proxy.ts y lib/supabase/client.ts para esta misma cookie.
  // Solo la del comensal: la de la cuenta Leogin vive en `/billetera`, nunca
  // bajo un `/m/<id>/`.
  const stableId = cookieName === DINER_COOKIE_NAME ? cabeceras.get("x-tenant-stable-id") : null;
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
            cookiesToSet.forEach(({ name, value, options }) => {
              // El verificador PKCE solo lo toca el callback de OAuth, que
              // es quien lo canjea y quien debe limpiarlo después. Cualquier
              // otra petición que decida que la sesión no vale —una Server
              // Action, un Route Handler— llamará a _removeSession(), que
              // arrastra el verificador con ella. Si eso ocurre mientras la
              // persona está en la pantalla de Google, al volver ya no hay
              // con qué canjear el código: el acceso muere y sin motivo
              // visible. En el proxy esto ya estaba tapado; aquí no.
              if (isCodeVerifierCookie(name) && !ocultarSesionPrevia) return;
              cookieStore.set(name, value, {
                ...options,
                ...(domain ? { domain } : {}),
                ...(path ? { path } : {}),
              });
            });
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

/**
 * `auth.getUser()` del PERSONAL, UNA vez por petición.
 *
 * Cada `getUser()` es una ida y vuelta a Supabase Auth (valida el token en
 * el servidor, no lo lee de la cookie). Y un solo render del panel lo
 * preguntaba hasta cuatro veces, en cadena: el layout, getAdminContext,
 * getMyMemberships y myOrganizationId — cada uno con su propio cliente.
 * Con Render en Oregón y la base en Virginia son ~70 ms cada una antes de
 * poder pedir nada más. Mismo resultado, mismo nivel de verificación: solo
 * se deja de repetir la pregunta dentro de la misma petición.
 */
/**
 * La sesión del personal tal como la valida Supabase, SIN mirar el segundo
 * factor, y el nivel (`aal`) de su token. Solo para quien tiene que atender a
 * una sesión que aún debe el código: la pantalla /admin/dos-pasos, el login y
 * el callback de Google. Todo lo demás usa `getStaffUser()`.
 */
export const getStaffSessionRaw = cache(async () => {
  const supabase = await createClient();
  let res = await supabase.auth.getUser();
  /* Un fallo de RED (tiempo agotado, Auth que no contesta, un 5xx) no es «no
     hay sesión», pero el layout lo trataba igual y mandaba al login a quien
     tenía la sesión viva («Continuar como…»), de vez en cuando y sobre todo
     con el servidor cargado (auditoría 2026-10-02, N-10). Se reintenta UNA
     vez; «sin sesión» de verdad (sin cookie, token inválido) se devuelve
     tal cual. */
  const err = res.error as (Error & { status?: number }) | null;
  const transitorio = !!err && (
    err.name === 'AuthRetryableFetchError' || err.status === 0 || (err.status ?? 0) >= 500
  );
  if (transitorio) {
    await new Promise((r) => setTimeout(r, 150));
    res = await supabase.auth.getUser();
  }

  /* El nivel sale del MISMO cliente que acaba de validar el token con
     Supabase Auth: getSession() aquí devuelve la sesión que getUser() ya
     cargó y comprobó, sin otra ida y vuelta ni otro refresco. */
  let aal: Aal = null;
  // Cuándo demostró esta sesión ser quien es (ACC-09, lib/auth/reauth.ts).
  let autenticadoEn: number | null = null;
  if (res.data.user) {
    const { data } = await supabase.auth.getSession();
    aal = aalDelToken(data.session?.access_token);
    autenticadoEn = autenticadoEnMs(data.session?.access_token);
  }
  return {
    res,
    aal,
    autenticadoEn,
    paso: res.data.user ? pasoSegundoFactor(res.data.user, aal) : ('listo' as const),
  };
});

/**
 * `auth.getUser()` del PERSONAL, UNA vez por petición.
 *
 * Cada `getUser()` es una ida y vuelta a Supabase Auth (valida el token en
 * el servidor, no lo lee de la cookie). Y un solo render del panel lo
 * preguntaba hasta cuatro veces, en cadena: el layout, getAdminContext,
 * getMyMemberships y myOrganizationId — cada uno con su propio cliente.
 * Con Render en Oregón y la base en Virginia son ~70 ms cada una antes de
 * poder pedir nada más. Mismo resultado, mismo nivel de verificación: solo
 * se deja de repetir la pregunta dentro de la misma petición.
 *
 * SEGUNDO FACTOR (PLAN_ACCESO_Y_MONITOREO, ACC-01): una sesión que todavía
 * debe el código de su app autenticadora —el Super Admin recién entrado con
 * su contraseña o con Google— aquí cuenta como «sin sesión». Es a propósito
 * el ÚNICO sitio: las ~80 pantallas y acciones que deciden algo con
 * `role === 'SUPER_ADMIN'` (y varias le dan el cliente de servicio) pasan
 * todas por esta función, así que ninguna puede olvidarse de comprobarlo.
 * La base de datos lo exige por su lado (migración 137).
 */
export const getStaffUser = cache(async (): Promise<UserResponse> => {
  const { res, paso } = await getStaffSessionRaw();
  if (paso !== 'listo') {
    return { data: { user: null }, error: new AuthError('Falta el segundo factor', 401) };
  }
  return res;
});

/** Sesión del COMENSAL (menú público: cuenta Google, lealtad, mis pedidos). */
export async function createDinerClient() {
  return createWithCookieName(DINER_COOKIE_NAME);
}

/**
 * Sesión de la CUENTA LEOGIN del comensal (`/billetera`, dominio raíz).
 * No es la sesión de ningún restaurante: ver WALLET_COOKIE_NAME.
 */
export async function createWalletClient() {
  return createWithCookieName(WALLET_COOKIE_NAME);
}

/** El usuario de la cuenta Leogin, validado con Supabase Auth, una vez por petición. */
export const getWalletUser = cache(async () => {
  const supabase = await createWalletClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
});

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
