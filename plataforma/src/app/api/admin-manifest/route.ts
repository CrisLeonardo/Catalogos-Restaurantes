import { NextRequest } from 'next/server';
import { headers } from 'next/headers';
import { getTenantSlug, isAdminSubdomain } from '@/lib/tenant';

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

  // El scope tiene que cubrir la URL que ve el navegador, y eso depende del
  // origen desde el que se sirva esto:
  //
  //  · Dominio raíz (el ORIGEN ÚNICO, que es donde vive todo hoy): scope '/'.
  //    Es la razón de ser de la migración — un solo ícono que cubre Mi cuenta
  //    Y el panel de cualquier restaurante (`/panel/<slug>/…`), sin que Android
  //    pinte la barra al pasar de uno a otro. Con scope '/admin/' el manifest
  //    ni siquiera abarcaría la página que lo pide.
  //  · Subdominio del catálogo (`<slug>.<raíz>/admin`, que es como se sirve el
  //    panel en local): ahí el '/' es del MENÚ del comensal, así que el panel
  //    se angosta a '/admin/' para instalarse como una app aparte.
  //  · Subdominio viejo `<slug>-admin.*`: scope '/' como siempre. Hoy solo lo
  //    alcanzan las pestañas que ya estaban abiertas (el proxy §1d manda todo
  //    lo demás al origen único).
  const host = headersList.get('x-forwarded-host') ?? headersList.get('host');
  const enSubdominioDelCatalogo = !!getTenantSlug(host) && !isAdminSubdomain(host);
  const appId       = enSubdominioDelCatalogo ? '/admin/' : '/';
  const scope       = appId;
  // start_url SIEMPRE cae en /login, nunca en la raíz: el ícono "Leogin"
  // añadido al inicio es una puerta de entrada, no el dashboard del último
  // restaurante abierto. Así sirve igual para el dueño con varios
  // restaurantes (elige cuál abrir) y para el empleado (su PIN/cuenta) —
  // si ya hay sesión viva, /admin/login ofrece "Continuar como {nombre}"
  // en vez de forzar un login desde cero (ver admin/login/page.tsx).
  const startUrl    = isAdminSubdomain(host) ? '/login' : '/admin/login';

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
