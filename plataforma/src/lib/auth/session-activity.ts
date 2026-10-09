import 'server-only';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/service';
import { mintToken, readToken } from '@/lib/auth/signed-token';
import { readDeviceId } from '@/lib/auth/trusted-device';
import { msDeVentana, tipoDeVentana, VENTANA_CORTA_MS, type TipoVentana } from '@/lib/auth/session-window';

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
   el mostrador. Aquí no hay nada de eso: es solo un reloj de inactividad.

   CUÁNTO DURA (ACC-08, 2026-10-08): 30 min en los aparatos del local y para
   el Super Admin; 7 días en el aparato personal. La regla vive en
   session-window.ts. Se decide al ESCRIBIR la marca (login y latido, como
   mucho una vez por minuto) y viaja FIRMADA dentro de ella: el vencimiento
   del pase ES el plazo de inactividad. Así los layouts lo comprueban sin
   consultar nada, y nadie puede alargarse el plazo editando la cookie.
   ============================================================ */

export const SESSION_SEEN_COOKIE = 'leogin_seen';
const SCOPE = 'session-seen';

/** Ventana del formato viejo (`<uuid>:<ms>`, sin firma, antes de ACC-08). */
export const SESSION_WINDOW_MS = VENTANA_CORTA_MS;

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

  // Formato viejo, de antes de ACC-08: `<uuid>:<ms>`. Se respeta con su
  // ventana de entonces (30 min) hasta que el siguiente toque la reescriba en
  // el formato nuevo — así desplegar esto no saca a nadie de golpe.
  if (cookieValue.includes(':')) {
    const [seenUserId, seenAtRaw] = cookieValue.split(':');
    if (seenUserId !== userId) return false;
    const seenAt = Number(seenAtRaw);
    return !Number.isFinite(seenAt) || Date.now() - seenAt > SESSION_WINDOW_MS;
  }

  // Formato firmado: `<uuid>~<corta|larga>.<vence>.<firma>`. La marca de OTRA
  // cuenta no cuenta (igual que antes); la propia vale mientras su firma sea
  // buena y no haya vencido.
  const seenUserId = cookieValue.split('.')[0]?.split('~')[0];
  if (seenUserId !== userId) return false;
  return readToken(SCOPE, cookieValue) === null;
}

/**
 * ¿Este aparato es del LOCAL? Lo es si algún restaurante lo tiene en su
 * lista de confianza (lo registró un PIN correcto o el dueño a mano) o si es
 * la PC principal de alguno. Cualquier fallo cuenta como «del local»: ante la
 * duda, la ventana corta, que es la que no deja nada abierto.
 */
async function esAparatoDelLocal(db: ReturnType<typeof createServiceClient>): Promise<boolean> {
  const deviceId = await readDeviceId();
  if (!deviceId) return false;
  try {
    const [deConfianza, pcPrincipal] = await Promise.all([
      db.from('restaurant_devices').select('restaurant_id', { head: true, count: 'exact' }).eq('device_id', deviceId),
      db.from('print_agents').select('id', { head: true, count: 'exact' }).eq('activated_device_id', deviceId),
    ]);
    if (deConfianza.error && pcPrincipal.error) return true;
    return (deConfianza.count ?? 0) > 0 || (pcPrincipal.count ?? 0) > 0;
  } catch {
    return true;
  }
}

async function ventanaPara(userId: string): Promise<TipoVentana> {
  try {
    const db = createServiceClient();
    const [{ data: perfil }, delLocal] = await Promise.all([
      db.from('profiles').select('role').eq('id', userId).maybeSingle(),
      esAparatoDelLocal(db),
    ]);
    return tipoDeVentana({ role: (perfil?.role as string | null) ?? null, aparatoDelLocal: delLocal });
  } catch {
    return 'corta';
  }
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
  const tipo = await ventanaPara(userId);
  const ventana = msDeVentana(tipo);
  const store = await cookies();
  store.set(SESSION_SEEN_COOKIE, mintToken(SCOPE, `${userId}~${tipo}`, ventana), {
    httpOnly: true,
    sameSite: 'lax',
    secure: !!SESSION_SEEN_COOKIE_DOMAIN,
    path: '/',
    // OJO: el `maxAge` de la cookie NO es lo que hace cumplir la ventana de
    // inactividad — eso lo decide el vencimiento firmado dentro del valor.
    // Si `maxAge` fuera igual a la ventana, el navegador BORRARÍA la cookie
    // justo cuando toca detectarla como vencida, y una cookie ausente se lee
    // como "recién ingresó" (para no trabar un login legítimo) en vez de
    // "llevaba vencida" — el candado nunca llegaría a dispararse. Por eso
    // vive un día más que la ventana: solo es la limpieza de basura del
    // navegador, nunca el mecanismo que cierra la sesión.
    maxAge: Math.round((ventana + 24 * 60 * 60_000) / 1000),
    ...(SESSION_SEEN_COOKIE_DOMAIN ? { domain: SESSION_SEEN_COOKIE_DOMAIN } : {}),
  });
}
