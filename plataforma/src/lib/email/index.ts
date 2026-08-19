import 'server-only';

/* ============================================================
   ENVÍO DE CORREO
   ------------------------------------------------------------
   Hasta ahora la plataforma no mandaba UN SOLO correo: las cuentas
   nacían con `email_confirm: true` (marcadas como verificadas sin
   verificar nada) y no existía "olvidé mi contraseña" — el tutorial
   mandaba a escribir por WhatsApp. Con 3 clientes eso se aguanta;
   con 30 es soporte manual por cada dedazo en el correo de registro.

   Todo el correo sale por aquí, detrás de una interfaz mínima, para
   que cambiar de proveedor sea tocar este archivo y nada más.

   Proveedor: Resend por HTTP. Se eligió sobre SMTP porque no añade
   dependencias (basta fetch) y sobre el SMTP de Supabase porque así
   la plantilla y el remitente son nuestros, no los de GoTrue.

   DEGRADACIÓN: sin RESEND_API_KEY no se rompe nada. sendEmail()
   devuelve `{ok:false}` y quien llama decide; emailEnabled() permite
   ocultar en la UI lo que aún no puede funcionar. Es a propósito:
   el registro tiene que seguir funcionando el día que caduque la
   clave o falle el proveedor.
   ============================================================ */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
/** Si el proveedor no contesta en este tiempo, se abandona el envío. */
const TIMEOUT_MS = 10_000;

export type MailMessage = {
  to: string;
  subject: string;
  /** Título grande dentro del correo. */
  heading: string;
  /** Párrafos del cuerpo, en orden. */
  body: string[];
  /** Botón principal, si el correo pide una acción. */
  cta?: { label: string; url: string };
  /** Nota al pie (p. ej. "si no fuiste tú, ignora este correo"). */
  note?: string;
};

/** ¿Hay proveedor configurado? Úsalo para no ofrecer lo que no puede funcionar. */
export function emailEnabled(): boolean {
  return !!process.env.RESEND_API_KEY;
}

/**
 * Remitente. El dominio TIENE que estar verificado en Resend, o el envío se
 * rechaza (y como sendEmail nunca lanza, se rechaza en silencio).
 *
 * Si no se configura `EMAIL_FROM`, se deriva del dominio de la plataforma en
 * vez de llevar uno escrito a mano: el valor fijo que había aquí seguía
 * apuntando a leogin.online después de migrar a distleogin.com, y con Resend
 * verificando el dominio nuevo eso habría fallado en todos los correos sin
 * decir por qué.
 */
function fromAddress(): string {
  if (process.env.EMAIL_FROM) return process.env.EMAIL_FROM;
  const root = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? '').split(',')[0].trim().split(':')[0];
  return root && !root.includes('localhost')
    ? `Leogin <no-responder@${root}>`
    : 'Leogin <onboarding@resend.dev>'; // remitente de pruebas de Resend
}

export type SendResult = { ok: true } | { ok: false; error: string };

/**
 * Manda un correo. Nunca lanza: un fallo del proveedor no puede tumbar un
 * registro ni un cambio de contraseña, así que el error se devuelve y quien
 * llama decide qué contarle al usuario.
 */
export async function sendEmail(message: MailMessage): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: 'El envío de correo no está configurado (falta RESEND_API_KEY).' };
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [message.to],
        subject: message.subject,
        html: renderHtml(message),
        text: renderText(message),
        ...(process.env.EMAIL_REPLY_TO ? { reply_to: process.env.EMAIL_REPLY_TO } : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      return { ok: false, error: `El proveedor de correo respondió ${response.status}. ${detail}`.trim() };
    }
    return { ok: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'error desconocido';
    return { ok: false, error: `No se pudo contactar al proveedor de correo: ${reason}` };
  }
}

/* ── Plantilla ────────────────────────────────────────────────────
   Tabla y estilos en línea, no flex ni grid: los clientes de correo
   (Outlook sobre todo) no soportan CSS moderno, y un correo que se
   ve roto se lee como phishing. Fondo claro siempre: el modo oscuro
   de cada cliente hace lo suyo y pelearse con eso rompe más de lo
   que arregla. */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderHtml(m: MailMessage): string {
  const paragraphs = m.body
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#3f3f46;">${escapeHtml(p)}</p>`)
    .join('');

  const cta = m.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;">
         <tr><td style="border-radius:999px;background:#111113;">
           <a href="${escapeHtml(m.cta.url)}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px;">${escapeHtml(m.cta.label)}</a>
         </td></tr>
       </table>
       <p style="margin:0 0 14px;font-size:12.5px;line-height:1.6;color:#71717a;">Si el botón no funciona, copia y pega esta dirección en tu navegador:<br><span style="color:#3f3f46;word-break:break-all;">${escapeHtml(m.cta.url)}</span></p>`
    : '';

  const note = m.note
    ? `<p style="margin:20px 0 0;padding-top:16px;border-top:1px solid #e4e4e7;font-size:12.5px;line-height:1.6;color:#71717a;">${escapeHtml(m.note)}</p>`
    : '';

  return `<!doctype html>
<html lang="es"><body style="margin:0;padding:0;background:#f4f4f5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;border:1px solid #e4e4e7;">
        <tr><td style="padding:28px 30px;">
          <p style="margin:0 0 20px;font-size:13px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#a1a1aa;">Leogin</p>
          <h1 style="margin:0 0 16px;font-size:21px;line-height:1.3;color:#111113;">${escapeHtml(m.heading)}</h1>
          ${paragraphs}
          ${cta}
          ${note}
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:11.5px;color:#a1a1aa;">Leogin · menús y pedidos para restaurantes</p>
    </td></tr>
  </table>
</body></html>`;
}

function renderText(m: MailMessage): string {
  return [
    m.heading,
    '',
    ...m.body,
    ...(m.cta ? ['', `${m.cta.label}: ${m.cta.url}`] : []),
    ...(m.note ? ['', m.note] : []),
    '',
    '— Leogin',
  ].join('\n');
}
