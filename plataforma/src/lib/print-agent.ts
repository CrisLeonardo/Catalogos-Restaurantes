// Lógica de servidor del agente de impresión propio (reemplazo de QZ Tray).
// Maneja tokens del agente y el encolado de trabajos en la tabla print_jobs.
// Ver migración 033 y el proyecto agente-impresion/ en la raíz.

import crypto from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { buildKitchenEscPos, buildReceiptEscPos, type EscPosCurrency } from '@/lib/escpos';
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

/** Valida el header Authorization: Bearer <token> contra print_agents. */
export async function authenticateAgent(req: Request): Promise<AgentIdentity | null> {
  const header = req.headers.get('authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1].trim();
  if (!token) return null;

  const db = createServiceClient();
  const { data } = await db
    .from('print_agents')
    .select('id, restaurant_id')
    .eq('token_hash', hashToken(token))
    .single();

  if (!data) return null;
  return { agentId: data.id as string, restaurantId: data.restaurant_id as string };
}

/**
 * URL LAN del hub local del restaurante (Fase 2 offline), si tiene un agente
 * vinculado y ya reportó su IP en el heartbeat. El checkout la usa como
 * fallback cuando la nube no responde (ver lib/hub-fallback.ts). No es
 * información sensible (una IP de red local), no requiere autenticación.
 */
export async function getAgentHubUrl(restaurantId: string): Promise<string | null> {
  const db = createServiceClient();
  const { data } = await db
    .from('print_agents')
    .select('hub_url')
    .eq('restaurant_id', restaurantId)
    .single();
  return (data?.hub_url as string | null) ?? null;
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
      .select('kitchen_target, receipt_target')
      .eq('restaurant_id', opts.restaurantId)
      .single();
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

async function restaurantName(
  db: ReturnType<typeof createServiceClient>,
  restaurantId: string,
): Promise<string> {
  const { data } = await db.from('restaurants').select('name').eq('id', restaurantId).single();
  return (data?.name as string) ?? 'Restaurante';
}

/**
 * Encola la comanda de cocina de un pedido al agente del restaurante.
 * No-op silencioso si el restaurante no tiene agente con destino de cocina
 * configurado (así convive con la impresión por QZ/USB del navegador).
 * Best-effort: nunca debe romper el cambio de estado del pedido.
 */
export async function enqueueKitchenForOrder(restaurantId: string, orderId: string): Promise<void> {
  const db = createServiceClient();

  const { data: agent } = await db
    .from('print_agents')
    .select('kitchen_target')
    .eq('restaurant_id', restaurantId)
    .single();
  if (!agent?.kitchen_target) return; // sin agente/destino → no imprime por aquí

  const order = await loadOrderWithItems(db, restaurantId, orderId);
  if (!order) return;

  const bytes = buildKitchenEscPos(order, await restaurantName(db, restaurantId));
  await enqueuePrintJob({
    restaurantId,
    role: 'kitchen',
    bytes,
    orderId,
    targetOverride: agent.kitchen_target as string,
  });
}

/**
 * Encola el recibo de caja de un pedido al agente del restaurante.
 * La moneda se resuelve del tema del restaurante (server-side). No-op si no
 * hay agente con destino de caja configurado.
 */
export async function enqueueReceiptForOrder(restaurantId: string, orderId: string): Promise<void> {
  const db = createServiceClient();

  const { data: agent } = await db
    .from('print_agents')
    .select('receipt_target')
    .eq('restaurant_id', restaurantId)
    .single();
  if (!agent?.receipt_target) return;

  const order = await loadOrderWithItems(db, restaurantId, orderId);
  if (!order) return;

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

  const bytes = buildReceiptEscPos(order, currency, await restaurantName(db, restaurantId));
  await enqueuePrintJob({
    restaurantId,
    role: 'receipt',
    bytes,
    orderId,
    targetOverride: agent.receipt_target as string,
  });
}
