import { headers } from 'next/headers';
import { INTRO_HTML } from './intro-html';

/**
 * La intro animada de la portada (docs/diseno/intro-animada/intro.html).
 *
 * Se sirve como página aparte, y la portada la abre en un iframe del mismo
 * origen: así su CSS y su JS (GSAP, la banda sonora) no se mezclan con los
 * de la web ni pesan en la carga de la portada, porque solo se pide al tocar
 * «play».
 *
 * La CSP de proxy.ts no deja correr ningún script sin el nonce de la
 * petición, así que cada <script> del HTML trae la marca __NONCE__ y aquí se
 * cambia por el de esta respuesta. GSAP se sirve desde public/intro/, no
 * desde un CDN: un script de terceros corriendo en nuestro origen es justo lo
 * que la CSP quiere impedir.
 *
 * El HTML lo genera docs/diseno/intro-animada/publicar-en-web.mjs.
 *
 * GET /intro?modo=web&formato=h|v&auto=1&sonido=1
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
