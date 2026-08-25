'use server';

/* Renueva la marca de inactividad de la sesión de correo/Google en cada
   actividad real (session-heartbeat.tsx) — ver lib/auth/session-activity.ts.
   Mismo patrón que touchOperatorSession() en actions/operator.ts. */

import { createClient } from '@/lib/supabase/server';
import { writeSessionActivity } from '@/lib/auth/session-activity';

/**
 * SEGURIDAD: el id SIEMPRE sale de la sesión del servidor, nunca del
 * cliente — igual que touchOperatorSession(). Sin sesión válida no se
 * escribe nada.
 */
export async function touchSessionActivity(): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await writeSessionActivity(user.id);
}
