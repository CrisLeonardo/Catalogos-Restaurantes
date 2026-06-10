import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { DEMO_SLUG } from '@/lib/tenant';
import { getRestaurantBySlug } from '@/lib/db/restaurants';

/**
 * Manifest PWA dinámico:
 *  - En el subdominio de un restaurante → usa el nombre del restaurante
 *    (el comensal instala "Azúcar Negra", no "Leogin").
 *  - En la demo o el dominio raíz → "Leogin" (la plataforma).
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const slug = (await headers()).get('x-tenant-slug');

  let name = 'Leogin';
  let logoUrl: string | null = null;
  if (slug === DEMO_SLUG) {
    name = 'Azúcar Negra';
  } else if (slug) {
    try {
      const data = await getRestaurantBySlug(slug);
      if (data?.restaurant.name) name = data.restaurant.name;
      if (data?.resolved.config.logoUrl) logoUrl = data.resolved.config.logoUrl;
    } catch {
      /* sin BD o slug inválido → cae al nombre de la plataforma */
    }
  }

  // No declarar 'maskable' con logos normales: el OS recorta el ícono en
  // círculo/cuadrado asumiendo zona segura, y el logo queda cortado.
  const icons: MetadataRoute.Manifest['icons'] = logoUrl
    ? [{ src: logoUrl, sizes: 'any', purpose: 'any' }]
    : [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      ];

  return {
    name,
    short_name: name,
    description: 'Menús interactivos para restaurantes',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0b0b0c',
    theme_color: '#0b0b0c',
    icons,
  };
}
