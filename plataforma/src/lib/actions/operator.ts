'use server';

/* Vida de la sesión de operador (login por PIN): renovarla en cada
   actividad real (operator-heartbeat.tsx) y "Cambiar de usuario" para
   cerrarla explícitamente. El vencimiento por inactividad se detecta en
   los layouts (isOperatorSessionStale) y se resuelve en
   /admin/logout-operator (route handler: ahí sí se pueden escribir
   cookies, a diferencia de un Server Component). */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { OPERATOR_COOKIE, OPERATOR_WINDOW_MS, OPERATOR_COOKIE_DOMAIN } from '@/lib/auth/operator-session';

export async function touchOperatorSession(profileId: string): Promise<void> {
  const store = await cookies();
  store.set(OPERATOR_COOKIE, `${profileId}:${Date.now()}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: !!OPERATOR_COOKIE_DOMAIN,
    path: '/',
    maxAge: OPERATOR_WINDOW_MS / 1000,
    ...(OPERATOR_COOKIE_DOMAIN ? { domain: OPERATOR_COOKIE_DOMAIN } : {}),
  });
}

/** "Cambiar de usuario": cierra la sesión de operador. Capa A (el dispositivo
    ya vinculado a su restaurante) no se toca — solo se vuelve a "¿Quién eres?". */
export async function changeOperatorUser(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: 'local' });
  (await cookies()).delete(OPERATOR_COOKIE);
  redirect('/admin/login');
}
