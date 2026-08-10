import 'server-only';

import { createServiceClient } from '@/lib/supabase/service';
import { sendEmail, emailEnabled } from '@/lib/email';
import { rootDomainForUrls } from '@/lib/tenant';

/* ============================================================
   VERIFICACIÓN SUAVE DEL CORREO DEL DUEÑO (migración 109)
   ------------------------------------------------------------
   El alta self-serve crea la cuenta con `email_confirm: true` y eso
   NO cambia: el restaurante tiene que quedar en vivo en dos minutos,
   que es lo que se promete. Lo que se añade es comprobar de verdad
   que ese buzón existe y es suyo, sin poner un muro:

     · se manda un enlace al terminar el registro;
     · al abrirlo se guarda profiles.email_verified_at;
     · mientras no lo abra, el panel muestra un aviso — y nada más.

   Por qué suave: sin dominio propio con SPF/DKIM el correo se va a
   spam, y un muro bloquearía clientes reales por un correo que nunca
   llegó. Peor que no tenerlo. Cuando el registro se abra a tráfico
   público de verdad (BASICO es gratis: alguien puede apartar slugs en
   masa) se endurece, no antes.

   El enlace lo emite Supabase con generateLink('magiclink'): el mismo
   mecanismo del login por PIN. Se usa magiclink y no 'signup' porque
   la cuenta ya está confirmada en auth — para GoTrue no hay nada que
   confirmar; el dato que nos importa es nuestro.
   ============================================================ */

/** Correos inventados del personal que entra por PIN: nunca se les escribe. */
const STAFF_EMAIL_DOMAIN = '@staff.leogin.internal';

/**
 * Manda el correo de confirmación. Nunca lanza ni bloquea: el registro tiene
 * que terminar bien aunque el proveedor de correo esté caído.
 */
export async function sendEmailVerification(email: string): Promise<void> {
  if (!emailEnabled()) return;
  if (email.endsWith(STAFF_EMAIL_DOMAIN)) return;

  try {
    const db = createServiceClient();
    const { data, error } = await db.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: verificationLandingUrl() },
    });
    if (error || !data?.properties?.hashed_token) return;

    await sendEmail({
      to: email,
      subject: 'Confirma tu correo de Leogin',
      heading: 'Confirma tu correo',
      body: [
        'Tu restaurante ya está en vivo. Solo falta confirmar que este correo es tuyo.',
        'Es importante: es el correo con el que entras a tu panel y el único por el que ' +
        'podrás recuperar tu contraseña si se te olvida.',
      ],
      cta: {
        label: 'Confirmar mi correo',
        url: `${verificationLandingUrl()}?token=${encodeURIComponent(data.properties.hashed_token)}`,
      },
      note: 'Si no creaste ninguna cuenta en Leogin, ignora este correo.',
    });
  } catch {
    // Un fallo aquí no puede tumbar un registro que ya se completó.
  }
}

function verificationLandingUrl(): string {
  const root = rootDomainForUrls();
  const proto = root.includes('localhost') || root.startsWith('127.') ? 'http' : 'https';
  return `${proto}://${root}/admin/auth/verificar`;
}
