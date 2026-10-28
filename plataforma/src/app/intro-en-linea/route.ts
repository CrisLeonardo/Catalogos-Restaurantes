import { headers } from 'next/headers';
import { INTRO_HTML } from './intro-html';

/**
 * «Del chat al pedido»: el video de quien vende en línea
 * (docs/diseno/intro-animada/en-linea.html), vertical 9:16.
 *
 * Igual que /intro: página aparte que /vende-en-linea abre en un iframe del
 * mismo origen, con el nonce de la petición en cada <script> (la CSP de
 * proxy.ts no deja correr nada sin él) y GSAP desde public/intro/.
 *
 * El HTML lo genera
 *   node docs/diseno/intro-animada/publicar-en-web.mjs --archivo en-linea.html
 *
 * GET /intro-en-linea?modo=web&auto=1&sonido=1
 */
export async function GET() {
  const nonce = (await headers()).get('x-nonce') ?? '';
  return new Response(INTRO_HTML.replaceAll('__NONCE__', nonce), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // El nonce cambia en cada petición: no se puede guardar en caché.
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex',
    },
  });
}
