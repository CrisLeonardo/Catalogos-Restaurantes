import { NextRequest } from 'next/server';
import { getRestaurantBySlug } from '@/lib/db/restaurants';

/**
 * Genera un ícono SVG "maskable" para la PWA del restaurante.
 * Pone el logo del restaurante centrado sobre su color de fondo de marca.
 * Así el ícono adaptativo de Android muestra el logo sobre fondo oscuro
 * en lugar del squircle blanco vacío que Chrome genera por defecto.
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

  // Ícono 512×512 con fondo de la marca. El logo ocupa el 70% central
  // (x/y=76, w/h=360) lo que garantiza que quede dentro de la "safe zone"
  // del ícono maskable (el sistema recorta hasta el 80% del área).
  const svg = `<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <rect width="512" height="512" fill="${escapeAttr(brandBg)}"/>
  <image href="${escapeAttr(iconUrl)}" x="76" y="76" width="360" height="360" preserveAspectRatio="xMidYMid meet"/>
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
