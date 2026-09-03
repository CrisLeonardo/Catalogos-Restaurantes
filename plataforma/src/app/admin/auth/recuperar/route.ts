import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { mintResetPass, RESET_COOKIE, RESET_TTL_MS, resetCookieOptions } from '@/lib/auth/reset-session';
import { publicUrl } from '@/lib/public-origin';

/**
 * Aterrizaje del enlace de recuperación que llega al correo.
 *
 * Canjea el token de un solo uso por una sesión y emite el pase de
 * recuperación (ver lib/auth/reset-session.ts) para que /admin/nueva-clave
 * acepte el cambio. Sin ese pase, cualquier sesión de personal ya abierta
 * podría cambiar la contraseña del dueño.
 *
 * Vive bajo /admin/ a propósito: en producción el panel de cada restaurante
 * está en su propio subdominio y el proxy reescribe todo lo que no empiece
 * por /admin, así que esta misma ruta funciona en el dominio raíz y en
 * cualquier subdominio sin cambiar el enlace.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  // Con `request.nextUrl.origin` el enlace del correo aterrizaba en
  // `localhost:10000` detrás del proxy de Render. Ver lib/public-origin.ts.
  const failed = NextResponse.redirect(publicUrl(request, '/admin/recuperar?estado=vencido'));
  if (!token) return failed;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ type: 'recovery', token_hash: token });
  if (error || !data.user) return failed;

  const response = NextResponse.redirect(publicUrl(request, '/admin/nueva-clave'));
  response.cookies.set(RESET_COOKIE, mintResetPass(data.user.id), {
    ...resetCookieOptions(),
    maxAge: RESET_TTL_MS / 1000,
  });
  return response;
}

export const dynamic = 'force-dynamic';
