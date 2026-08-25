import 'server-only';
import { cookies } from 'next/headers';

/* ============================================================
   INACTIVIDAD de la sesión de correo/Google (checklist 2026-08-25 §2)
   ------------------------------------------------------------
   El PIN ya caduca a los 30 min sin actividad (operator-session.ts). La
   sesión de correo/Google —dueño, super admin, o staff que entró por ahí en
   vez de PIN— no tenía NINGÚN límite: podía seguir viva días. En el aparato
   compartido del local eso es lo que dejaba "Continuar como Dueño" ofrecido
   para siempre a quien tomara el aparato después (ver resume.ts).

   Mismo patrón que operator-session.ts, pero deliberadamente APARTE: esa
   cookie además significa "entró por PIN" para la UI (LogoutButton cambia a
   "Cambiar de usuario", "Capa A" no se toca, etc.) — mezclar los dos
   conceptos habría hecho que un dueño por correo viera texto pensado para
   el mostrador. Aquí no hay nada de eso: es solo un reloj de inactividad,
   parejo para cualquier rol y cualquier aparato (decisión de producto
   2026-08-25: un solo umbral, sin excepción por tipo de aparato).
   ============================================================ */

export const SESSION_SEEN_COOKIE = 'leogin_seen';
/** Ventana de inactividad: mismo umbral que el PIN. */
export const SESSION_WINDOW_MS = 30 * 60_000;

const rootDomainRaw = process.env.NEXT_PUBLIC_ROOT_DOMAIN?.split(',')[0].trim() ?? '';
const isLocalEnv = !rootDomainRaw || rootDomainRaw.includes('localhost');
/** Mismo alcance de dominio que la cookie de sesión del personal. */
export const SESSION_SEEN_COOKIE_DOMAIN = isLocalEnv ? undefined : `.${rootDomainRaw.split(':')[0]}`;

/**
 * ¿Ya venció por inactividad la sesión de correo/Google de este usuario?
 *
 * Sin cookie (login recién hecho, antes de que el heartbeat o el propio
 * login la escriban) NO cuenta como vencida — igual que
 * `isOperatorSessionStale`, para no dejar sin entrar a quien recién inició
 * sesión. Cada punto de entrada (login, Google, verificar correo,
 * recuperar contraseña) escribe la marca de una vez al crear la sesión,
 * así que en la práctica esta rama solo aplica a sesiones de antes de este
 * cambio.
 *
 * Lectura pura (no escribe cookies) — apta para un Server Component.
 */
export function isSessionStale(cookieValue: string | undefined, userId: string): boolean {
  if (!cookieValue) return false;

  const [seenUserId, seenAtRaw] = cookieValue.split(':');
  if (seenUserId !== userId) return false;

  const seenAt = Number(seenAtRaw);
  return !Number.isFinite(seenAt) || Date.now() - seenAt > SESSION_WINDOW_MS;
}

/**
 * Escribe/renueva la marca de actividad para `userId`.
 *
 * Escribe cookies → solo desde una Server Action o un Route Handler.
 * Mismo cuidado que `writeOperatorCookie`: quien llama responde por que
 * `userId` salga de una sesión ya verificada del lado del servidor, nunca
 * del cliente.
 */
export async function writeSessionActivity(userId: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_SEEN_COOKIE, `${userId}:${Date.now()}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: !!SESSION_SEEN_COOKIE_DOMAIN,
    path: '/',
    // OJO: el `maxAge` de la cookie NO es lo que hace cumplir la ventana de
    // inactividad — eso lo decide `isSessionStale()` comparando el reloj de
    // adentro. Si `maxAge` fuera igual a `SESSION_WINDOW_MS`, el navegador
    // BORRARÍA la cookie justo cuando toca detectarla como vencida, y una
    // cookie ausente se lee como "recién ingresó" (para no trabar un login
    // legítimo) en vez de "llevaba vencida" — el candado nunca llegaría a
    // dispararse. Por eso vive mucho más que la ventana: solo es la
    // limpieza de basura del navegador si el aparato queda cerrado para
    // siempre, nunca el mecanismo que cierra la sesión.
    maxAge: 24 * 60 * 60,
    ...(SESSION_SEEN_COOKIE_DOMAIN ? { domain: SESSION_SEEN_COOKIE_DOMAIN } : {}),
  });
}
