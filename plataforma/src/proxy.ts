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
  if (slug) requestHeaders.set("x-tenant-slug", slug);
  if (adminSub) requestHeaders.set("x-is-admin-subdomain", "1");
  if (groupSlug) requestHeaders.set("x-org-slug", groupSlug);
  if (isAdminArea) requestHeaders.set("x-admin-area", "1");
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

    await refreshSession(); // personal
    if (!isAdminArea) {
      await refreshSession(DINER_COOKIE_NAME); // comensal (menú público)
    }

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

  applySecurityHeaders(response.headers);
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
 * Cabeceras de seguridad para toda la app.
 *
 * Notas de diseño (probadas contra cómo funciona Leogin):
 *  · CSP sin nonce: la app usa estilos en línea por todos lados → se requiere
 *    'unsafe-inline' en style-src. Se mantiene 'unsafe-eval' por exports PDF/Excel
 *    (jspdf/exceljs) y debug de React en dev.
 *  · frame-ancestors 'self' (NO 'none'): la vista previa del super admin embebe
 *    /preview/* en un iframe del MISMO origen; 'none' la rompería.
 *  · connect-src permite https:/wss: (Supabase + Realtime) y localhost (impresión
 *    QZ / agente Leogin). NO se usa upgrade-insecure-requests para no romper
 *    la impresión local por ws://localhost en producción.
 *  · HSTS solo en producción (en localhost rompería el dev por http).
 */
function applySecurityHeaders(headers: Headers): void {
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    // style-src incluye Google Fonts (tipografía de cada tenant) y unpkg
    // (CSS de Leaflet). Sin esto el CSP bloquearía las fuentes personalizadas
    // de los restaurantes y dejaría los mapas sin estilo.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
    "img-src 'self' blob: data: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https: wss: http://localhost:* ws://localhost:*",
    "worker-src 'self' blob:",
    "frame-src 'self'",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');

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
