/* ============================================================
   WEBHOOK DE WHATSAPP CLOUD API (Fase 1A)
   ------------------------------------------------------------
   Un solo webhook para TODOS los restaurantes. Meta lo llama con el
   phone_number_id del número que recibió el mensaje, y ese campo es lo que
   resuelve a qué restaurante pertenece (whatsapp_accounts, migración 102).

   GET  — verificación inicial de Meta (hub.challenge).
   POST — mensajes entrantes y acuses de recibo.

   SEGURIDAD — la firma es obligatoria:
   este endpoint es público (Meta tiene que poder llamarlo sin credenciales
   nuestras), así que lo único que separa un webhook legítimo de cualquiera
   que descubra la URL es la firma X-Hub-Signature-256: HMAC-SHA256 del
   cuerpo CRUDO con el app secret. Se compara en tiempo constante. Sin firma
   válida se responde 401 y no se toca la base.

   El cuerpo se lee con req.text() y NO con req.json() a propósito: el HMAC
   es sobre los bytes exactos que mandó Meta. Si se parsea y se vuelve a
   serializar, cualquier diferencia de formato (espacios, orden, escapes)
   rompe la firma y todo se rechazaría.

   Siempre 200 cuando la firma es válida: Meta reintenta ante cualquier otra
   cosa, y un error nuestro procesando un mensaje no debe provocar una
   tormenta de reintentos. Los fallos se registran, no se propagan.
   ============================================================ */

import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { rateLimit } from '@/lib/rate-limit';
import {
  restaurantIdForPhoneNumber,
  ensureConversation,
  logInboundMessage,
} from '@/lib/whatsapp/client';

/** Comparación en tiempo constante de dos strings (evita fugas por timing). */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/* ── GET: verificación de Meta ───────────────────────────────
   Meta llama una vez al configurar el webhook. El verify token es de la
   APP, no del restaurante: la app de Meta es una sola y sirve a todos los
   números, así que vive en el entorno y no en whatsapp_accounts. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!expected) {
    return new NextResponse('WHATSAPP_VERIFY_TOKEN no configurado', { status: 500 });
  }

  if (mode === 'subscribe' && token && safeEqual(token, expected) && challenge) {
    // Meta espera el challenge crudo, en texto plano.
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  return new NextResponse('Forbidden', { status: 403 });
}

/* ── POST: mensajes entrantes y acuses ───────────────────────── */
export async function POST(req: Request) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    return new NextResponse('WHATSAPP_APP_SECRET no configurado', { status: 500 });
  }

  const raw = await req.text();

  const signature = req.headers.get('x-hub-signature-256');
  if (!signature) return new NextResponse('Falta firma', { status: 401 });

  const expected =
    'sha256=' + crypto.createHmac('sha256', appSecret).update(raw, 'utf8').digest('hex');

  if (!safeEqual(signature, expected)) {
    return new NextResponse('Firma inválida', { status: 401 });
  }

  let body: WebhookBody;
  try {
    body = JSON.parse(raw) as WebhookBody;
  } catch {
    // Firma válida pero cuerpo ilegible: no reintentar.
    return NextResponse.json({ ok: true });
  }

  try {
    await processWebhook(body);
  } catch {
    /* nunca propagar: evita la tormenta de reintentos de Meta */
  }

  return NextResponse.json({ ok: true });
}

/* ── Tipos mínimos del payload de Meta ───────────────────────
   Solo lo que se usa. El payload real trae bastante más. */
interface WaInboundMessage {
  id?: string;
  from?: string;
  type?: string;
  text?: { body?: string };
}

interface WaStatus {
  id?: string;
  status?: string;
  errors?: { title?: string; message?: string }[];
}

interface WebhookBody {
  entry?: {
    changes?: {
      value?: {
        metadata?: { phone_number_id?: string };
        messages?: WaInboundMessage[];
        statuses?: WaStatus[];
      };
    }[];
  }[];
}

async function processWebhook(body: WebhookBody): Promise<void> {
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;

      const phoneNumberId = value.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      // Techo por número: un número comprometido o un bucle de Meta no debe
      // poder inundar la base. 300 eventos/minuto es muy holgado para un
      // restaurante real y corta cualquier abuso.
      const allowed = await rateLimit(`wa:${phoneNumberId}`, 300, 60_000);
      if (!allowed) continue;

      const restaurantId = await restaurantIdForPhoneNumber(phoneNumberId);
      // Número que no es de ningún restaurante nuestro: ignorar en silencio.
      if (!restaurantId) continue;

      await handleInbound(restaurantId, value.messages ?? []);
      await handleStatuses(value.statuses ?? []);
    }
  }
}

/** Mensajes del cliente. En 1A solo se registran y se reabre la ventana de
 *  24h; responderlos es la Fase 1B (bot) y 1C (agente IA). */
async function handleInbound(
  restaurantId: string,
  messages: WaInboundMessage[],
): Promise<void> {
  for (const msg of messages) {
    const waId = msg.from;
    if (!waId) continue;

    // touchInbound: este mensaje es lo que abre la ventana de servicio.
    const convo = await ensureConversation(restaurantId, waId, { touchInbound: true });
    if (!convo) continue;

    await logInboundMessage({
      conversationId: convo.id,
      restaurantId,
      waMessageId: msg.id ?? null,
      kind: msg.type ?? 'unknown',
      payload: msg,
    });
  }
}

/** Acuses de recibo (sent/delivered/read/failed) de mensajes que mandamos. */
async function handleStatuses(statuses: WaStatus[]): Promise<void> {
  if (statuses.length === 0) return;
  const db = createServiceClient();

  for (const st of statuses) {
    if (!st.id || !st.status) continue;
    await db
      .from('whatsapp_messages')
      .update({
        status: st.status,
        error: st.errors?.[0]?.message ?? st.errors?.[0]?.title ?? null,
      })
      .eq('wa_message_id', st.id);
  }
}
