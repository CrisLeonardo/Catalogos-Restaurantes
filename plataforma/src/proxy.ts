import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getTenantSlug, isAdminSubdomain, isGroupSubdomain, getGroupSlug } from "@/lib/tenant";

/**
 * Proxy (Next.js 16 — antes llamado "middleware"):
 *  1. Resuelve el subdominio → slug del restaurante y lo propaga como
 *     header interno `x-tenant-slug` para que la app lo lea.
 *  2. Si el host es admin.SLUG.dominio, reescribe la ruta a /admin/* para que
 *     el panel de administración viva en un origen separado (PWA independiente).
 *  3. Refresca la sesión de Supabase (si las variables están configuradas).
 */
export async function proxy(request: NextRequest) {
  // 1) Tenant + detección de subdominio admin
  const host = request.headers.get("host");
  const slug = getTenantSlug(host);
  const adminSub = isAdminSubdomain(host);
  const groupSub = isGroupSubdomain(host);
  const groupSlug = getGroupSlug(host);

  const requestHeaders = new Headers(request.headers);
  if (slug) requestHeaders.set("x-tenant-slug", slug);
  if (adminSub) requestHeaders.set("x-is-admin-subdomain", "1");
  if (groupSlug) requestHeaders.set("x-org-slug", groupSlug);

  // 2) Rewrite para subdominio admin.*
  //    admin.azucar-negra.leogin.online/       → /admin/
  //    admin.azucar-negra.leogin.online/menu   → /admin/menu
  //    Rutas /api/, /_next/ y archivos estáticos no se reescriben.
  let rewriteUrl: URL | null = null;
  if (adminSub) {
    const pathname = request.nextUrl.pathname;
    const skip =
      pathname.startsWith("/api/") ||
      pathname.startsWith("/_next") ||
      pathname.startsWith("/admin") ||  // ya tiene el prefijo
      pathname === "/favicon.ico" ||
      pathname === "/sw.js" ||
      /\.(svg|png|jpg|jpeg|gif|webp|ico)$/.test(pathname);
    if (!skip) {
      rewriteUrl = request.nextUrl.clone();
      rewriteUrl.pathname = pathname === "/" ? "/admin/" : `/admin${pathname}`;
    }
  } else if (groupSub) {
    // slug-central.dominio/  → /central   ·  /sucursales → /central/sucursales
    const pathname = request.nextUrl.pathname;
    const skip =
      pathname.startsWith("/api/") ||
      pathname.startsWith("/_next") ||
      pathname.startsWith("/central") ||
      pathname === "/favicon.ico" ||
      pathname === "/sw.js" ||
      /\.(svg|png|jpg|jpeg|gif|webp|ico)$/.test(pathname);
    if (!skip) {
      rewriteUrl = request.nextUrl.clone();
      rewriteUrl.pathname = pathname === "/" ? "/central" : `/central${pathname}`;
    }
  }

  // Fábrica de respuesta: NextResponse.rewrite si hay rewrite, next() si no.
  const makeResponse = () =>
    rewriteUrl
      ? NextResponse.rewrite(rewriteUrl!, { request: { headers: requestHeaders } })
      : NextResponse.next({ request: { headers: requestHeaders } });

  let response = makeResponse();

  // 3) Refresco de sesión Supabase (solo si hay credenciales configuradas)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (supabaseUrl && anonKey) {
    // En producción compartimos la sesión en todos los subdominios usando
    // domain=.leogin.online. En local no se toca (los subdominios *.localhost
    // no admiten cookie-domain en todos los navegadores).
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN?.split(",")[0].trim() ?? "";
    const isLocal = !rootDomain || rootDomain.includes("localhost");
    const cookieDomain = isLocal ? undefined : `.${rootDomain.split(":")[0]}`;

    const supabase = createServerClient(supabaseUrl, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = makeResponse();
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, {
              ...options,
              ...(cookieDomain ? { domain: cookieDomain } : {}),
            }),
          );
        },
      },
    });

    // IMPORTANTE: no metas lógica entre createServerClient y getUser().
    await supabase.auth.getUser();
  }

  applySecurityHeaders(response.headers);
  return response;
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
  // Corre en todo menos estáticos e imágenes.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
