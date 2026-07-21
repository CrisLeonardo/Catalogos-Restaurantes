import { NextRequest } from 'next/server';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { isAllowedAssetUrl } from '@/lib/asset-url';

/**
 * Proxy del ícono de la PWA del restaurante (mismo origen que el manifest).
 *
 * Devuelve los BYTES reales del asset elegido (pwaIconUrl, ya normalizado a
 * PNG 512×512 en el editor; o, como fallback, logoUrl) con su content-type.
 *
 * Por qué un proxy y no un SVG generado:
 *  - El WebAPK de Android NO rasteriza SVG de forma fiable → salía la imagen
 *    rota. Un PNG/WebP raster de tamaño concreto sí funciona en todos lados.
 *  - next/og de este proyecto no decodifica WebP, así que no podemos componer
 *    el ícono en el servidor; el editor ya entrega un PNG cuadrado listo.
 *
 * GET /api/icon/[slug]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  let iconUrl: string | null = null;
  try {
    const data = await getRestaurantBySlug(slug);
    if (data) {
      // pwaIconUrl (PNG cuadrado) tiene prioridad; si no hay, cae al logo.
      iconUrl = data.resolved.config.pwaIconUrl ?? data.resolved.config.logoUrl ?? null;
    }
  } catch {
    /* BD no disponible → ícono estático */
  }

  if (!iconUrl || !isAllowedAssetUrl(iconUrl)) {
    return Response.redirect(new URL('/icon-512.png', request.url));
  }

  try {
    const res = await fetch(iconUrl, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok || !res.body) {
      return Response.redirect(new URL('/icon-512.png', request.url));
    }
    const contentType = (res.headers.get('content-type') ?? 'image/png').split(';')[0].trim();
    // Si viene con ?v= (hash del asset) la URL es inmutable → cache largo.
    // Sin ?v= (acceso directo) → cache corto para no servir versión vieja.
    const hasVersion = request.nextUrl.searchParams.has('v');
    const cacheControl = hasVersion
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=60, stale-while-revalidate=300';
    return new Response(res.body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': cacheControl,
      },
    });
  } catch {
    return Response.redirect(new URL('/icon-512.png', request.url));
  }
}
