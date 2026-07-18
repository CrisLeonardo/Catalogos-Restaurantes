import 'server-only';

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
