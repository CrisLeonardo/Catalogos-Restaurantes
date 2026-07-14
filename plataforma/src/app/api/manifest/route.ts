import { NextRequest } from 'next/server';
import { headers } from 'next/headers';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { DEMO_SLUG } from '@/lib/tenant';

/**
 * Manifiesto PWA del catálogo (cliente final).
 *
 * Se diferencia del admin-manifest en que:
 *  - id / start_url / scope = '/' (raíz del subdominio del restaurante)
 *  - name viene del restaurante, no del admin
 * El admin override en /admin/layout.tsx con /api/admin-manifest, así
 * ambos coexisten sin colisionar aunque compartan origin.
 *
 * GET /api/manifest
 */
export async function GET(_request: NextRequest) {
  const headersList = await headers();
  const slug = headersList.get('x-tenant-slug');

  let name = 'Menú en línea';
  let themeColor = '#0b0b0c';
  let bgColor = '#0b0b0c';
  let iconSrc = '/icon-512.png';
  let iconType = 'image/png';

  if (slug === DEMO_SLUG) {
    name = 'Café Demo';
    themeColor = '#0b0b0c';
    bgColor = '#0b0b0c';
  } else if (slug) {
    try {
      const data = await getRestaurantBySlug(slug);
      if (data) {
        name = data.restaurant.name;
        themeColor = data.resolved.config.colorBg;
        bgColor = data.resolved.config.colorBg;
        const icon = data.resolved.config.pwaIconUrl ?? data.resolved.config.logoUrl;
        if (icon) {
          iconSrc = `/api/icon/${slug}?v=${hashStr(icon)}`;
          iconType = mimeFor(icon) ?? 'image/png';
        }
      }
    } catch {
      /* BD no disponible → valores genéricos */
    }
  }

  const manifest = {
    name,
    short_name: name,
    description: `Menú digital de ${name}`,
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: bgColor,
    theme_color: themeColor,
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: iconSrc, sizes: '512x512', type: iconType, purpose: 'any' },
      { src: iconSrc, sizes: '512x512', type: iconType, purpose: 'maskable' },
    ],
  };

  return Response.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=600',
    },
  });
}

function hashStr(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

function mimeFor(url: string): string | undefined {
  const clean = url.split('?')[0].toLowerCase();
  if (clean.endsWith('.png')) return 'image/png';
  if (clean.endsWith('.webp')) return 'image/webp';
  if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'image/jpeg';
  if (clean.endsWith('.gif')) return 'image/gif';
  if (clean.endsWith('.svg')) return 'image/svg+xml';
  return undefined;
}
