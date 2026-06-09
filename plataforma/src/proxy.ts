import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getTenantSlug } from "@/lib/tenant";

/**
 * Proxy (Next.js 16 — antes llamado "middleware"):
 *  1. Resuelve el subdominio → slug del restaurante y lo propaga como
 *     header interno `x-tenant-slug` para que la app lo lea.
 *  2. Refresca la sesión de Supabase (si las variables están configuradas).
 */
export async function proxy(request: NextRequest) {
  // 1) Tenant desde el subdominio
  const host = request.headers.get("host");
  const slug = getTenantSlug(host);

  const requestHeaders = new Headers(request.headers);
  if (slug) requestHeaders.set("x-tenant-slug", slug);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  // 2) Refresco de sesión Supabase (solo si hay credenciales configuradas)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (url && anonKey) {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
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
