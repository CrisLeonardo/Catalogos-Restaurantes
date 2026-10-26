import { NextRequest, NextResponse } from 'next/server';
import { createOAuthCallbackClient } from '@/lib/supabase/server';
import { WALLET_COOKIE_NAME } from '@/lib/supabase/cookies';
import { publicOrigin } from '@/lib/public-origin';

export const runtime = 'nodejs';

/**
 * Callback del login con Google de la CUENTA LEOGIN (billetera).
 *
 * Igual que `/auth/callback` del menú, con dos diferencias: la sesión va a
 * WALLET_COOKIE_NAME y `next` solo puede ser una ruta de `/billetera`
 * (la billetera o el puente), nunca otra parte del sitio.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const rawNext = searchParams.get('next') || '/billetera';
  const safeNext = rawNext === '/billetera' || rawNext.startsWith('/billetera/') || rawNext.startsWith('/billetera?')
    ? rawNext
    : '/billetera';

  const origin = publicOrigin(request);

  if (code) {
    const supabase = await createOAuthCallbackClient(WALLET_COOKIE_NAME);
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${safeNext}`);
    console.error(`[billetera/auth/callback] exchangeCodeForSession falló: ${error.message}`);
  } else {
    console.error('[billetera/auth/callback] sin parámetro code (Google canceló o el redirect_to no está en la lista blanca de Supabase)');
  }

  const sep = safeNext.includes('?') ? '&' : '?';
  return NextResponse.redirect(`${origin}${safeNext}${sep}auth_error=1`);
}
