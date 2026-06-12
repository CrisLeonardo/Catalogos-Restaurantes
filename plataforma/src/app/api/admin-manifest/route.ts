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
          // ?v= hace cache-busting: cuando el ícono cambia el hash cambia → el
          // navegador descarga el nuevo en lugar de usar el que tenía en caché.
          iconSrc = `/api/icon/${slug}?v=${hashStr(icon)}`;
          iconType = mimeFor(icon) ?? 'image/png';
        }
      }
    } catch {
      /* BD no disponible → nombre e ícono genéricos */
    }
  }

  // Cuando se sirve desde el subdominio admin.* (origen separado), las rutas
  // son relativas a ese origen: start_url='/' y scope='/'.
  // Desde el subdominio del catálogo (acceso directo a /admin/) usamos
  // id/start_url/scope='/admin/' para distinguirlo del catálogo (id='/').
  const isAdminSub = headersList.get('x-is-admin-subdomain') === '1';
  const appId       = isAdminSub ? '/' : '/admin/';
  const startUrl    = isAdminSub ? '/' : '/admin/';
  const scope       = isAdminSub ? '/' : '/admin/';

  const manifest = {
    name,
    short_name: name,
    description: 'Panel de administración del restaurante',
    id: appId,
    start_url: startUrl,
    scope,
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
