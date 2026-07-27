import { NextRequest, NextResponse } from 'next/server';
import { getRestaurantSlugById } from '@/lib/db/restaurants';
import { subdomainUrl } from '@/lib/tenant';

export const runtime = 'nodejs';

/**
 * Redirector ESTABLE de mesa/menú — es el link real que se graba en el
 * QR/NFC que se IMPRIME y se pega en la mesa física (ver TableQRCard en
 * components/admin/tables-panel.tsx y QRDisplay en components/admin/qr-display.tsx).
 *
 *   GET /m/<restaurantId>          → redirige al menú del restaurante
 *   GET /m/<restaurantId>/<mesa>   → redirige al menú con ?mesa=<mesa>
 *
 * Por qué existe: antes el QR/NFC de cada mesa grababa DIRECTO la URL final
 * (https://<slug>.<rootDomain>?mesa=N). Si el restaurante cambiaba de slug,
 * o la plataforma de dominio raíz, cada tarjeta ya impresa/laminada (o cada
 * tag NFC ya grabado) quedaba rota para siempre — tocaba reimprimir mesa por
 * mesa, restaurante por restaurante.
 *
 * Acá el link impreso apunta al restaurantId (inmutable, nunca cambia) y
 * este endpoint resuelve el slug VIGENTE en cada escaneo/tap. Cambiar de
 * slug o de dominio ya no requiere reimprimir ni una sola tarjeta: basta con
 * que este archivo siga sabiendo a dónde redirigir.
 *
 * 302 (no 301) + Cache-Control: no-store a propósito: el navegador NUNCA debe
 * cachear el destino, o un cambio de slug tardaría en reflejarse para quien
 * ya visitó antes (o quien lo abre desde un ícono "Añadir a inicio").
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ restaurantId: string; mesa?: string[] }> },
) {
  const { restaurantId, mesa } = await params;
  const mesaParam = mesa?.[0];

  let slug: string | null = null;
  try {
    const data = await getRestaurantSlugById(restaurantId);
    if (data && data.status === 'active') slug = data.slug;
  } catch {
    /* BD no disponible → cae al fallback de abajo, igual que /api/icon/[slug] */
  }

  // Restaurante no encontrado, suspendido, o BD caída: a la landing en vez
  // de un error críptico (el comensal solo quería ver un menú).
  if (!slug) {
    return NextResponse.redirect(new URL('/', request.url), {
      status: 302,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const target = new URL(subdomainUrl(slug));
  if (mesaParam && /^\d+$/.test(mesaParam)) {
    target.searchParams.set('mesa', mesaParam);
  }

  return NextResponse.redirect(target, {
    status: 302,
    headers: { 'Cache-Control': 'no-store' },
  });
}
