import { NextRequest, NextResponse } from 'next/server';
import { createDinerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * Callback de OAuth (login con Google de los comensales).
 *
 * Supabase redirige aquí con `?code=...` tras autenticar. Intercambiamos el
 * código por una sesión (cookies, dominio compartido `.leogin.online`) y
 * volvemos a la página donde el comensal estaba (`next`).
 *
 * `next` se sanea: solo se permiten rutas relativas del mismo origen para
 * evitar redirecciones abiertas.
 *
 * El origen se arma con las cabeceras `x-forwarded-*` / `host` (igual que
 * src/proxy.ts), NO con `request.nextUrl.origin`: detrás del proxy de Render
 * esa propiedad puede resolver al host/puerto interno del contenedor
 * (`localhost:10000`, el puerto por defecto de Render) en vez del dominio
 * público, mandando al comensal a una URL que no existe tras un login exitoso.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const rawNext = searchParams.get('next') || '/';
  const safeNext = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';

  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? request.nextUrl.host;
  const proto = request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.replace(':', '');
  const origin = `${proto}://${host}`;

  if (code) {
    // Cliente del COMENSAL: la sesión de Google se guarda en su propia cookie
    // (DINER_COOKIE_NAME) y nunca pisa la sesión del personal del restaurante.
    const supabase = await createDinerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
  }

  // Cualquier fallo vuelve al menú con una marca para mostrar un aviso amable.
  const sep = safeNext.includes('?') ? '&' : '?';
  return NextResponse.redirect(`${origin}${safeNext}${sep}auth_error=1`);
}
