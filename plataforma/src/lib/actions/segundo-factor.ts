'use server';

/* ============================================================
   SEGUNDO FACTOR — inscribir la app y verificar el código
   ------------------------------------------------------------
   PLAN_ACCESO_Y_MONITOREO_2026-10-08, ACC-01. La pantalla es
   /admin/dos-pasos; la regla vive en lib/auth/segundo-factor-policy.ts.

   Se trabaja con la sesión CRUDA (`getStaffSessionRaw`), no con
   `getStaffUser()`: esa última, a propósito, dice «no hay sesión» mientras
   falte el código — que es justo lo que esta pantalla viene a resolver.

   Usa la API de factores de Supabase Auth (TOTP): el secreto lo guarda
   Supabase, aquí no se toca ni se almacena nada. Verificar el código sube la
   sesión a `aal2` y el cliente del servidor reescribe las cookies solo.
   ============================================================ */

import { headers } from 'next/headers';
import { createClient, getStaffSessionRaw } from '@/lib/supabase/server';
import { esCodigoValido } from '@/lib/auth/segundo-factor-policy';
import { destinoTrasSegundoFactor } from '@/lib/auth/segundo-factor-destino';
import { writeSessionActivity } from '@/lib/auth/session-activity';
import { rateLimit, clientIp } from '@/lib/rate-limit';

export type Inscripcion =
  | { factorId: string; qr: string; secreto: string }
  | { error: string };

/** `url` = se entra con navegación de documento, igual que login(). */
export type CodigoState = { error: string } | { url: string } | null;

const SESION_VENCIDA = 'Tu sesión venció. Vuelve a entrar con tu contraseña.';

/** Prepara una app nueva: devuelve el QR para escanearlo. */
export async function empezarInscripcion(): Promise<Inscripcion> {
  const { res, paso } = await getStaffSessionRaw();
  const user = res.data.user;
  if (!user) return { error: SESION_VENCIDA };
  if (paso !== 'inscribir') return { error: 'Esta cuenta ya tiene su app configurada.' };

  if (!(await rateLimit(`mfa-inscribir:${user.id}`, 10, 10 * 60_000))) {
    return { error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' };
  }

  const supabase = await createClient();

  // Un intento anterior que se quedó a medias (cerró la pestaña sin escribir
  // el código) deja un factor sin verificar. Se limpia antes de empezar otro:
  // con él colgado, Supabase rechaza el nuevo por nombre repetido.
  const { data: lista } = await supabase.auth.mfa.listFactors();
  for (const f of lista?.all ?? []) {
    if (f.factor_type === 'totp' && f.status !== 'verified') {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    issuer: 'Leogin',
    friendlyName: `Leogin ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
  });
  if (error || !data) {
    console.error('[segundo-factor] enroll falló:', error?.message);
    return {
      error: 'No se pudo preparar el código. Si se repite, revisa en Supabase que el segundo factor por app (TOTP) esté activado.',
    };
  }

  return { factorId: data.id, qr: data.totp.qr_code, secreto: data.totp.secret };
}

/**
 * Comprueba el código de 6 cifras. Sirve para los dos casos: terminar de
 * inscribir una app nueva (llega `factorId`) y entrar con la que ya tiene.
 */
export async function confirmarCodigo(_prev: CodigoState, formData: FormData): Promise<CodigoState> {
  const codigo = String(formData.get('codigo') ?? '').replace(/\s+/g, '');
  if (!esCodigoValido(codigo)) return { error: 'Escribe las 6 cifras que muestra tu app.' };

  const { res, paso } = await getStaffSessionRaw();
  const user = res.data.user;
  if (!user) return { error: SESION_VENCIDA };

  // Mismo techo que el PIN: por persona y por IP. Seis cifras son un millón
  // de combinaciones; con 5 intentos cada 5 minutos no se recorren nunca.
  const ip = clientIp(await headers());
  if (!(await rateLimit(`mfa-codigo:${user.id}`, 5, 5 * 60_000)) ||
      !(await rateLimit(`mfa-codigo-ip:${ip}`, 20, 5 * 60_000))) {
    return { error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' };
  }

  if (paso !== 'listo') {
    const factores = user.factors ?? [];
    const factorId = paso === 'verificar'
      ? factores.find((f) => f.factor_type === 'totp' && f.status === 'verified')?.id
      : String(formData.get('factorId') ?? '');
    // El id del formulario tiene que ser de ESTA cuenta: un id ajeno no lo
    // aceptaría Supabase, pero mejor no preguntarle.
    if (!factorId || !factores.some((f) => f.id === factorId)) {
      return { error: 'No encontramos tu app configurada. Recarga la página y empieza de nuevo.' };
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: codigo });
    if (error) {
      return {
        error: 'Código incorrecto o vencido. Escribe el que se ve AHORA en la app (cambia cada 30 segundos) y revisa que la hora del celular esté en automático.',
      };
    }
  }

  await writeSessionActivity(user.id);

  // Ya con el código puesto, a donde iba.
  return { url: await destinoTrasSegundoFactor(user.id) };
}
