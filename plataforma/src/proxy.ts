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

  return response;
}

export const config = {
  // Corre en todo menos estáticos e imágenes.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
