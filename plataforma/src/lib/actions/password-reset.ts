'use server';

/* ============================================================
   RECUPERAR CONTRASEÑA
   ------------------------------------------------------------
   Antes no existía: el correo es el identificador de login y si el
   dueño lo escribía mal en el registro —o simplemente olvidaba su
   contraseña— no había forma de que se recuperara solo. El tutorial
   decía "contáctanos por WhatsApp" y alguien de Leogin tenía que
   entrar al super admin a resetear a mano.

   El enlace lo genera Supabase (auth.admin.generateLink, el mismo
   mecanismo que ya usa el login por PIN) y lo manda nuestro enviador
   (lib/email), no el SMTP de GoTrue: así el correo lleva la marca
   Leogin y el enlace apunta a donde nosotros queremos.
   ============================================================ */

import { cookies, headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { sendEmail, emailEnabled } from '@/lib/email';
import { resolveStaffDestination } from '@/lib/auth/destination';
import { readResetPass, RESET_COOKIE, resetCookieOptions } from '@/lib/auth/reset-session';
import { writeSessionActivity } from '@/lib/auth/session-activity';
import { splitLoginIdentifier } from '@/lib/staff-email';
import { rootDomainForUrls } from '@/lib/tenant';

/**
 * `url` (solo la devuelve `setNewPassword`) = entra aquí con una navegación
 * de DOCUMENTO desde el cliente (`window.location.assign`), no con el
 * `redirect()` del servidor: mismo motivo que `enterRestaurant`
 * (lib/actions/mi-cuenta.ts).
 */
export type ResetState = { error: string } | { sent: true } | { url: string } | null;

/** Dominio de los correos sintéticos del personal que entra por PIN. */
const STAFF_EMAIL_DOMAIN = '@staff.leogin.internal';

/**
 * Misma respuesta pase lo que pase: que exista o no una cuenta con ese correo
 * no puede deducirse desde fuera. Si no, este formulario se convierte en una
 * lista de qué correos son clientes de Leogin.
 */
const NEUTRAL: ResetState = { sent: true };

export async function requestPasswordReset(
  prevState: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const email = (formData.get('email') as string)?.trim().toLowerCase() ?? '';

  const headersList = await headers();
  const ip = clientIp(headersList);
  // Dos cubos: uno frena a quien barre muchos correos desde una IP, el otro
  // evita inundar el buzón de una persona concreta.
  if (!(await rateLimit(`reset:${ip}`, 5, 15 * 60_000))) {
    return { error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' };
  }
  // Quien entra con el usuario de su restaurante (`carlos@azucar-negra`) NO
  // tiene buzón: su credencial se parece a un correo pero no lo es. Antes
  // caía en el regex de abajo y se llevaba un "escribe un correo válido" —
  // le decíamos que se había equivocado cuando lo había escrito perfecto, y
  // se quedaba sin saber a quién pedirle ayuda. Se comprueba ANTES que el
  // formato, y sin tocar la base de datos: no hace falta saber si ese
  // restaurante existe para dar la respuesta correcta.
  const comoCredencial = splitLoginIdentifier(email, headersList.get('x-tenant-slug'));
  if (comoCredencial?.kind === 'username') {
    return {
      error:
        'Ese acceso es de tu restaurante, no un correo, así que no hay buzón al que mandarte un enlace. Pídele a la persona dueña que te ponga una contraseña nueva desde Personal. Si la persona dueña eres tú, escribe aquí tu correo completo.',
    };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Escribe un correo válido.' };
  }
  if (!(await rateLimit(`reset:mail:${email}`, 3, 15 * 60_000))) return NEUTRAL;

  // El personal que entra por PIN tiene correos inventados que no existen:
  // mandar ahí un enlace es un correo al vacío.
  if (email.endsWith(STAFF_EMAIL_DOMAIN)) return NEUTRAL;

  if (!emailEnabled()) {
    return {
      error:
        'Todavía no podemos enviar correos. Escríbenos por WhatsApp y te ayudamos a entrar.',
    };
  }

  const db = createServiceClient();
  const { data, error } = await db.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: resetLandingUrl() },
  });

  // Correo sin cuenta: generateLink falla. Se responde igual que si hubiera
  // salido bien (ver NEUTRAL).
  if (error || !data?.properties?.hashed_token) return NEUTRAL;

  const url = `${resetLandingUrl()}?token=${encodeURIComponent(data.properties.hashed_token)}`;
  const result = await sendEmail({
    to: email,
    subject: 'Recupera el acceso a tu panel de Leogin',
    heading: 'Recupera tu contraseña',
    body: [
      'Recibimos una solicitud para cambiar la contraseña con la que entras a tu panel de Leogin.',
      'El enlace funciona una sola vez y caduca en una hora.',
    ],
    cta: { label: 'Crear una contraseña nueva', url },
    note: 'Si no fuiste tú, ignora este correo: tu contraseña sigue siendo la misma.',
  });

  // Un fallo del proveedor sí se dice: callarlo dejaría al dueño esperando un
  // correo que nunca va a llegar.
  if (!result.ok) {
    return { error: 'No pudimos enviar el correo en este momento. Inténtalo de nuevo en unos minutos.' };
  }
  return NEUTRAL;
}

/**
 * Guarda la contraseña nueva. Exige el pase de recuperación (la prueba de que
 * se llegó por el enlace del correo) Y que ese pase sea de la misma cuenta que
 * tiene la sesión abierta.
 */
export async function setNewPassword(
  prevState: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const password = (formData.get('password') as string) ?? '';
  const password2 = (formData.get('password2') as string) ?? '';

  if (password.length < 8) return { error: 'La contraseña debe tener al menos 8 caracteres.' };
  if (password !== password2) return { error: 'Las dos contraseñas no coinciden.' };

  const store = await cookies();
  const passUserId = readResetPass(store.get(RESET_COOKIE)?.value);
  if (!passUserId) {
    return { error: 'El enlace venció. Pide uno nuevo desde "Olvidé mi contraseña".' };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== passUserId) {
    return { error: 'El enlace venció. Pide uno nuevo desde "Olvidé mi contraseña".' };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  // El pase es de un solo uso.
  store.set(RESET_COOKIE, '', { ...resetCookieOptions(), maxAge: 0 });

  // Arranca el reloj de inactividad (checklist 2026-08-25 §2).
  await writeSessionActivity(user.id);

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, permissions, restaurant_id')
    .eq('id', user.id)
    .single();
  if (!profile) return { url: '/admin/login' };

  return {
    url: await resolveStaffDestination(
      supabase,
      profile as { role: string; permissions: string[] | null; restaurant_id: string | null },
      (await headers()).get('x-tenant-slug'),
    ),
  };
}

/**
 * A dónde apunta el enlace del correo: SIEMPRE el dominio raíz.
 *
 * El panel de cada restaurante vive en su propio subdominio, pero quien pide
 * recuperar su contraseña puede no acordarse de cuál es el suyo —y el correo
 * llega a un cliente que quizá abre el enlace en otro dispositivo—. La cookie
 * de sesión del personal es de dominio ancho, así que entrar por la raíz
 * funciona igual y después se le manda a SU panel (resolveStaffDestination).
 */
function resetLandingUrl(): string {
  const root = rootDomainForUrls();
  const proto = root.includes('localhost') || root.startsWith('127.') ? 'http' : 'https';
  return `${proto}://${root}/admin/auth/recuperar`;
}
