'use server';

import { createClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/rate-limit';
import { sendEmailVerification } from '@/lib/auth/email-verification';

export type VerifyState = { error: string } | { sent: true } | null;

/**
 * Reenvía el correo de confirmación al dueño que tiene la sesión abierta.
 *
 * El correo NO viene del formulario: se toma de la sesión. Si viniera del
 * cliente, este botón sería una forma cómoda de mandar correos de Leogin a
 * quien quisiera el que lo pulsara.
 */
export async function resendEmailVerification(): Promise<VerifyState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { error: 'Inicia sesión de nuevo para reenviar el correo.' };

  if (!(await rateLimit(`verificar:${user.id}`, 3, 60 * 60_000))) {
    return { error: 'Ya te mandamos varios correos. Espera un rato y revisa tu carpeta de spam.' };
  }

  await sendEmailVerification(user.email);
  return { sent: true };
}
