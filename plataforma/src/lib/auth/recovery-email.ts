import 'server-only';

import { createServiceClient } from '@/lib/supabase/service';
import { sendEmail, emailEnabled } from '@/lib/email';
import { rootDomainForUrls } from '@/lib/tenant';

/* ============================================================
   EL CORREO DE «CREA UNA CONTRASEÑA NUEVA»
   ------------------------------------------------------------
   Lo piden dos sitios y por motivos distintos:

     · la persona, desde «Olvidé mi contraseña» — y ahí la respuesta
       tiene que ser la MISMA exista o no la cuenta, o el formulario se
       convierte en una lista de qué correos son clientes de Leogin;

     · el Super Admin, desde la ficha de una cuenta — y ahí pasa lo
       contrario: si el envío falla hay que decirlo, porque si no se
       queda esperando un correo que nunca va a llegar.

   El enlace y el cuerpo del mensaje son los mismos, así que viven aquí
   una sola vez y cada quien decide qué hacer con el resultado. Antes de
   esto el texto estaba dentro de la acción de recuperación, que es
   donde se habría quedado viejo el día que el otro sitio lo copiara.
   ============================================================ */

export type RecoveryResult =
  /** Enviado. */
  | { ok: true }
  /** No hay cuenta con ese correo (`generateLink` falla). */
  | { ok: false; reason: 'sin-cuenta' }
  /** El proveedor no aceptó el envío. */
  | { ok: false; reason: 'envio' }
  /** No hay proveedor de correo configurado (falta `RESEND_API_KEY`). */
  | { ok: false; reason: 'sin-proveedor' };

/**
 * A dónde apunta el enlace del correo: SIEMPRE el dominio raíz.
 *
 * El panel de cada restaurante vive en su propio subdominio, pero quien pide
 * recuperar su contraseña puede no acordarse de cuál es el suyo —y el correo
 * llega a un cliente que quizá abre el enlace en otro dispositivo—. La cookie
 * de sesión del personal es de dominio ancho, así que entrar por la raíz
 * funciona igual y después se le manda a SU panel (resolveStaffDestination).
 */
export function resetLandingUrl(): string {
  const root = rootDomainForUrls();
  const proto = root.includes('localhost') || root.startsWith('127.') ? 'http' : 'https';
  return `${proto}://${root}/admin/auth/recuperar`;
}

/**
 * Genera el enlace de un solo uso y lo manda con nuestro enviador.
 *
 * El enlace lo hace Supabase (`auth.admin.generateLink`, el mismo mecanismo
 * que usa el login por PIN) pero el correo sale por `lib/email`, no por el
 * SMTP de GoTrue: así lleva la marca Leogin y apunta a donde queremos.
 */
export async function sendRecoveryEmail(email: string): Promise<RecoveryResult> {
  if (!emailEnabled()) return { ok: false, reason: 'sin-proveedor' };

  const db = createServiceClient();
  const { data, error } = await db.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: resetLandingUrl() },
  });

  if (error || !data?.properties?.hashed_token) return { ok: false, reason: 'sin-cuenta' };

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

  return result.ok ? { ok: true } : { ok: false, reason: 'envio' };
}
