import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createOAuthCallbackClient } from '@/lib/supabase/server';
import { resolveStaffDestination } from '@/lib/auth/destination';
import { logPanelAccess } from '@/lib/auth/access-log';
import { writeSessionActivity } from '@/lib/auth/session-activity';
import { publicOrigin } from '@/lib/public-origin';

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
 * El origen sale de `publicOrigin()` (lib/public-origin.ts), igual que en
 * /auth/callback: detrás del proxy de Render `request.nextUrl.origin` resuelve
 * al host interno del contenedor en vez del dominio público.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const intent = searchParams.get('intent') === 'signup' ? 'signup' : 'login';

  const origin = publicOrigin(request);

  /** Solo rutas relativas del mismo origen (evita redirecciones abiertas). */
  const rawNext = searchParams.get('next') ?? '';
  const safeNext = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : null;

  // Un fallo a mitad del registro (lo más común: cancelar en la pantalla de
  // Google) devuelve al wizard, no al login: ahí está el borrador guardado y
  // ahí es donde la persona quería estar. Aterrizar en el login le habría
  // borrado de la vista el plan, el nombre y la plantilla que ya eligió.
  const failUrl = intent === 'signup' && safeNext ? safeNext : '/admin/login';
  const fail = (reason: string) => {
    console.error(`[admin/auth/google/callback] ${reason}`);
    return NextResponse.redirect(`${origin}${failUrl}?auth_error=1`);
  };
  if (!code) return fail('sin parámetro code (Google canceló o el redirect_to no está en la lista blanca de Supabase)');

  // Cliente aislado de la sesión anterior: si auth-js la mira y no le
  // convence, borra el verificador PKCE de esta misma petición y el canje
  // muere sin motivo. Ver createOAuthCallbackClient en lib/supabase/server.
  // Traza de entrada, siempre. Hasta ahora este callback solo hablaba
  // cuando fallaba el canje, asi que "no aparece nada en los logs" tapaba
  // dos cosas opuestas: que no se llegara aqui, o que se llegara y todo
  // fuera bien. Una linea por intento de acceso no es ruido.
  const verificadores = (await cookies()).getAll()
    .map(({ name }) => name)
    .filter((n) => n.endsWith('-code-verifier'));
  console.warn(
    `[admin/auth/google/callback] entrada · origen=${origin} · intent=${intent}` +
      ` · next=${safeNext ?? '(ninguno)'} · verificadores=[${verificadores.join(', ') || 'NINGUNO'}]`,
  );

  const supabase = await createOAuthCallbackClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    // Qué cookies llegaron REALMENTE (solo nombres — el valor del
    // verificador es lo que canjea el acceso, y la sesión es la sesión).
    // Sin esto, "no está en storage" no distingue tres cosas muy
    // distintas: que el navegador no la mandara, que llegara con otro
    // nombre, o que algo la borrara por el camino.
    const llegaron = (await cookies()).getAll().map(({ name }) => name);
    const verificadores = llegaron.filter((n) => n.endsWith('-code-verifier'));
    return fail(
      `exchangeCodeForSession falló: ${error.message} · origen=${origin}` +
        ` · verificadores=[${verificadores.join(', ') || 'NINGUNO'}]` +
        ` · cookies sb-=[${llegaron.filter((n) => n.startsWith('sb-')).join(', ') || 'ninguna'}]`,
    );
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('exchangeCodeForSession no dio error pero getUser() no devolvió usuario');

  // Arranca el reloj de inactividad (checklist 2026-08-25 §2) desde ya,
  // cubra o no restaurante todavía — igual que login() con correo.
  await writeSessionActivity(user.id);

  const { data: profile, error: perfilErr } = await supabase
    .from('profiles')
    .select('role, permissions, restaurant_id')
    .eq('id', user.id)
    .maybeSingle();
  // Si la consulta FALLA, `profile` viene vacío igual que si la cuenta fuera
  // nueva — y el camino de abajo la mandaría a crear un restaurante que ya
  // tiene. No es lo mismo "no hay perfil" que "no se pudo leer el perfil":
  // lo primero es un alta, lo segundo es un fallo, y confundirlos le enseña
  // al dueño una pantalla de registro en vez de su panel.
  if (perfilErr) return fail(`no se pudo leer el perfil: ${perfilErr.message}`);

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
