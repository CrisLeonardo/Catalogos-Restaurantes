/* ============================================================
   CLIENTE DE WHATSAPP CLOUD API (Fase 1A)
   ------------------------------------------------------------
   Envío saliente y bitácora. Todo lo que sale hacia Meta pasa por aquí.

   LA REGLA QUE MANDA — ventana de servicio de 24h:
   Meta solo deja mandar texto libre dentro de las 24h siguientes al último
   mensaje DEL CLIENTE. Fuera de esa ventana hay que usar una plantilla
   aprobada previamente por Meta, o la API rechaza el envío. Por eso
   `sendWhatsAppText` consulta `last_inbound_at` y, si la ventana está
   cerrada, NO intenta el envío: devuelve `window_closed` para que quien
   llama decida usar plantilla. Intentarlo igual solo gastaría una llamada
   fallida y ensuciaría la bitácora.

   Todo es best-effort: un fallo de WhatsApp nunca debe romper la operación
   del restaurante (cambiar el estado de un pedido, cobrar, imprimir).
   ============================================================ */

import { createServiceClient } from '@/lib/supabase/service';
import { decryptToken } from '@/lib/whatsapp/crypto';

/** Versión de la Graph API. Override por entorno para no depender de un
 *  deploy cuando Meta saque una nueva y haya que moverse. */
const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v21.0';

/** Ventana de servicio de Meta, en milisegundos. */
const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type SendResult =
  | { ok: true; waMessageId: string | null }
  | { ok: false; reason: 'no_account' | 'window_closed' | 'api_error' | 'not_configured'; detail?: string };

export interface WhatsAppAccount {
  restaurantId: string;
  phoneNumberId: string;
  token: string;
}

/**
 * Cuenta activa del restaurante con el token ya descifrado.
 * null si no hay número conectado o si está desactivado.
 */
export async function getAccount(restaurantId: string): Promise<WhatsAppAccount | null> {
  const db = createServiceClient();
  const { data } = await db
    .from('whatsapp_accounts')
    .select('phone_number_id, access_token_cipher, activo')
    .eq('restaurant_id', restaurantId)
    .single();

  if (!data || !data.activo) return null;

  try {
    return {
      restaurantId,
      phoneNumberId: data.phone_number_id as string,
      token: decryptToken(data.access_token_cipher as string),
    };
  } catch {
    // Token ilegible (clave rotada sin re-cifrar, fila alterada). Se trata
    // como "sin cuenta": mejor no enviar que enviar con basura.
    return null;
  }
}

/** Resuelve el restaurante dueño de un phone_number_id (ruteo del webhook). */
export async function restaurantIdForPhoneNumber(phoneNumberId: string): Promise<string | null> {
  const db = createServiceClient();
  const { data } = await db
    .from('whatsapp_accounts')
    .select('restaurant_id')
    .eq('phone_number_id', phoneNumberId)
    .single();
  return (data?.restaurant_id as string) ?? null;
}

/**
 * Devuelve (creando si hace falta) el hilo de conversación con ese teléfono.
 * `touchInbound` marca la llegada de un mensaje del cliente, que es lo que
 * reabre la ventana de 24h.
 */
export async function ensureConversation(
  restaurantId: string,
  waId: string,
  opts: { touchInbound?: boolean } = {},
): Promise<{ id: string; lastInboundAt: string | null } | null> {
  const db = createServiceClient();
  const now = new Date().toISOString();

  const { data: existing } = await db
    .from('whatsapp_conversations')
    .select('id, last_inbound_at')
    .eq('restaurant_id', restaurantId)
    .eq('wa_id', waId)
    .single();

  if (existing) {
    if (opts.touchInbound) {
      await db
        .from('whatsapp_conversations')
        .update({ last_inbound_at: now, updated_at: now })
        .eq('id', existing.id);
      return { id: existing.id as string, lastInboundAt: now };
    }
    return { id: existing.id as string, lastInboundAt: (existing.last_inbound_at as string) ?? null };
  }

  const { data: created } = await db
    .from('whatsapp_conversations')
    .insert({
      restaurant_id: restaurantId,
      wa_id: waId,
      last_inbound_at: opts.touchInbound ? now : null,
    })
    .select('id, last_inbound_at')
    .single();

  if (!created) return null;
  return { id: created.id as string, lastInboundAt: (created.last_inbound_at as string) ?? null };
}

/** ¿Sigue abierta la ventana de 24h para texto libre? */
export function isWindowOpen(lastInboundAt: string | null): boolean {
  if (!lastInboundAt) return false;
  return Date.now() - new Date(lastInboundAt).getTime() < SERVICE_WINDOW_MS;
}

async function logMessage(row: {
  conversationId: string;
  restaurantId: string;
  direction: 'IN' | 'OUT';
  kind: string;
  payload: unknown;
  waMessageId?: string | null;
  status?: string | null;
  error?: string | null;
  orderId?: string | null;
}): Promise<void> {
  const db = createServiceClient();
  await db.from('whatsapp_messages').insert({
    conversation_id: row.conversationId,
    restaurant_id: row.restaurantId,
    direction: row.direction,
    kind: row.kind,
    payload: row.payload as Record<string, unknown>,
    wa_message_id: row.waMessageId ?? null,
    status: row.status ?? null,
    error: row.error ?? null,
    order_id: row.orderId ?? null,
  });
}

/** POST crudo a la Cloud API. Centralizado para que el manejo de error sea uno solo. */
async function postToGraph(
  account: WhatsAppAccount,
  body: Record<string, unknown>,
): Promise<{ ok: true; waMessageId: string | null } | { ok: false; detail: string }> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${account.phoneNumberId}/messages`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${account.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      // Un WhatsApp lento no puede colgar un cambio de estado de pedido.
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : 'fetch falló' };
  }

  const json = (await res.json().catch(() => null)) as
    | { messages?: { id: string }[]; error?: { message?: string } }
    | null;

  if (!res.ok) {
    return { ok: false, detail: json?.error?.message ?? `HTTP ${res.status}` };
  }
  return { ok: true, waMessageId: json?.messages?.[0]?.id ?? null };
}

/**
 * Texto libre. Solo funciona DENTRO de la ventana de 24h; fuera de ella
 * devuelve `window_closed` sin llamar a Meta (ver cabecera del archivo).
 */
export async function sendWhatsAppText(
  restaurantId: string,
  waId: string,
  text: string,
  opts: { orderId?: string | null } = {},
): Promise<SendResult> {
  const account = await getAccount(restaurantId);
  if (!account) return { ok: false, reason: 'no_account' };

  const convo = await ensureConversation(restaurantId, waId);
  if (!convo) return { ok: false, reason: 'api_error', detail: 'no se pudo abrir la conversación' };

  if (!isWindowOpen(convo.lastInboundAt)) {
    return { ok: false, reason: 'window_closed' };
  }

  const body = {
    messaging_product: 'whatsapp',
    to: waId,
    type: 'text',
    text: { body: text, preview_url: false },
  };

  const sent = await postToGraph(account, body);

  await logMessage({
    conversationId: convo.id,
    restaurantId,
    direction: 'OUT',
    kind: 'text',
    payload: body,
    waMessageId: sent.ok ? sent.waMessageId : null,
    status: sent.ok ? 'sent' : 'failed',
    error: sent.ok ? null : sent.detail,
    orderId: opts.orderId ?? null,
  });

  return sent.ok
    ? { ok: true, waMessageId: sent.waMessageId }
    : { ok: false, reason: 'api_error', detail: sent.detail };
}

/**
 * Plantilla aprobada. Es el único envío válido FUERA de la ventana de 24h.
 * `params` rellena las variables {{1}}, {{2}}… del cuerpo, en orden.
 */
export async function sendWhatsAppTemplate(
  restaurantId: string,
  waId: string,
  templateName: string,
  params: string[],
  opts: { languageCode?: string; orderId?: string | null } = {},
): Promise<SendResult> {
  const account = await getAccount(restaurantId);
  if (!account) return { ok: false, reason: 'no_account' };

  const convo = await ensureConversation(restaurantId, waId);
  if (!convo) return { ok: false, reason: 'api_error', detail: 'no se pudo abrir la conversación' };

  const body = {
    messaging_product: 'whatsapp',
    to: waId,
    type: 'template',
    template: {
      name: templateName,
      language: { code: opts.languageCode ?? 'es' },
      ...(params.length > 0
        ? {
            components: [
              {
                type: 'body',
                parameters: params.map((p) => ({ type: 'text', text: p })),
              },
            ],
          }
        : {}),
    },
  };

  const sent = await postToGraph(account, body);

  await logMessage({
    conversationId: convo.id,
    restaurantId,
    direction: 'OUT',
    kind: 'template',
    payload: body,
    waMessageId: sent.ok ? sent.waMessageId : null,
    status: sent.ok ? 'sent' : 'failed',
    error: sent.ok ? null : sent.detail,
    orderId: opts.orderId ?? null,
  });

  return sent.ok
    ? { ok: true, waMessageId: sent.waMessageId }
    : { ok: false, reason: 'api_error', detail: sent.detail };
}

/* ── Mensajes interactivos (Fase 1B) ─────────────────────────
   Los límites son de Meta y no negociables: 3 botones como máximo, y 10
   filas como máximo por lista. Pasarse no da un error claro — el mensaje
   simplemente se rechaza —, así que se recortan aquí, en un solo lugar,
   en vez de confiar en que cada pantalla del bot se acuerde. */

export const WA_MAX_BUTTONS = 3;
export const WA_MAX_LIST_ROWS = 10;

/** Hasta 3 botones. `id` es lo que vuelve en el webhook al tocarlos. */
export async function sendWhatsAppButtons(
  restaurantId: string,
  waId: string,
  bodyText: string,
  buttons: { id: string; title: string }[],
): Promise<SendResult> {
  const account = await getAccount(restaurantId);
  if (!account) return { ok: false, reason: 'no_account' };

  const convo = await ensureConversation(restaurantId, waId);
  if (!convo) return { ok: false, reason: 'api_error', detail: 'no se pudo abrir la conversación' };
  if (!isWindowOpen(convo.lastInboundAt)) return { ok: false, reason: 'window_closed' };

  const body = {
    messaging_product: 'whatsapp',
    to: waId,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText.slice(0, 1024) },
      action: {
        buttons: buttons.slice(0, WA_MAX_BUTTONS).map((b) => ({
          type: 'reply',
          // El título de un botón no puede pasar de 20 caracteres.
          reply: { id: b.id.slice(0, 256), title: b.title.slice(0, 20) },
        })),
      },
    },
  };

  const sent = await postToGraph(account, body);
  await logMessage({
    conversationId: convo.id,
    restaurantId,
    direction: 'OUT',
    kind: 'interactive_buttons',
    payload: body,
    waMessageId: sent.ok ? sent.waMessageId : null,
    status: sent.ok ? 'sent' : 'failed',
    error: sent.ok ? null : sent.detail,
  });

  return sent.ok
    ? { ok: true, waMessageId: sent.waMessageId }
    : { ok: false, reason: 'api_error', detail: sent.detail };
}

/** Lista desplegable de hasta 10 filas. */
export async function sendWhatsAppList(
  restaurantId: string,
  waId: string,
  bodyText: string,
  buttonText: string,
  rows: { id: string; title: string; description?: string }[],
): Promise<SendResult> {
  const account = await getAccount(restaurantId);
  if (!account) return { ok: false, reason: 'no_account' };

  const convo = await ensureConversation(restaurantId, waId);
  if (!convo) return { ok: false, reason: 'api_error', detail: 'no se pudo abrir la conversación' };
  if (!isWindowOpen(convo.lastInboundAt)) return { ok: false, reason: 'window_closed' };

  const body = {
    messaging_product: 'whatsapp',
    to: waId,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: bodyText.slice(0, 1024) },
      action: {
        button: buttonText.slice(0, 20),
        sections: [
          {
            rows: rows.slice(0, WA_MAX_LIST_ROWS).map((r) => ({
              id: r.id.slice(0, 200),
              title: r.title.slice(0, 24),
              ...(r.description ? { description: r.description.slice(0, 72) } : {}),
            })),
          },
        ],
      },
    },
  };

  const sent = await postToGraph(account, body);
  await logMessage({
    conversationId: convo.id,
    restaurantId,
    direction: 'OUT',
    kind: 'interactive_list',
    payload: body,
    waMessageId: sent.ok ? sent.waMessageId : null,
    status: sent.ok ? 'sent' : 'failed',
    error: sent.ok ? null : sent.detail,
  });

  return sent.ok
    ? { ok: true, waMessageId: sent.waMessageId }
    : { ok: false, reason: 'api_error', detail: sent.detail };
}

/** Registra un mensaje ENTRANTE (lo usa el webhook). */
export async function logInboundMessage(args: {
  conversationId: string;
  restaurantId: string;
  waMessageId: string | null;
  kind: string;
  payload: unknown;
}): Promise<void> {
  await logMessage({
    conversationId: args.conversationId,
    restaurantId: args.restaurantId,
    direction: 'IN',
    kind: args.kind,
    payload: args.payload,
    waMessageId: args.waMessageId,
  });
}
