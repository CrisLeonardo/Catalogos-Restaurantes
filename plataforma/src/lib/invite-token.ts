import crypto from 'node:crypto';

/* ============================================================
   TOKEN DE INVITACIÓN (migración 114)
   ------------------------------------------------------------
   Vive aparte de lib/auth/invitations.ts —que habla con la base de datos y
   con el proveedor de correo— por la misma razón que pin-policy.ts y
   tenant-guard.ts: lo que sostiene la seguridad de este flujo tiene que
   poder probarse de verdad, y para eso no puede arrastrar medio servidor.

   El token es lo único que separa "el encargado del local" de "cualquiera
   que reciba un reenvío del correo".
   ============================================================ */

/** Una semana: suficiente para un encargado que no revisa el correo a diario. */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60_000;

/** Token en claro (viaja en el enlace) y su hash (lo único que se guarda). */
export function newInviteToken(): { token: string; hash: string } {
  // 32 bytes en base64url ≈ 43 caracteres seguros en una URL. Un enlace que
  // llega por correo vive en bandejas ajenas y en historiales: tiene que ser
  // imposible de enumerar, no solo difícil.
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, hash: hashInviteToken(token) };
}

/**
 * sha-256 basta y sobra aquí: el token son 32 bytes aleatorios, no una
 * contraseña que alguien pueda adivinar por diccionario. Lo que se busca es
 * que una fuga de la tabla no reparta accesos, no frenar fuerza bruta sobre
 * un secreto débil (para eso están scrypt y los PIN).
 */
export function hashInviteToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
