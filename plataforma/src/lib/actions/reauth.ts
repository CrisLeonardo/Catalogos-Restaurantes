'use server';

/* ============================================================
   «CONFIRMA QUE ERES TÚ» — las dos acciones del diálogo (ACC-09)
   ------------------------------------------------------------
   Ver lib/auth/reauth.ts. La contraseña se comprueba con un cliente aparte
   que no toca las cookies de la sesión (mismo motivo que en
   password-change.ts).
   ============================================================ */

import { headers } from 'next/headers';
import { createClient as createPlainClient } from '@supabase/supabase-js';
import { getStaffUser } from '@/lib/supabase/server';
import { identidadReciente, marcarIdentidadConfirmada } from '@/lib/auth/reauth';
import { puedeCambiarContrasena } from '@/lib/auth/password-change-rules';
import { rateLimit, clientIp } from '@/lib/rate-limit';

/** Lo que la pantalla necesita saber para abrir (o no) el diálogo. */
export type EstadoIdentidad =
  | { reciente: true }
  /** `conGoogle`: la cuenta no tiene contraseña, se confirma con Google. */
  | { reciente: false; conGoogle: boolean };

export async function necesitoReautenticar(): Promise<EstadoIdentidad> {
  if (await identidadReciente()) return { reciente: true };
  const { data: { user } } = await getStaffUser();
  const puede = user ? puedeCambiarContrasena(user) : null;
  return { reciente: false, conGoogle: !!puede && !puede.ok && !!puede.google };
}

export type ConfirmarState = { error: string } | { ok: true } | null;

export async function confirmarIdentidad(_prev: ConfirmarState, formData: FormData): Promise<ConfirmarState> {
  const password = String(formData.get('password') ?? '');
  if (!password) return { error: 'Escribe tu contraseña.' };

  const { data: { user } } = await getStaffUser();
  if (!user?.email) return { error: 'Tu sesión venció. Vuelve a entrar.' };

  const ip = clientIp(await headers());
  if (!(await rateLimit(`reauth:${user.id}`, 6, 10 * 60_000)) ||
      !(await rateLimit(`reauth-ip:${ip}`, 20, 10 * 60_000))) {
    return { error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' };
  }

  const aparte = createPlainClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error } = await aparte.auth.signInWithPassword({ email: user.email, password });
  if (error) return { error: 'Esa no es tu contraseña.' };
  await aparte.auth.signOut({ scope: 'local' });

  await marcarIdentidadConfirmada(user.id);
  return { ok: true };
}
