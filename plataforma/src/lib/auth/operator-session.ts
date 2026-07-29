import 'server-only';
import { cookies } from 'next/headers';

/** Marca de "sesión de operador" (login por PIN) — ver src/lib/actions/staff-pin.ts. */
export const OPERATOR_COOKIE = 'leogin_op_seen';
/** Ventana de inactividad: sin actividad en este lapso, la sesión se da por vencida. */
export const OPERATOR_WINDOW_MS = 30 * 60_000;

const rootDomainRaw = process.env.NEXT_PUBLIC_ROOT_DOMAIN?.split(',')[0].trim() ?? '';
const isLocalEnv = !rootDomainRaw || rootDomainRaw.includes('localhost');
/** Mismo alcance de dominio que la cookie de sesión del personal (ver supabase/server.ts). */
export const OPERATOR_COOKIE_DOMAIN = isLocalEnv ? undefined : `.${rootDomainRaw.split(':')[0]}`;

/**
 * ¿Ya venció por inactividad la sesión de operador (PIN) de este profile?
 * Solo aplica a RESTAURANT_STAFF/RESTAURANT_WAITER que tienen la marca
 * `leogin_op_seen` puesta (login por PIN) — una sesión de staff antigua por
 * email+contraseña, o la del dueño, nunca la tienen y no expiran por esto.
 *
 * Lectura pura (no escribe cookies) — apta para llamarse desde un Server
 * Component (layout), donde escribir cookies no está permitido.
 */
export function isOperatorSessionStale(
  cookieValue: string | undefined,
  role: string | null | undefined,
  profileId: string,
): boolean {
  if (role !== 'RESTAURANT_STAFF' && role !== 'RESTAURANT_WAITER') return false;
  if (!cookieValue) return false;

  const [seenProfileId, seenAtRaw] = cookieValue.split(':');
  if (seenProfileId !== profileId) return false;

  const seenAt = Number(seenAtRaw);
  return !Number.isFinite(seenAt) || Date.now() - seenAt > OPERATOR_WINDOW_MS;
}

/**
 * Escribe/renueva la marca de sesión de operador para `profileId`.
 *
 * Escribe cookies → solo puede llamarse desde una Server Action o un Route
 * Handler, nunca desde un Server Component.
 *
 * El `profileId` es el sujeto real de la sesión y quien llama responde por él:
 * · `touchOperatorSession()` (actions/operator.ts) lo saca de `auth.getUser()`.
 * · el login por PIN (actions/staff-pin.ts) lo usa tras validar el PIN y
 *   confirmar que el perfil pertenece a ese restaurante.
 * Nunca se debe pasar aquí un id que venga del cliente sin verificar: la
 * caducidad por inactividad solo se evalúa cuando el id de la cookie coincide
 * con el del perfil de la sesión, así que un id ajeno la desactivaría.
 */
export async function writeOperatorCookie(profileId: string): Promise<void> {
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
