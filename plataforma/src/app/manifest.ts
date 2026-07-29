import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { DEMO_SLUG } from '@/lib/tenant';
import { getRestaurantBySlug } from '@/lib/db/restaurants';

/**
 * Manifest PWA dinámico:
 *  - En el subdominio de un restaurante → usa el nombre del restaurante
 *    (el comensal instala "Café Demo", no "Leogin").
 *  - En la demo o el dominio raíz → "Leogin" (la plataforma).
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const headersList = await headers();
  const slug = headersList.get('x-tenant-slug');
  // Presente cuando esta página se sirve por el link ESTABLE de mesa
  // (dominio raíz, ver proxy.ts §1b) — cada restaurante necesita su propio
  // scope DENTRO de ese dominio compartido (`/m/<id>/`), si no Android
  // instalaría una sola PWA con scope '/' que chocaría entre restaurantes.
  const stableId = headersList.get('x-tenant-stable-id');

  let name = 'Leogin';
  let logoUrl: string | null = null;
  let pwaIconUrl: string | null = null;
  if (slug === DEMO_SLUG) {
    name = 'Café Demo';
  } else if (slug) {
    try {
      const data = await getRestaurantBySlug(slug);
      if (data?.restaurant.name) name = data.restaurant.name;
      if (data?.resolved.config.logoUrl) logoUrl = data.resolved.config.logoUrl;
      if (data?.resolved.config.pwaIconUrl) pwaIconUrl = data.resolved.config.pwaIconUrl;
    } catch {
      /* sin BD o slug inválido → cae al nombre de la plataforma */
    }
  }

  // pwaIconUrl: ícono dedicado, normalizado a PNG cuadrado 512×512 en el editor.
  // logoUrl: logo de portada (fallback si no hay pwaIconUrl; puede no ser cuadrado).
  //
  // CRÍTICO para que NO salga como imagen rota en Android: el ícono debe ser
  // un raster de tamaño CONCRETO (no `sizes:'any'`) y NO un SVG —el WebAPK de
  // Android no rasteriza SVG ni íconos sin tamaño. El pwaIconUrl ya viene como
  // PNG 512×512 (purpose 'any' + 'maskable' usan la misma imagen).
  const appIcon = pwaIconUrl ?? logoUrl;
  // No mezclamos el ícono del tenant con los estáticos de plataforma: si lo
  // hiciéramos, Android podría elegir el estático para tamaños pequeños y
  // mostrar el ícono equivocado. Chrome reescala el 512 a 192 sin problema.
  // Servimos el ícono a través de /api/icon/[slug] (mismo origen): evita
  // problemas de íconos maskable cross-origin y mantiene válida la URL para
  // PWAs ya instaladas. La ruta hace de proxy de los bytes reales del asset.
  // El parámetro ?v= hace cache-busting: cuando el ícono cambia, la URL cambia
  // y el navegador/Android descarga el nuevo en lugar de usar el cacheado.
  const iconVersion = appIcon ? hashStr(appIcon) : '';
  const iconSrc = `/api/icon/${slug}${iconVersion ? `?v=${iconVersion}` : ''}`;

  const icons: MetadataRoute.Manifest['icons'] = appIcon && slug && slug !== DEMO_SLUG
    ? [
        { src: iconSrc, sizes: '512x512', type: mimeFor(appIcon), purpose: 'any' },
        { src: iconSrc, sizes: '512x512', type: mimeFor(appIcon), purpose: 'maskable' },
      ]
    : [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      ];

  // id explícito: Chrome 97+ lo usa para distinguir PWAs del mismo origen.
  // El catálogo tiene id='/' y el admin tiene id='/admin/', así pueden
  // instalarse como apps separadas aunque compartan el mismo dominio. Bajo
  // el link estable de mesa (dominio raíz), cada restaurante usa `/m/<id>/`
  // en su lugar — mismo truco, un nivel más: distintos restaurantes en el
  // mismo dominio raíz, cada uno con su propio scope no-superpuesto.
  const scope = stableId ? `/m/${stableId}/` : '/';

  return {
    name,
    short_name: name,
    description: 'Menús interactivos para restaurantes',
    id: scope,
    start_url: scope,
    scope,
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0b0b0c',
    theme_color: '#0b0b0c',
    icons,
  };
}

/** Hash corto no-criptográfico de una URL — solo para cache-busting. */
function hashStr(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

/** Mime por extensión del asset, para declararlo en el manifest. */
function mimeFor(url: string): string | undefined {
  const clean = url.split('?')[0].toLowerCase();
  if (clean.endsWith('.png')) return 'image/png';
  if (clean.endsWith('.webp')) return 'image/webp';
  if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'image/jpeg';
  if (clean.endsWith('.gif')) return 'image/gif';
  if (clean.endsWith('.svg')) return 'image/svg+xml';
  return undefined; // desconocido → el navegador lo deduce
}
