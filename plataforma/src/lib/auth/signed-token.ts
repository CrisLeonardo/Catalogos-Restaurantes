import 'server-only';

import crypto from 'node:crypto';

/* ============================================================
   PASES FIRMADOS (cookies con caducidad, sin tabla)
   ------------------------------------------------------------
   Un pase dice "el portador puede hacer X hasta la hora Y" y va
   firmado con una clave que solo conoce el servidor. No se puede
   fabricar ni alargar sin la clave, y validarlo no consulta nada.

   Se usa para permisos cortos y acotados donde una fila en la base
   sería más maquinaria de la necesaria:
     · el pase de soporte del Super Admin (support-session.ts);
     · el pase de "vengo del enlace de recuperación" (reset-session.ts),
       que evita que una sesión robada pueda cambiar la contraseña sin
       pasar por el correo.

   Formato: <valor>.<expiraMs>.<firma base64url>
   El valor NO puede llevar puntos (en la práctica siempre es un uuid).
   ============================================================ */

/**
 * Clave de firma. Preferimos la clave maestra ya existente; si el despliegue
 * todavía no la tiene puesta (es opcional: solo FEL y WhatsApp la exigen),
 * caemos a la service role key, que siempre está y nunca sale del servidor.
 *
 * El `scope` entra en la derivación: un pase de soporte nunca puede valer
 * como pase de recuperación aunque el formato sea idéntico.
 */
function keyFor(scope: string): Buffer {
  const raw =
    process.env.LEOGIN_SECRET_KEY ||
    process.env.WHATSAPP_TOKEN_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!raw) {
    throw new Error(
      'No hay clave para firmar los pases: define LEOGIN_SECRET_KEY ' +
      '(openssl rand -base64 32) o SUPABASE_SERVICE_ROLE_KEY.',
    );
  }
  return crypto.createHash('sha256').update(`${scope}:${raw}`).digest();
}

function sign(scope: string, payload: string): string {
  return crypto.createHmac('sha256', keyFor(scope)).update(payload).digest('base64url');
}

/** Crea un pase para `value`, válido durante `ttlMs`. */
export function mintToken(scope: string, value: string, ttlMs: number): string {
  const payload = `${value}.${Date.now() + ttlMs}`;
  return `${payload}.${sign(scope, payload)}`;
}

/**
 * Valor del pase, o null si falta, venció o la firma no cuadra.
 *
 * La firma se compara en tiempo constante: con `===` el tiempo de respuesta
 * delata cuántos bytes iniciales acertó quien la está fabricando.
 */
export function readToken(scope: string, token: string | undefined): string | null {
  if (!token) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [value, expiresRaw, signature] = parts;

  const expires = Number(expiresRaw);
  if (!Number.isFinite(expires) || Date.now() > expires) return null;

  const expected = Buffer.from(sign(scope, `${value}.${expiresRaw}`));
  const given = Buffer.from(signature);
  if (expected.length !== given.length) return null;
  if (!crypto.timingSafeEqual(expected, given)) return null;

  return value;
}

/** Alcance de dominio de las cookies de pase: el mismo que la sesión del personal. */
const rootDomainRaw = process.env.NEXT_PUBLIC_ROOT_DOMAIN?.split(',')[0].trim() ?? '';
const isLocalEnv = !rootDomainRaw || rootDomainRaw.includes('localhost');
export const PASS_COOKIE_DOMAIN = isLocalEnv ? undefined : `.${rootDomainRaw.split(':')[0]}`;

/** Opciones con las que se escribe (y se borra) la cookie de un pase. */
export function passCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: !!PASS_COOKIE_DOMAIN,
    path: '/',
    ...(PASS_COOKIE_DOMAIN ? { domain: PASS_COOKIE_DOMAIN } : {}),
  };
}
