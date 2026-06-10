import { NextRequest } from 'next/server';
import { getRestaurantBySlug } from '@/lib/db/restaurants';

/**
 * Genera un ícono PNG o SVG "maskable" para la PWA del restaurante.
 * Si el restaurante tiene logo, lo descarga server-side y lo incrusta como
 * base64 dentro del SVG → el ícono es self-contained y Chrome/Android
 * puede usarlo sin bloquear referencias externas (que es el motivo por el que
 * antes aparecía la imagen rota).
 *
 * GET /api/icon/[slug]
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  let brandBg = '#0b0b0c';
  let iconUrl: string | null = null;

  try {
    const data = await getRestaurantBySlug(slug);
    if (data) {
      brandBg = data.resolved.config.colorBg ?? '#0b0b0c';
      // pwaIconUrl tiene prioridad; si no hay, cae al logoUrl.
      iconUrl = data.resolved.config.pwaIconUrl ?? data.resolved.config.logoUrl ?? null;
    }
  } catch {
    /* BD no disponible → usa defaults */
  }

  if (!iconUrl) {
    return Response.redirect(new URL('/icon-512.png', _request.url));
  }

  // Descargar la imagen del logo server-side e incrustarla como data URL.
  // Esto es CRÍTICO: Chrome/Android bloquea <image href="url-externo"> dentro
  // de SVGs usados como íconos PWA. El SVG debe ser self-contained.
  let imageDataUrl: string | null = null;
  try {
    const imgRes = await fetch(iconUrl, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(8000),
    });
    if (imgRes.ok) {
      const buffer = await imgRes.arrayBuffer();
      const rawMime = imgRes.headers.get('content-type') ?? 'image/png';
      const mime = rawMime.split(';')[0].trim();
      const base64 = Buffer.from(buffer).toString('base64');
      imageDataUrl = `data:${mime};base64,${base64}`;
    }
  } catch {
    /* red o timeout → fallback al PNG estático */
  }

  if (!imageDataUrl) {
    return Response.redirect(new URL('/icon-512.png', _request.url));
  }

  // Ícono 512×512 con fondo de la marca. El logo ocupa el 70% central
  // (x/y=76, w/h=360) → queda dentro de la "safe zone" del ícono maskable
  // (el sistema puede recortar hasta el 80% del área).
  const svg = `<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <rect width="512" height="512" fill="${escapeAttr(brandBg)}"/>
  <image href="${imageDataUrl}" x="76" y="76" width="360" height="360" preserveAspectRatio="xMidYMid meet"/>
</svg>`;

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
