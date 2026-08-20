// Lógica de servidor del agente de impresión propio (reemplazo de QZ Tray).
// Maneja tokens del agente y el encolado de trabajos en la tabla print_jobs.
// Ver migración 033 y el proyecto agente-impresion/ en la raíz.

import crypto from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { getActiveHubCert, HUB_TLS_PORT } from '@/lib/hub-tls';
import {
  buildKitchenEscPos, buildReceiptEscPos, buildSplitBillEscPos,
  DEFAULT_TICKET_FORMAT,
  type EscPosCurrency, type SplitTicketLine, type TicketFormat, type FelTicket,
} from '@/lib/escpos';
import { getFelDocumentForOrder } from '@/lib/db/fel';
import { urlVerificacion } from '@/lib/fel/verificacion';
import { resolveTheme, type ThemeRow } from '@/lib/theme/resolve';
import type { OrderWithItems } from '@/lib/db/orders';

export type PrintJobRole = 'kitchen' | 'receipt';

/** Token del agente en claro (se muestra una sola vez al crearlo). */
export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/** sha256 hex — lo que se guarda en la base (nunca el token en claro). */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export interface AgentIdentity {
  agentId: string;
  restaurantId: string;
}

/**
 * Resultado detallado de autenticar al agente.
 *
 * La diferencia entre 'revoked' y 'unavailable' no es cosmética: el agente
 * APAGA su hub local cuando la nube le dice que ya no es la PC principal (ver
 * agente-impresion/src/agent.ts). Si un fallo de base de datos se contara como
 * "token inválido", una caída de Supabase apagaría los hubs de todos los
 * restaurantes a la vez — justo cuando más falta hacen.
 */
export type AgentAuthResult =
  | { status: 'ok'; identity: AgentIdentity }
  /** El token no existe, o la PC principal está apagada / la reemplazó otra. */
  | { status: 'revoked' }
  /** No se pudo comprobar (base caída, red): no afirma nada sobre el token. */
  | { status: 'unavailable' };

export async function authenticateAgentResult(req: Request): Promise<AgentAuthResult> {
  const header = req.headers.get('authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return { status: 'revoked' };
  const token = match[1].trim();
  if (!token) return { status: 'revoked' };

  const db = createServiceClient();
  const { data, error } = await db
    .from('print_agents')
    .select('id, restaurant_id')
    .eq('token_hash', hashToken(token))
    // Interruptor de "PC principal" (migración 094): apagada la PC en el
    // panel, su agente deja de autenticar y se detiene solo — así apagar
    // funciona desde el celular del dueño, sin ir a desinstalar nada.
    .eq('is_active', true)
    .maybeSingle();

  if (error) return { status: 'unavailable' };
  if (!data) return { status: 'revoked' };
  return {
    status: 'ok',
    identity: { agentId: data.id as string, restaurantId: data.restaurant_id as string },
  };
}

/** Valida el header Authorization: Bearer <token> contra print_agents. */
export async function authenticateAgent(req: Request): Promise<AgentIdentity | null> {
  const res = await authenticateAgentResult(req);
  return res.status === 'ok' ? res.identity : null;
}

export interface AgentHubInfo {
  hubUrl: string | null;
  hubToken: string | null;
}

/**
 * URL del hub local del restaurante (Fase 2 offline) + el token que ese
 * hub exige en POST /orders (migración 063), si tiene un agente vinculado y
 * ya reportó ambos en el heartbeat. Checkout y el panel de mesero lo usan
 * como fallback cuando la nube no responde (ver lib/hub-fallback.ts).
 *
 * Con el HTTPS del hub activo (migración 064) se prefiere
 * `https://<hostname>:47443` — la única forma en que una página HTTPS de
 * producción puede hablarle al hub (mixed content). El hostname resuelve a
 * la IP LAN vía DNS público (patrón Plex, ARQUITECTURA_OFFLINE.md §8.1).
 * Sin certificado vigente se cae al `http://IP:47100` de siempre (útil en
 * dev local; en prod ese camino lo bloquea el navegador y el pedido termina
 * en la cola del dispositivo, como hasta ahora).
 */
export async function getAgentHubInfo(restaurantId: string): Promise<AgentHubInfo> {
  const db = createServiceClient();
  const { data } = await db
    .from('print_agents')
    .select('hub_url, hub_order_token, hub_hostname')
    .eq('restaurant_id', restaurantId)
    .single();

  let hubUrl = (data?.hub_url as string | null) ?? null;
  const hostname = (data?.hub_hostname as string | null) ?? null;
  if (hostname) {
    const cert = await getActiveHubCert(db).catch(() => null);
    if (cert) hubUrl = `https://${hostname}:${HUB_TLS_PORT}`;
  }

  return {
    hubUrl,
    hubToken: (data?.hub_order_token as string | null) ?? null,
  };
}

export type EnqueueResult = { id: string } | { error: string };

/**
 * Encola un trabajo de impresión. Resuelve el destino:
 *   - targetOverride si se provee (útil para pruebas, ej. "preview:")
 *   - si no, el destino asignado al rol en print_agents (kitchen/receipt_target)
 */
export async function enqueuePrintJob(opts: {
  restaurantId: string;
  role: PrintJobRole;
  bytes: Uint8Array;
  orderId?: string | null;
  targetOverride?: string | null;
}): Promise<EnqueueResult> {
  const db = createServiceClient();

  let target = opts.targetOverride?.trim() || null;
  if (!target) {
    const { data: agent } = await db
      .from('print_agents')
      .select('kitchen_target, receipt_target, is_active')
      .eq('restaurant_id', opts.restaurantId)
      .single();
    // PC principal apagada (migración 094): encolar sería mentirle a quien
    // pulsó "Imprimir" — nadie va a recoger el trabajo hasta que la enciendan.
    if (agent && (agent.is_active as boolean | null) === false) {
      return { error: 'La PC principal del local está apagada: enciéndela en «Mi PC del local» para poder imprimir.' };
    }
    target = (opts.role === 'kitchen' ? agent?.kitchen_target : agent?.receipt_target) ?? null;
  }
  if (!target) {
    return { error: `No hay impresora asignada para "${opts.role}" en este restaurante.` };
  }

  const payload_b64 = Buffer.from(opts.bytes).toString('base64');
  const { data, error } = await db
    .from('print_jobs')
    .insert({
      restaurant_id: opts.restaurantId,
      role: opts.role,
      target,
      payload_b64,
      status: 'pending',
      order_id: opts.orderId ?? null,
    })
    .select('id')
    .single();

  if (error || !data) return { error: error?.message ?? 'No se pudo encolar el trabajo.' };
  return { id: data.id as string };
}

/** Carga un pedido con sus ítems y el nombre del mesero. */
async function loadOrderWithItems(
  db: ReturnType<typeof createServiceClient>,
  restaurantId: string,
  orderId: string,
): Promise<OrderWithItems | null> {
  const { data: row } = await db
    .from('orders')
    .select('*, items:order_items(*), waiter:profiles!orders_waiter_id_fkey(full_name)')
    .eq('id', orderId)
    .eq('restaurant_id', restaurantId)
    .single();
  if (!row) return null;
  const { waiter, ...order } = row as Record<string, unknown> & { waiter?: { full_name: string | null } | null };
  return { ...order, waiter_name: waiter?.full_name ?? null } as OrderWithItems;
}

/** Nombre + formato de fecha/hora del ticket, en UNA consulta.
 *  La zona horaria es imprescindible: este código corre en el servidor (UTC) y
 *  sin ella el ticket sale con la hora equivocada (ver escpos.ts). */
async function ticketHeader(
  db: ReturnType<typeof createServiceClient>,
  restaurantId: string,
): Promise<{ name: string; format: TicketFormat }> {
  const { data } = await db
    .from('restaurants')
    .select('name, timezone')
    .eq('id', restaurantId)
    .single();
  const tz = (data?.timezone as string | null)?.trim();
  return {
    name: (data?.name as string) ?? 'Restaurante',
    format: {
      timezone: tz || DEFAULT_TICKET_FORMAT.timezone,
      locale: DEFAULT_TICKET_FORMAT.locale,
    },
  };
}

/**
 * ¿Ya se encoló (y por tanto se imprimió, o está por imprimirse) la comanda de
 * cocina de este pedido?
 *
 * Es el candado central contra la DOBLE COMANDA: un mismo pedido pasaba por
 * aquí hasta tres veces —al crearlo el mesero, al confirmarlo en el panel y al
 * pulsar "Comenzar" en la pantalla de cocina— y la cocina recibía dos o tres
 * papeles del mismo plato. Los trabajos fallidos NO cuentan: si la impresora
 * se quedó sin papel, ese ticket nunca salió y hay que reintentarlo.
 */
async function kitchenTicketAlreadyQueued(
  db: ReturnType<typeof createServiceClient>,
  restaurantId: string,
  orderId: string,
): Promise<boolean> {
  const { data } = await db
    .from('print_jobs')
    .select('id')
    .eq('restaurant_id', restaurantId)
    .eq('order_id', orderId)
    .eq('role', 'kitchen')
    .in('status', ['pending', 'printing', 'done'])
    .limit(1);
  return (data?.length ?? 0) > 0;
}

export type KitchenEnqueueOutcome =
  | { queued: true }
  /** No se encoló, con el motivo — quien lo pidió a mano merece saberlo. */
  | { queued: false; reason: 'already-printed' | 'no-printer' | 'pc-off' | 'not-found' | 'error'; message?: string };

/**
 * Encola la comanda de cocina de un pedido al agente del restaurante.
 * No-op si el restaurante no tiene agente con destino de cocina configurado
 * (así convive con la impresión por USB del navegador) y — salvo `force` —
 * si ese pedido YA tiene su comanda encolada.
 * Best-effort: nunca debe romper el cambio de estado del pedido.
 *
 * @param opts.force  Reimpresión pedida a mano: salta el candado anti-duplicado
 *                    y marca el papel como COPIA para que la cocina no lo
 *                    prepare dos veces.
 */
export async function enqueueKitchenForOrder(
  restaurantId: string,
  orderId: string,
  opts: { force?: boolean } = {},
): Promise<KitchenEnqueueOutcome> {
  const db = createServiceClient();

  const { data: agent } = await db
    .from('print_agents')
    .select('kitchen_target, is_active')
    .eq('restaurant_id', restaurantId)
    .single();
  // Sin agente/destino, o con la PC principal apagada a propósito (mig. 094),
  // no se encola: acumular comandas viejas que nadie va a imprimir es peor
  // que no imprimir.
  if (!agent?.kitchen_target) return { queued: false, reason: 'no-printer' };
  if ((agent.is_active as boolean | null) === false) return { queued: false, reason: 'pc-off' };

  if (!opts.force && await kitchenTicketAlreadyQueued(db, restaurantId, orderId)) {
    return { queued: false, reason: 'already-printed' };
  }

  const order = await loadOrderWithItems(db, restaurantId, orderId);
  if (!order) return { queued: false, reason: 'not-found' };

  const { name, format } = await ticketHeader(db, restaurantId);
  const bytes = buildKitchenEscPos(order, name, { format, reprint: !!opts.force });
  const res = await enqueuePrintJob({
    restaurantId,
    role: 'kitchen',
    bytes,
    orderId,
    targetOverride: agent.kitchen_target as string,
  });
  if ('error' in res) return { queued: false, reason: 'error', message: res.error };
  return { queued: true };
}

/**
 * Encola el recibo de caja de un pedido al agente del restaurante.
 * La moneda se resuelve del tema del restaurante (server-side).
 *
 * A diferencia de la comanda, el recibo SÍ se puede repetir a voluntad (el
 * cliente pide otra copia) — aquí no hay candado anti-duplicado. Lo que sí
 * cambió: devuelve el motivo cuando no se pudo encolar, porque quien pulsó
 * "Imprimir recibo" se quedaba mirando una pantalla que no hacía nada.
 */
export async function enqueueReceiptForOrder(
  restaurantId: string,
  orderId: string,
): Promise<{ queued: true } | { queued: false; reason: 'no-printer' | 'pc-off' | 'not-found' | 'error'; message?: string }> {
  const db = createServiceClient();

  const { data: agent } = await db
    .from('print_agents')
    .select('receipt_target, is_active')
    .eq('restaurant_id', restaurantId)
    .single();
  if (!agent?.receipt_target) return { queued: false, reason: 'no-printer' };
  if ((agent.is_active as boolean | null) === false) return { queued: false, reason: 'pc-off' };

  const order = await loadOrderWithItems(db, restaurantId, orderId);
  if (!order) return { queued: false, reason: 'not-found' };

  const { data: themeRow } = await db
    .from('restaurant_themes')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .single();
  const cfg = resolveTheme((themeRow as ThemeRow) ?? null).config;
  const currency: EscPosCurrency = {
    symbol: cfg.currencySymbol,
    position: cfg.currencyPosition,
    locale: cfg.locale,
  };

  const { name, format } = await ticketHeader(db, restaurantId);
  const fel = await felTicketForOrder(orderId);
  const bytes = buildReceiptEscPos(
    order,
    currency,
    name,
    { ...format, locale: cfg.locale || format.locale },
    fel,
  );
  const res = await enqueuePrintJob({
    restaurantId,
    role: 'receipt',
    bytes,
    orderId,
    targetOverride: agent.receipt_target as string,
  });
  if ('error' in res) return { queued: false, reason: 'error', message: res.error };
  return { queued: true };
}

/** Moneda del restaurante para tickets ESC/POS (misma fuente que el recibo). */
export async function escPosCurrencyFor(restaurantId: string): Promise<EscPosCurrency> {
  const db = createServiceClient();
  const { data: themeRow } = await db
    .from('restaurant_themes')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .single();
  const cfg = resolveTheme((themeRow as ThemeRow) ?? null).config;
  return { symbol: cfg.currencySymbol, position: cfg.currencyPosition, locale: cfg.locale };
}

/** Zona horaria + locale del restaurante para fechar tickets desde el servidor. */
export async function ticketFormatFor(restaurantId: string): Promise<TicketFormat> {
  const db = createServiceClient();
  const { format } = await ticketHeader(db, restaurantId);
  return format;
}

/**
 * Encola el ticket de la parte de un comensal (o de la mesa completa).
 * A diferencia del recibo, aquí SÍ devuelve el error: el mesero pulsó
 * "Imprimir" y tiene que enterarse si no hay impresora de caja asignada.
 */
export async function enqueueSplitBillTicket(input: {
  restaurantId: string;
  tableNumber: number;
  personLabel: string | null;
  positionLabel: string | null;
  lines: SplitTicketLine[];
  items: number;
  extras: number;
  total: number;
  extrasLabel: string;
}): Promise<EnqueueResult> {
  const db = createServiceClient();
  const { name, format } = await ticketHeader(db, input.restaurantId);
  const bytes = buildSplitBillEscPos({
    ...input,
    restaurantName: name,
    currency: await escPosCurrencyFor(input.restaurantId),
    format,
  });
  return enqueuePrintJob({ restaurantId: input.restaurantId, role: 'receipt', bytes });
}

/**
 * Datos del DTE del pedido para imprimirlos en el ticket, si los hay.
 *
 * Best-effort: un fallo aquí imprime el ticket sin bloque fiscal, que es
 * mucho mejor que no imprimir el ticket. La factura sigue existiendo en el
 * panel y el ticket se puede reimprimir.
 */
async function felTicketForOrder(orderId: string): Promise<FelTicket | null> {
  try {
    const doc = await getFelDocumentForOrder(orderId);
    if (!doc) return null;

    const db = createServiceClient();
    const { data: settings } = await db
      .from('fel_settings')
      .select('nit_emisor')
      .eq('restaurant_id', doc.restaurant_id)
      .maybeSingle();

    const autorizacion = doc.numero_autorizacion ?? doc.uuid_sat ?? '';

    return {
      estado: doc.estado,
      esFiscal: Boolean(doc.es_fiscal),
      serie: doc.serie,
      numero: doc.numero,
      numeroAutorizacion: autorizacion || null,
      fechaCertificacion: doc.fecha_certificacion,
      receptorId: doc.receptor_nit,
      receptorNombre: doc.receptor_nombre,
      montoIva: Number(doc.monto_iva ?? 0),
      urlVerificacion: doc.es_fiscal
        ? urlVerificacion({
            numeroAutorizacion: autorizacion,
            nitEmisor: (settings?.nit_emisor as string) ?? '',
            idReceptor: doc.receptor_nit,
            montoTotal: Number(doc.monto_total),
          })
        : null,
    };
  } catch {
    return null;
  }
}
