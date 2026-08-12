import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getTenantSlug, isAdminSubdomain, isGroupSubdomain, getGroupSlug } from "@/lib/tenant";
import { DINER_COOKIE_NAME, LEGACY_DINER_COOKIE_PATTERN } from "@/lib/supabase/cookies";

/**
 * Proxy (Next.js 16 — antes llamado "middleware"):
 *  1. Resuelve el subdominio → slug del restaurante y lo propaga como
 *     header interno `x-tenant-slug` para que la app lo lea.
 *  2. Si el host es admin.SLUG.dominio, reescribe la ruta a /admin/* para que
 *     el panel de administración viva en un origen separado (PWA independiente).
 *  3. Resuelve el link ESTABLE de mesa/menú (`/m/<restaurantId>/...` en el
 *     dominio raíz — ver `stableTableUrl`/`stableMenuUrl` en lib/tenant.ts) y
 *     lo reescribe (rewrite, no redirect) al tenant vigente. A propósito NO es
 *     un redirect HTTP a otro origen: un link que salta de dominio antes de
 *     "instalar la app" es indistinguible del patrón que abusan las campañas
 *     de phishing con WebAPK (dispara la advertencia de Chrome/Play Protect),
 *     y además Android solo reabre una PWA instalada si el link tocado cae
 *     DENTRO del `scope` de esa instalación — un salto de origen nunca calza.
 *     Sirviendo el contenido real bajo `/m/<id>/` en el mismo origen (con su
 *     propio `scope`/`id` de manifest — ver src/app/manifest.ts), el link
 *     impreso funciona igual de "estable" sin ninguno de los dos problemas.
 *  4. Refresca la sesión de Supabase (si las variables están configuradas).
 */
/**
 * Headers que pone ESTE proxy y que el resto de la app trata como confiables.
 * Ninguno puede llegar del cliente: ver el borrado en proxy() más abajo.
 */
const INTERNAL_HEADERS = [
  "x-tenant-slug",
  "x-is-admin-subdomain",
  "x-org-slug",
  "x-admin-area",
  "x-tenant-stable-id",
  "x-pathname",
  "x-nonce",
] as const;

export async function proxy(request: NextRequest) {
  // 1) Tenant + detección de subdominio admin
  const host = request.headers.get("host");
  let slug = getTenantSlug(host);
  const adminSub = isAdminSubdomain(host);
  const groupSub = isGroupSubdomain(host);
  const groupSlug = getGroupSlug(host);
  const pathname = request.nextUrl.pathname;

  // 1b) Link estable de mesa/menú: solo aplica en el dominio raíz (sin slug,
  // sin subdominio admin/central) y con forma /m/<uuid>(/resto). El resto
  // puede ser vacío (menú general), un número puro (mesa — semántica vieja
  // de ?mesa=N) o cualquier otro path interno (/checkout, /mis-pedidos,
  // /pedido/<token>, /auth/callback — navegación DENTRO del link estable,
  // ver withTenantPrefix() en lib/tenant-client.ts).
  let stableId: string | null = null;
  let stableRewritePath: string | null = null;
  let stableMesa: string | null = null;
  if (!slug && !adminSub && !groupSub) {
    const m = pathname.match(/^\/m\/([0-9a-fA-F-]{36})(\/.*)?$/);
    if (m) {
      const [, restaurantId, rest = ""] = m;
      const tenant = await resolveStableLinkTenant(restaurantId);
      if (tenant && tenant.status === "active") {
        slug = tenant.slug;
        stableId = restaurantId;
        const mesaMatch = rest.match(/^\/(\d+)$/);
        if (rest === "" || mesaMatch) {
          stableRewritePath = "/";
          if (mesaMatch) stableMesa = mesaMatch[1];
        } else {
          stableRewritePath = rest;
        }
      } else {
        // Restaurante no encontrado/suspendido: a la landing, igual que el
        // fallback del viejo redirector — el comensal solo quería un menú.
        stableRewritePath = "/";
      }
    } else if (pathname === "/manifest.webmanifest") {
      // El navegador pide el manifest como un request APARTE (no lleva el
      // pathname /m/<id>/... — siempre es /manifest.webmanifest a secas), así
      // que no hay forma de reconocer el tenant por la URL de este request en
      // particular. Sí trae el Referer (la página que lo pidió), confirmado
      // en dev: mismo-origen bajo Referrer-Policy: strict-origin-when-cross-origin
      // manda la URL completa. Sin esto, cada instalación bajo el link
      // estable se quedaría con un manifest genérico "Leogin" en vez del
      // scope/nombre/ícono del restaurante.
      const refPath = safeUrlPathname(request.headers.get("referer"));
      const refMatch = refPath?.match(/^\/m\/([0-9a-fA-F-]{36})/);
      if (refMatch) {
        const tenant = await resolveStableLinkTenant(refMatch[1]);
        if (tenant && tenant.status === "active") {
          slug = tenant.slug;
          stableId = refMatch[1];
        }
      }
    }
  }

  // Área de PERSONAL (admin, panel de grupo, super admin): estas rutas usan
  // los 2 temas fijos del panel (claro/oscuro) en vez del tema del restaurante,
  // y solo les interesa la sesión del personal. El layout raíz lee este header.
  // EXCEPCIÓN: /preview/* renderiza el MENÚ del restaurante (iframe del editor)
  // aunque viva en el subdominio *-admin — si se marcara como área admin, las
  // vars de html[data-admin-area] pisarían el tema del tenant en la vista previa.
  const isAdminArea =
    (adminSub || groupSub ||
      pathname.startsWith("/admin") ||
      pathname.startsWith("/central") ||
      pathname.startsWith("/super")) &&
    !pathname.startsWith("/preview");

  const requestHeaders = new Headers(request.headers);
  // Los headers internos SIEMPRE se borran antes de escribirlos.
  //
  // Son la fuente de verdad de "en qué restaurante estoy" para todo lo que
  // corre detrás (layouts del panel, resolveGroupBranchId, getGroupContext,
  // las acciones del agente de impresión). Este objeto se construye COPIANDO
  // los headers de la petición, así que sin este borrado un header que venga
  // del cliente sobrevive intacto en cuanto la rama de abajo no lo pisa —y no
  // lo pisa cuando el host no resuelve slug (dominio raíz) ni subdominio
  // admin/central. Verificado: `curl -H "x-tenant-slug: otro" localhost:3000/admin/menu`
  // hacía que la app se comportara como si estuviera en el subdominio de
  // "otro". Hoy eso solo provoca un rebote, pero deja al cliente eligiendo el
  // tenant que ve el servidor, que es exactamente lo que no debe poder hacer.
  for (const h of INTERNAL_HEADERS) requestHeaders.delete(h);
  if (slug) requestHeaders.set("x-tenant-slug", slug);
  if (adminSub) requestHeaders.set("x-is-admin-subdomain", "1");
  if (groupSlug) requestHeaders.set("x-org-slug", groupSlug);
  if (isAdminArea) requestHeaders.set("x-admin-area", "1");
  // Ruta pedida. Un layout no puede leer el pathname por su cuenta, y el
  // candado de tenant lo necesita para devolver al Super Admin a donde iba
  // después de confirmar el modo soporte.
  requestHeaders.set("x-pathname", pathname);
  // Marca de "vine por el link estable de mesa" — usada por src/app/manifest.ts
  // (scope/id/start_url pasan a /m/<id>/) y por el cookie-path del comensal
  // más abajo (evita que la sesión de un restaurante se filtre a otro bajo el
  // mismo dominio raíz).
  if (stableId) requestHeaders.set("x-tenant-stable-id", stableId);

  // 2) Rewrite para subdominio admin.*
  //    admin.mi-restaurante.leogin.online/       → /admin/
  //    admin.mi-restaurante.leogin.online/menu   → /admin/menu
  //    Rutas /api/, /_next/ y archivos estáticos no se reescriben.
  let rewriteUrl: URL | null = null;
  if (adminSub) {
    const skip =
      pathname.startsWith("/api/") ||
      pathname.startsWith("/_next") ||
      pathname.startsWith("/admin") ||  // ya tiene el prefijo
      pathname.startsWith("/preview") || // iframe de vista previa del editor (misma origin)
      pathname === "/favicon.ico" ||
      /\.(svg|png|jpg|jpeg|gif|webp|ico)$/.test(pathname);
    if (!skip) {
      rewriteUrl = request.nextUrl.clone();
      rewriteUrl.pathname = pathname === "/" ? "/admin/" : `/admin${pathname}`;
    }
  } else if (groupSub) {
    // slug-central.dominio/  → /central   ·  /sucursales → /central/sucursales
    const skip =
      pathname.startsWith("/api/") ||
      pathname.startsWith("/_next") ||
      pathname.startsWith("/central") ||
      pathname === "/favicon.ico" ||
      /\.(svg|png|jpg|jpeg|gif|webp|ico)$/.test(pathname);
    if (!skip) {
      rewriteUrl = request.nextUrl.clone();
      rewriteUrl.pathname = pathname === "/" ? "/central" : `/central${pathname}`;
    }
  } else if (stableRewritePath !== null) {
    // /m/<id>(/resto) → mismo origen, sin el prefijo — ver 1b) más arriba.
    rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = stableRewritePath;
    if (stableMesa) rewriteUrl.searchParams.set("mesa", stableMesa);
  }

  // Nonce de esta petición. Tiene que ser único e impredecible: si un
  // atacante pudiera adivinarlo, inyectar un <script> con ese nonce
  // saltaría toda la política.
  //
  // Va en el REQUEST (no solo en la respuesta) porque Next lee de ahí la
  // CSP durante el render y le pone el nonce a sus propios scripts —el
  // runtime, los bundles de página, sus inlines— sin que haya que tocar
  // ninguna etiqueta a mano.
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const csp = buildCsp(nonce);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  // Fábrica de respuesta: NextResponse.rewrite si hay rewrite, next() si no.
  const makeResponse = () =>
    rewriteUrl
      ? NextResponse.rewrite(rewriteUrl!, { request: { headers: requestHeaders } })
      : NextResponse.next({ request: { headers: requestHeaders } });

  // 3) Refresco de sesión Supabase (solo si hay credenciales configuradas).
  //    Hay DOS sesiones independientes (ver lib/supabase/server.ts):
  //    · PERSONAL (cookie por defecto) — se refresca siempre.
  //    · COMENSAL (cookie DINER_COOKIE_NAME) — solo en rutas del menú público;
  //      en el área de personal esa sesión no se usa.
  //    getUser() sin cookie de sesión no llama a la red, así que refrescar
  //    "de más" cuando no hay sesión iniciada es gratis.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Cookies pendientes de escribir en la respuesta: se acumulan de AMBOS
  // clientes y se aplican una sola vez al final (si cada cliente recreara la
  // respuesta por su cuenta, el segundo pisaría las cookies del primero).
  type PendingCookie = { name: string; value: string; options: Record<string, unknown> };
  const pendingCookies: PendingCookie[] = [];

  if (supabaseUrl && anonKey) {
    // En producción compartimos la sesión en todos los subdominios usando
    // domain=.leogin.online. En local no se toca (los subdominios *.localhost
    // no admiten cookie-domain en todos los navegadores).
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN?.split(",")[0].trim() ?? "";
    const isLocal = !rootDomain || rootDomain.includes("localhost");
    const cookieDomain = isLocal ? undefined : `.${rootDomain.split(":")[0]}`;

    const refreshSession = async (cookieName?: string) => {
      // Solo la sesión del PERSONAL comparte dominio entre subdominios; la del
      // COMENSAL es host-only (vale solo para el restaurante donde se inició).
      const domain = cookieName ? undefined : cookieDomain;
      // Bajo el link estable (dominio raíz), la cookie del COMENSAL necesita
      // un path explícito por restaurante — si no, la sesión de invitado de
      // un restaurante quedaría visible en /m/<otro-id>/ del mismo host (algo
      // que el diseño host-only de esta cookie específicamente quiere evitar,
      // ver lib/supabase/cookies.ts).
      const cookiePath = cookieName && stableId ? `/m/${stableId}/` : undefined;
      const supabase = createServerClient(supabaseUrl, anonKey, {
        ...(cookieName ? { cookieOptions: { name: cookieName } } : {}),
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              request.cookies.set(name, value);
              pendingCookies.push({
                name,
                value,
                options: {
                  ...options,
                  ...(domain ? { domain } : {}),
                  ...(cookiePath ? { path: cookiePath } : {}),
                },
              });
            });
          },
        },
      });
      // IMPORTANTE: no metas lógica entre createServerClient y getUser().
      await supabase.auth.getUser();
    };

    // En PARALELO, no en serie. Son dos sesiones independientes (cookies con
    // nombres distintos; ninguna lee ni escribe la de la otra), pero cada
    // getUser() con sesión iniciada es una ida y vuelta a Supabase Auth: en
    // cadena, el menú público pagaba las dos antes de empezar a renderizar.
    // `pendingCookies` se acumula igual — el push es síncrono y JS no
    // intercala dentro de él.
    await Promise.all([
      refreshSession(), // personal
      ...(isAdminArea ? [] : [refreshSession(DINER_COOKIE_NAME)]), // comensal (menú público)
    ]);

    // Limpieza one-shot: expira las cookies del comensal v1 (`sb-leogin-diner`
    // y sus piezas `.N`), que eran de dominio ancho (.leogin.online) y dejaban
    // la sesión iniciada en TODOS los restaurantes. Con las mismas options de
    // dominio con que se crearon (host-only en local), o el navegador no las
    // borraría. Deja de dispararse sola cuando ya no llegan cookies viejas.
    for (const { name } of request.cookies.getAll()) {
      if (LEGACY_DINER_COOKIE_PATTERN.test(name)) {
        pendingCookies.push({
          name,
          value: "",
          options: { path: "/", maxAge: 0, ...(cookieDomain ? { domain: cookieDomain } : {}) },
        });
      }
    }
  }

  const response = makeResponse();
  for (const c of pendingCookies) {
    response.cookies.set(c.name, c.value, c.options);
  }
  // El link estable nunca debe cachearse: la resolución id→slug puede cambiar
  // (el restaurante renombra su slug) y una respuesta cacheada la dejaría
  // desactualizada — mismo motivo que el 302 no-store del redirector viejo.
  if (stableRewritePath !== null) {
    response.headers.set("Cache-Control", "no-store");
  }

  applySecurityHeaders(response.headers, csp);
  return response;
}

/** `pathname` de una URL potencialmente inválida (Referer ausente/malformado → null). */
function safeUrlPathname(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}

/**
 * Resuelve `restaurantId` → `{slug, status}` para el link estable de mesa
 * (`/m/<restaurantId>/...`). Consulta liviana vía REST directo a Supabase con
 * la anon key (misma política RLS que usa `getRestaurantSlugById` en
 * lib/db/restaurants.ts) — NO se reutiliza ese helper porque depende de
 * `next/headers` (vía lib/supabase/server.ts), que no está disponible en el
 * runtime de este proxy.
 */
async function resolveStableLinkTenant(
  restaurantId: string,
): Promise<{ slug: string; status: string } | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return null;

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/restaurants?id=eq.${restaurantId}&select=slug,status`,
      {
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
        cache: "no-store",
      },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ slug: string; status: string }>;
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Construye la CSP de la petición (hallazgo M-2 de la auditoría 2026-07-29).
 *
 * ── script-src: sin 'unsafe-inline', con nonce ──
 * Era el hueco real. Con 'unsafe-inline', cualquier XSS que lograra meter
 * un <script> en la página se ejecutaba; es la diferencia entre tener CSP
 * y aparentar tenerla. Ahora solo corre lo que lleve el nonce de ESTA
 * petición, y Next se lo pone solo a sus scripts.
 *
 * 'strict-dynamic' deja que un script ya confiado cargue a otros (así
 * funciona el arranque por partes de Next). A cambio ignora 'self' y las
 * listas de dominios: la confianza se propaga por la cadena, no por la
 * URL.
 *
 * El costo documentado de los nonces —perder render estático y caché de
 * CDN— aquí es nulo: la app ya se renderiza por petición en todas sus
 * páginas (multi-tenant por subdominio + sesión), y la caché del menú
 * público de la Fase 0 es de DATOS (unstable_cache), no de página, así
 * que no se toca.
 *
 * ── style-src: 'unsafe-inline' se queda, y es a propósito ──
 * El tema de cada restaurante se inyecta como <style> en el layout, y
 * media UI usa el atributo style=. Quitarlo exige mover todo eso a hojas
 * externas: es una refactorización grande y su beneficio de seguridad es
 * mucho menor que el de script-src (un estilo inyectado puede afear la
 * página o filtrar por selectores; un script inyectado se lleva la
 * sesión).
 *
 * ── connect-src e img-src: cerrados ──
 * Antes eran 'https:' a secas, o sea: cualquier dominio de internet. Con
 * eso, un script malicioso podía mandarse los datos del panel a donde
 * quisiera — justo lo que una CSP debería impedir. Ahora solo salen
 * peticiones al propio origen, a Supabase y a localhost (impresión).
 *
 * Otras decisiones que ya estaban y siguen valiendo:
 *  · frame-ancestors 'self' (NO 'none'): la vista previa del super admin
 *    embebe /preview/* en un iframe del MISMO origen.
 *  · NO se usa upgrade-insecure-requests: rompería la impresión local por
 *    ws://localhost en producción.
 */
function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV !== 'production';

  // Origen de Supabase: API REST, Realtime (wss) y Storage (imágenes).
  // Se lee del entorno porque cada despliegue tiene el suyo; si faltara,
  // se cae a un comodín de subdominio en vez de dejar la app sin datos.
  let supabaseHttp = 'https://*.supabase.co';
  let supabaseWs = 'wss://*.supabase.co';
  try {
    const u = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
    supabaseHttp = u.origin;
    supabaseWs = `wss://${u.host}`;
  } catch {
    /* sin URL configurada: quedan los comodines de arriba */
  }

  return [
    "default-src 'self'",

    // En dev React usa eval para reconstruir los stacks del servidor en el
    // navegador; en producción ni React ni Next lo necesitan.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,

    // Google Fonts (tipografía de cada tenant) y unpkg (CSS de Leaflet):
    // sin ellos las fuentes personalizadas y los mapas quedan sin estilo.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",

    // blob: y data: los usan los QR y las vistas previas de imagen antes
    // de subirlas. El resto de las fotos vive en Supabase Storage — es el
    // único dominio remoto que next.config.ts permite para <Image>.
    `img-src 'self' blob: data: ${supabaseHttp}`,

    "font-src 'self' data: https://fonts.gstatic.com",

    // localhost: el Agente de impresión Leogin, que corre en la máquina
    // del restaurante y se habla por http/ws local.
    `connect-src 'self' ${supabaseHttp} ${supabaseWs} http://localhost:* ws://localhost:* https://localhost:* wss://localhost:*`,

    "worker-src 'self' blob:",
    "frame-src 'self'",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

/**
 * Cabeceras de seguridad para toda la app.
 * HSTS solo en producción (en localhost rompería el dev por http).
 */
function applySecurityHeaders(headers: Headers, csp: string): void {
  // La misma política que viajó en el request: el nonce del header y el de
  // los <script> que renderizó Next tienen que coincidir, o el navegador
  // bloquea la página entera.
  headers.set('Content-Security-Policy', csp);
  headers.set('X-Content-Type-Options', 'nosniff');
  // Filtro XSS legacy del navegador desactivado (recomendación OWASP actual):
  // confiar en escapado + CSP. "1; mode=block" podía abrir vectores.
  headers.set('X-XSS-Protection', '0');
  headers.set('X-Frame-Options', 'SAMEORIGIN');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-DNS-Prefetch-Control', 'on');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), payment=(), geolocation=(self)');

  if (process.env.NODE_ENV === 'production') {
    headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }
}

export const config = {
  // Corre en todo menos estáticos e imágenes. sw.js es un archivo estático de
  // public/ (no depende de tenant-slug ni de sesión) pero el navegador lo
  // vuelve a pedir seguido (revisión de actualización del Service Worker);
  // sin esta exclusión, cada una de esas peticiones pagaba 1-2 round-trips
  // de refresco de sesión a Supabase de balde.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
