'use server';

// Server actions del panel para configurar el agente de impresión propio.
// Toda la lógica de tokens/encolado vive en @/lib/print-agent.

import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { createServiceClient } from '@/lib/supabase/service';
import { generateToken, hashToken, enqueuePrintJob } from '@/lib/print-agent';
import { buildTestKitchenEscPos, buildTestReceiptEscPos } from '@/lib/escpos';

/**
 * Devuelve el restaurant_id efectivo para las acciones del panel.
 * - OWNER/STAFF: usa profile.restaurant_id del contexto.
 * - SUPER_ADMIN: resuelve desde el header x-tenant-slug que pone el proxy.
 */
async function resolveRestaurantId(
  ctx: NonNullable<Awaited<ReturnType<typeof getAdminContext>>>,
): Promise<string | null> {
  if (ctx.restaurant) return ctx.restaurant.id as string;
  if (ctx.profile.role === 'SUPER_ADMIN') {
    const h = await headers();
    const slug = h.get('x-tenant-slug');
    if (!slug) return null;
    const tenantData = await getRestaurantBySlug(slug);
    return (tenantData?.restaurant.id as string) ?? null;
  }
  return null;
}

export interface ReportedPrinter {
  name: string;
  target: string;
  driver?: string;
  port?: string;
  shared?: boolean;
  status?: string;
}

export interface PrintAgentConfig {
  exists: boolean;
  name: string | null;
  lastSeenAt: string | null;
  reportedPrinters: ReportedPrinter[];
  kitchenTarget: string | null;
  receiptTarget: string | null;
  version: string | null;
  /** Versión de Leogin Desktop (el shell), si el admin lo usó en esta PC — ver /api/agent/shell-heartbeat. */
  shellVersion: string | null;
  /** Auto-pausa de pedidos en línea cuando el agente pierde conexión (mig. 069). */
  autoPauseEnabled: boolean;
}

const EMPTY: PrintAgentConfig = {
  exists: false,
  name: null,
  lastSeenAt: null,
  reportedPrinters: [],
  kitchenTarget: null,
  receiptTarget: null,
  version: null,
  shellVersion: null,
  autoPauseEnabled: false,
};

/** Lee la configuración del agente del restaurante en sesión. */
export async function getPrintAgentConfig(): Promise<PrintAgentConfig | { error: string }> {
  const ctx = await getAdminContext();
  if (!ctx) return { error: 'No autorizado.' };
  const restaurantId = await resolveRestaurantId(ctx);
  if (!restaurantId) return { error: 'No autorizado.' };

  const db = createServiceClient();
  const { data } = await db
    .from('print_agents')
    .select('name, last_seen_at, reported_printers, kitchen_target, receipt_target, agent_version, shell_version, auto_pause_enabled')
    .eq('restaurant_id', restaurantId)
    .single();

  if (!data) return EMPTY;
  return {
    exists: true,
    name: (data.name as string) ?? null,
    lastSeenAt: (data.last_seen_at as string) ?? null,
    reportedPrinters: Array.isArray(data.reported_printers)
      ? (data.reported_printers as ReportedPrinter[])
      : [],
    kitchenTarget: (data.kitchen_target as string) ?? null,
    receiptTarget: (data.receipt_target as string) ?? null,
    version: (data.agent_version as string) ?? null,
    shellVersion: (data.shell_version as string) ?? null,
    autoPauseEnabled: (data.auto_pause_enabled as boolean) === true,
  };
}

/**
 * Activa/desactiva la auto-pausa de pedidos EN LÍNEA cuando el agente pierde
 * conexión (mig. 069). Opcional por restaurante; solo el dueño la cambia.
 */
export async function setAutoPauseOffline(enabled: boolean): Promise<{ error?: string }> {
  const ctx = await getAdminContext();
  if (!ctx) return { error: 'No autorizado.' };
  if (ctx.profile.role === 'RESTAURANT_STAFF') {
    return { error: 'Solo el dueño puede configurar el agente.' };
  }
  const restaurantId = await resolveRestaurantId(ctx);
  if (!restaurantId) return { error: 'No autorizado.' };

  const db = createServiceClient();
  const { data, error } = await db
    .from('print_agents')
    .update({ auto_pause_enabled: enabled === true })
    .eq('restaurant_id', restaurantId)
    .select('id');

  if (error) {
    return { error: 'Esta opción requiere aplicar la migración 069 en la base de datos.' };
  }
  if (!data || data.length === 0) {
    return { error: 'Primero vincula el Agente Leogin (genera el token e instálalo).' };
  }
  return {};
}

/** Genera (o rota) el token del agente. El token en claro se devuelve UNA vez. */
export async function regenerateAgentToken(): Promise<{ token?: string; error?: string }> {
  const ctx = await getAdminContext();
  if (!ctx) return { error: 'No autorizado.' };
  if (ctx.profile.role === 'RESTAURANT_STAFF') {
    return { error: 'Solo el dueño puede configurar el agente.' };
  }
  const restaurantId = await resolveRestaurantId(ctx);
  if (!restaurantId) return { error: 'No autorizado.' };

  const token = generateToken();
  const db = createServiceClient();
  // upsert deja intactas las columnas no provistas (destinos e impresoras).
  const { error } = await db.from('print_agents').upsert(
    { restaurant_id: restaurantId, name: 'Agente principal', token_hash: hashToken(token) },
    { onConflict: 'restaurant_id' },
  );
  if (error) return { error: error.message };
  return { token };
}

/** Asigna los destinos de impresión por rol. */
export async function setPrintTargets(input: {
  kitchen: string | null;
  receipt: string | null;
}): Promise<{ error?: string }> {
  const ctx = await getAdminContext();
  if (!ctx) return { error: 'No autorizado.' };
  if (ctx.profile.role === 'RESTAURANT_STAFF') {
    return { error: 'Solo el dueño puede configurar el agente.' };
  }
  const restaurantId = await resolveRestaurantId(ctx);
  if (!restaurantId) return { error: 'No autorizado.' };

  const db = createServiceClient();
  const { error } = await db
    .from('print_agents')
    .update({
      kitchen_target: input.kitchen?.trim() || null,
      receipt_target: input.receipt?.trim() || null,
    })
    .eq('restaurant_id', restaurantId);

  if (error) return { error: error.message };
  return {};
}

/** Encola un ticket de prueba (cocina o caja). target opcional fuerza destino. */
export async function sendTestPrint(input: {
  role: 'kitchen' | 'receipt';
  target?: string | null;
}): Promise<{ jobId?: string; error?: string }> {
  const ctx = await getAdminContext();
  if (!ctx) return { error: 'No autorizado.' };
  const restaurantId = await resolveRestaurantId(ctx);
  if (!restaurantId) return { error: 'No autorizado.' };

  const role = input.role === 'receipt' ? 'receipt' : 'kitchen';
  const bytes = role === 'kitchen' ? buildTestKitchenEscPos() : buildTestReceiptEscPos();
  const res = await enqueuePrintJob({
    restaurantId,
    role,
    bytes,
    targetOverride: input.target ?? null,
  });

  if ('error' in res) return { error: res.error };
  return { jobId: res.id };
}
