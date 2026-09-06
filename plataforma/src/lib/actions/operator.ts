'use server';

/* Vida de la sesión de operador (login por PIN): renovarla en cada
   actividad real (operator-heartbeat.tsx) y "Cambiar de usuario" para
   cerrarla explícitamente. El vencimiento por inactividad se detecta en
   los layouts (isOperatorSessionStale) y se resuelve en
   /admin/logout-operator (route handler: ahí sí se pueden escribir
   cookies, a diferencia de un Server Component). */

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { OPERATOR_COOKIE, writeOperatorCookie } from '@/lib/auth/operator-session';
import { authPathFor } from '@/lib/tenant';

/**
 * Renueva la marca de actividad de la sesión de operador.
 *
 * SEGURIDAD: el id SIEMPRE sale de la sesión del servidor, nunca del cliente.
 * Antes esta acción escribía la cookie con el `profileId` que le mandaran, sin
 * comprobar sesión: bastaba llamarla con un uuid cualquiera para que
 * `isOperatorSessionStale` (que solo caduca cuando el id de la cookie COINCIDE
 * con el del perfil) devolviera false para siempre y el cierre por
 * inactividad de 30 min del PIN dejara de existir. Sin sesión válida no se
 * escribe nada.
 */
export async function touchOperatorSession(): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await writeOperatorCookie(user.id);
}

/** "Cambiar de usuario": cierra la sesión de operador. Capa A (el dispositivo
    ya vinculado a su restaurante) no se toca — solo se vuelve a "¿Quién eres?". */
export async function changeOperatorUser(): Promise<void> {
  // Igual que logout() (lib/actions/auth.ts): el restaurante sale del header
  // que puso el proxy para la página de la que se pulsó "Cambiar de usuario",
  // no de la sesión que se está cerrando. Sin esto, quien tocaba "Cambiar"
  // volvía a un login genérico sin PIN ni marca del local.
  const tenantSlug = (await headers()).get('x-tenant-slug');
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: 'local' });
  (await cookies()).delete(OPERATOR_COOKIE);
  redirect(authPathFor('/admin/login', tenantSlug));
}
