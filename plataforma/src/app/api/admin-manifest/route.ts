import { NextRequest } from 'next/server';
import { headers } from 'next/headers';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { DEMO_SLUG } from '@/lib/tenant';

/**
 * Manifiesto PWA del panel de administración.
 *
 * Por qué una ruta separada del manifest.ts raíz:
 *  - El catálogo (cliente) y el admin viven en el mismo origen, pero deben
 *    instalarse como aplicaciones distintas.  El navegador identifica cada PWA
 *    por su campo `id`; con id='/admin/' el admin es independiente del catálogo
 *    (id='/' por defecto) aunque compartan origin.
 *  - Se referencia desde el <head> de las rutas /admin/* mediante
 *    generateMetadata({ manifest: '/api/admin-manifest' }) en admin/layout.tsx.
 *
 * GET /api/admin-manifest
 */
export async function GET(_request: NextRequest) {
  const headersList = await headers();
  const slug = headersList.get('x-tenant-slug');

  let name = 'Admin · Leogin';
  let iconSrc = '/icon-512.png';
  let iconType = 'image/png';

  if (slug && slug !== DEMO_SLUG) {
    try {
      const data = await getRestaurantBySlug(slug);
      if (data) {
        name = `${data.restaurant.name} · Admin`;
        const icon = data.resolved.config.pwaIconUrl ?? data.resolved.config.logoUrl;
        if (icon) {
          iconSrc = `/api/icon/${slug}`;
          iconType = mimeFor(icon) ?? 'image/png';
        }
      }
    } catch {
      /* BD no disponible → nombre e ícono genéricos */
    }
  }

  const manifest = {
    name,
    short_name: name,
    description: 'Panel de administración del restaurante',
    // id distingue esta PWA del catálogo (id='/') en Chrome 97+.
    // scope='/' permite que /login funcione dentro del standalone sin abrir el navegador.
    id: '/admin/',
    start_url: '/admin/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0b0b0c',
    theme_color: '#0b0b0c',
    icons: [
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

function mimeFor(url: string): string | undefined {
  const clean = url.split('?')[0].toLowerCase();
  if (clean.endsWith('.png')) return 'image/png';
  if (clean.endsWith('.webp')) return 'image/webp';
  if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'image/jpeg';
  if (clean.endsWith('.gif')) return 'image/gif';
  if (clean.endsWith('.svg')) return 'image/svg+xml';
  return undefined;
}
