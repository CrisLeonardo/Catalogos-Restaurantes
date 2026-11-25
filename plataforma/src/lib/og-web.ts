/* ============================================================
   VISTA PREVIA AL COMPARTIR LA WEB PÚBLICA (WEB-UX-11)
   ------------------------------------------------------------
   Portada, Planes, Vende en línea, Registro y Descargas se compartían con
   el ícono cuadrado de Leogin: en WhatsApp salía un cuadrito que no decía
   qué había detrás del enlace. Cada página tiene ahora su tarjeta de
   1200 × 630 con la promesa y, donde aplica, el precio
   (app/api/og-web/[pagina]/route.tsx). Maqueta aprobada el 2026-11-24
   (docs/diseno/MAQUETA_WEB_PUBLICA_EXPERIENCIA_2026-11-24.html, punto 6).

   Una ruta y no `opengraph-image.tsx`: la raíz (`app/page.tsx`) también
   sirve las cartas de los restaurantes, y el archivo se heredaría a ellas.
   ============================================================ */

import type { Metadata } from 'next';
import { marketingUrl } from '@/lib/tenant';

export type PaginaWeb = 'portada' | 'planes' | 'vende-en-linea' | 'registro' | 'descargas';

export const PAGINAS_WEB: PaginaWeb[] = ['portada', 'planes', 'vende-en-linea', 'registro', 'descargas'];

export function esPaginaWeb(valor: string): valor is PaginaWeb {
  return (PAGINAS_WEB as string[]).includes(valor);
}

/** La dirección absoluta de la tarjeta de una página. */
export function tarjetaWebUrl(pagina: PaginaWeb): string {
  return marketingUrl(`/api/og-web/${pagina}`);
}

/** `images` de openGraph y twitter con la tarjeta grande de la página. */
export function imagenesWeb(pagina: PaginaWeb, alt: string): {
  og: NonNullable<Metadata['openGraph']>['images'];
  twitter: { card: 'summary_large_image'; images: string[] };
} {
  const url = tarjetaWebUrl(pagina);
  return {
    og: [{ url, width: 1200, height: 630, alt }],
    twitter: { card: 'summary_large_image', images: [url] },
  };
}
