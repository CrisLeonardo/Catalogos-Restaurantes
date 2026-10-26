import { NextRequest, NextResponse } from 'next/server';
import { createDinerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { publicOrigin } from '@/lib/public-origin';
import { esCodigoValido } from '@/lib/cuenta/puente';
import { canjearPuente, restauranteParaPuente } from '@/lib/cuenta/puente-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Canje del puente de sesión, en el host del RESTAURANTE
 * (PLAN_BILLETERA_COMENSAL_2026-10-25, BIL-02 paso 4).
 *
 * Llega desde `/billetera/puente` con `?codigo=…` (no `code`: ese nombre lo
 * vigila el proxy para los logins de Google, §1b/§1c). El código se gasta
 * aquí, en el servidor, y solo si es de ESTE restaurante; con él se abre la
 * sesión del comensal de este host —host-only, o atada a `/m/<id>/` bajo el
 * link estable— igual que la abre el PIN del personal: `generateLink` +
 * `verifyOtp`. La ruta de vuelta sale de la base, no de la URL.
 *
 * Cualquier fallo vuelve al menú con `?puente_error=1` y sin sesión.
 */
export async function GET(request: NextRequest) {
  const origin = publicOrigin(request);
  const slug = request.headers.get('x-tenant-slug');
  const stableId = request.headers.get('x-tenant-stable-id');
  const prefijo = stableId ? `/m/${stableId}` : '';

  const volver = (ruta: string) => {
    const destino = `${origin}${prefijo}${ruta === '/' && prefijo ? '/' : ruta}`;
    const res = NextResponse.redirect(destino);
    // El código va en la URL de esta petición: que no viaje como Referer
    // ni se quede en una caché.
    res.headers.set('Referrer-Policy', 'no-referrer');
    res.headers.set('Cache-Control', 'no-store');
    return res;
  };
  const fallo = (motivo: string) => {
    console.warn(`[auth/puente] ${motivo}`);
    return volver('/?puente_error=1');
  };

  const codigo = request.nextUrl.searchParams.get('codigo');
  if (!slug) return fallo('sin restaurante en este host');
  if (!esCodigoValido(codigo)) return fallo('código con forma inválida');

  const restaurante = await restauranteParaPuente(slug);
  if (!restaurante) return fallo(`restaurante ${slug} no encontrado o suspendido`);

  const canje = await canjearPuente(codigo, restaurante.id);
  if (!canje) return fallo('código vencido, usado o de otro restaurante');

  const db = createServiceClient();
  const { data: userData } = await db.auth.admin.getUserById(canje.authUserId);
  const email = userData.user?.email;
  if (!email) return fallo('la cuenta no tiene correo');

  const { data: link, error: linkErr } = await db.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkErr || !link?.properties?.hashed_token) return fallo(`generateLink: ${linkErr?.message ?? 'sin token'}`);

  const supabase = await createDinerClient();
  const { error: otpErr } = await supabase.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: 'magiclink',
  });
  if (otpErr) return fallo(`verifyOtp: ${otpErr.message}`);

  return volver(canje.vuelta);
}
