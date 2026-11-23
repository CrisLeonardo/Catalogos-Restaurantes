import type { MetadataRoute } from 'next';
import { marketingUrl } from '@/lib/tenant';

/* Se sirve en todos los hosts (dominio raíz y subdominios de restaurante).
   Permite el menú público; bloquea panel, checkout y rutas internas en
   cualquier host. El sitemap apunta siempre al dominio raíz (marketing). */

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/admin',
        '/super',
        // Reenvío del panel de grupo viejo; el consolidado vive en /mi-cuenta.
        '/central',
        '/mi-cuenta',
        '/checkout',
        '/mis-pedidos',
        '/pedido/',
        '/preview',
        '/api/',
      ],
    },
    sitemap: marketingUrl('/sitemap.xml'),
  };
}
