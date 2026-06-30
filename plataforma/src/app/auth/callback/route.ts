import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const rawNext = searchParams.get('next') || '/';
  const safeNext = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
  }

  // Cualquier fallo vuelve al menú con una marca para mostrar un aviso amable.
  const sep = safeNext.includes('?') ? '&' : '?';
  return NextResponse.redirect(`${origin}${safeNext}${sep}auth_error=1`);
}
