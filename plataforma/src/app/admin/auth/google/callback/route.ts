import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveStaffDestination } from '@/lib/auth/destination';
import { logPanelAccess } from '@/lib/auth/access-log';

export const runtime = 'nodejs';

/**
 * Callback de OAuth del PERSONAL (dueño / gerente entrando con Google).
 *
 * Es un callback aparte del de los comensales (`/auth/callback`) a propósito:
 * aquel guarda la sesión en la cookie del COMENSAL y devuelve al menú; este
 * usa la cookie del PERSONAL (compartida entre subdominios) y además decide a
 * qué panel entra la cuenta, igual que hace login() con correo y contraseña.
 *
 * Tres finales posibles:
 *  · La cuenta de Google ya administra un restaurante → a su panel.
 *  · La cuenta es nueva (no tiene perfil) → a /registro a crear su restaurante,
 *    ya autenticada: el wizard salta el paso de contraseña.
 *  · Algo falló (código inválido, Google canceló) → de vuelta al login con
 *    `?auth_error=1`, sin pantalla en blanco.
 *
 * El origen se arma con las cabeceras `x-forwarded-*` (igual que
 * /auth/callback): detrás del proxy de Render `request.nextUrl.origin` puede
 * resolver al host interno del contenedor en vez del dominio público.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const intent = searchParams.get('intent') === 'signup' ? 'signup' : 'login';

  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? request.nextUrl.host;
  const proto = request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.replace(':', '');
  const origin = `${proto}://${host}`;

  /** Solo rutas relativas del mismo origen (evita redirecciones abiertas). */
  const rawNext = searchParams.get('next') ?? '';
  const safeNext = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : null;

  // Un fallo a mitad del registro (lo más común: cancelar en la pantalla de
  // Google) devuelve al wizard, no al login: ahí está el borrador guardado y
  // ahí es donde la persona quería estar. Aterrizar en el login le habría
  // borrado de la vista el plan, el nombre y la plantilla que ya eligió.
  const failUrl = intent === 'signup' && safeNext ? safeNext : '/admin/login';
  const fail = () => NextResponse.redirect(`${origin}${failUrl}?auth_error=1`);
  if (!code) return fail();

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail();

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, permissions, restaurant_id')
    .eq('id', user.id)
    .maybeSingle();

  // Cuenta de Google sin restaurante: se va a crear uno. El wizard lee la
  // sesión por su cuenta (registro/page.tsx) — aquí solo la llevamos ahí.
  // También cubre al que pulsó "Continuar con Google" en el login por error
  // creyendo que ya tenía cuenta: ve la pantalla de crear restaurante, que
  // es la salida útil, en vez de un "no existe" sin siguiente paso.
  if (!profile) {
    return NextResponse.redirect(`${origin}${safeNext ?? '/registro'}`);
  }

  // Ya tiene restaurante y venía del wizard: /registro le explicará que esa
  // cuenta ya administra un negocio y le ofrecerá entrar a su panel.
  if (intent === 'signup' && safeNext) {
    return NextResponse.redirect(`${origin}${safeNext}`);
  }

  await logPanelAccess({
    profileId: user.id,
    restaurantId: (profile.restaurant_id as string | null) ?? null,
    method: 'google',
    headers: request.headers,
  });

  const tenantSlug = request.headers.get('x-tenant-slug');
  const destination = await resolveStaffDestination(
    supabase,
    profile as { role: string; permissions: string[] | null; restaurant_id: string | null },
    tenantSlug,
    '?welcome=1',
  );

  // resolveStaffDestination devuelve ruta relativa (mismo subdominio) o URL
  // absoluta (el panel vive en otro subdominio).
  return NextResponse.redirect(destination.startsWith('/') ? `${origin}${destination}` : destination);
}
