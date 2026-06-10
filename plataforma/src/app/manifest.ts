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

  // Ícono regular: el logo tal cual (para el diálogo de instalación y favicon).
  // Ícono maskable: generado por /api/icon/[slug] → logo centrado sobre el
  // color de fondo de la marca, así Android no lo envuelve en un squircle blanco.
  const icons: MetadataRoute.Manifest['icons'] = logoUrl && slug && slug !== DEMO_SLUG
    ? [
        { src: logoUrl, sizes: 'any', purpose: 'any' },
        { src: `/api/icon/${slug}`, sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' },
      ]
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
