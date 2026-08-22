import { NextRequest } from 'next/server';
import { headers } from 'next/headers';

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
 * Nombre e ícono son SIEMPRE "Leogin" (nunca la marca del restaurante):
 * el mismo dueño o empleado puede operar varios restaurantes, así que el
 * ícono añadido al inicio funciona como una puerta de entrada a Leogin —
 * no como la app de un restaurante en particular. No hay app store propia
 * (Play Store/App Store), así que "añadir al inicio" hace de sustituto.
 *
 * GET /api/admin-manifest
 */
export async function GET(_request: NextRequest) {
  const headersList = await headers();
  const name = 'Leogin';
  const iconSrc = '/icon-512.png';
  const iconType = 'image/png';

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
    description: 'Panel de administración de Leogin',
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
