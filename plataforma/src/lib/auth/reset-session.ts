import 'server-only';

import { mintToken, readToken, passCookieOptions } from '@/lib/auth/signed-token';

/* ============================================================
   PASE DE RECUPERACIÓN DE CONTRASEÑA
   ------------------------------------------------------------
   Se emite cuando alguien abre el enlace que le llegó al correo y
   ese enlace resulta válido (ver /admin/auth/recuperar). La pantalla
   de contraseña nueva lo exige.

   Por qué no basta con "tener sesión": el enlace del correo INICIA
   sesión, así que sin este pase la pantalla de contraseña nueva
   quedaría abierta a cualquier sesión de personal ya iniciada. Una
   pestaña olvidada en la PC del restaurante bastaría para cambiarle
   la contraseña al dueño y dejarlo fuera. Con el pase, cambiar la
   contraseña exige haber pasado por el correo — que es justo lo que
   prueba que la cuenta es tuya.

   Corto a propósito: es el tiempo de escribir una contraseña.
   ============================================================ */

export const RESET_COOKIE = 'leogin_recuperacion';
export const RESET_TTL_MS = 15 * 60_000; // 15 minutos

const SCOPE = 'recuperacion';

/** Pase para `userId`: solo esa cuenta puede cambiar su contraseña con él. */
export function mintResetPass(userId: string): string {
  return mintToken(SCOPE, userId, RESET_TTL_MS);
}

/** Id del usuario que abrió el enlace del correo, o null si no vale. */
export function readResetPass(cookieValue: string | undefined): string | null {
  return readToken(SCOPE, cookieValue);
}

export const resetCookieOptions = passCookieOptions;
