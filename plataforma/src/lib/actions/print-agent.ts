'use server';

// Server actions del panel para configurar el agente de impresión propio.
// Toda la lógica de tokens/encolado vive en @/lib/print-agent.

import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { createServiceClient } from '@/lib/supabase/service';
import { generateToken, hashToken, enqueuePrintJob, ticketFormatFor } from '@/lib/print-agent';
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
  /** Interruptor de "PC principal" (mig. 094). false = apagada a propósito. */
  isActive: boolean;
  /** Nombre de la PC principal, si su agente lo reportó (mig. 094). */
  deviceName: string | null;
  disabledAt: string | null;
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
  isActive: false,
  deviceName: null,
  disabledAt: null,
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
    .select('name, last_seen_at, reported_printers, kitchen_target, receipt_target, agent_version, shell_version, auto_pause_enabled, is_active, device_name, disabled_at, hub_hostname')
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
    // Agentes anteriores a la 094 nunca escriben is_active: la columna trae
    // default true, así que una instalación vieja sigue contando como activa.
    isActive: (data.is_active as boolean) !== false,
    deviceName: (data.device_name as string) ?? null,
    disabledAt: (data.disabled_at as string) ?? null,
  };
}

/**
 * El interruptor de "esta PC es la principal del local".
 *
 * Apagar NO borra nada: revoca el token (el agente deja de autenticar y se
 * detiene solo, esté donde esté esa PC) pero conserva las impresoras
 * asignadas, para que volver a encender no obligue a reconfigurar. Encender
 * devuelve un token nuevo: quien lo llama lo usa para instalar el servicio en
 * la PC donde esté parado.
 */
export async function setLocalServerActive(
  enabled: boolean,
): Promise<{ token?: string; error?: string }> {
  const ctx = await getAdminContext();
  if (!ctx) return { error: 'No autorizado.' };
  if (ctx.profile.role === 'RESTAURANT_STAFF') {
    return { error: 'Solo el dueño puede cambiar la PC principal del local.' };
  }
  const restaurantId = await resolveRestaurantId(ctx);
  if (!restaurantId) return { error: 'No autorizado.' };

  const db = createServiceClient();

  if (!enabled) {
    const { data, error } = await db
      .from('print_agents')
      .update({
        is_active: false,
        disabled_at: new Date().toISOString(),
        // Token imposible de presentar: corta al agente aunque siga corriendo.
        token_hash: hashToken(generateToken()),
      })
      .eq('restaurant_id', restaurantId)
      .select('id');
    if (error) return { error: 'Esta opción requiere aplicar la migración 094 en la base de datos.' };
    if (!data || data.length === 0) return { error: 'Este restaurante no tiene una PC principal configurada.' };
    return {};
  }

  const token = generateToken();
  const { error } = await db.from('print_agents').upsert(
    {
      restaurant_id: restaurantId,
      name: 'Agente principal',
      token_hash: hashToken(token),
      is_active: true,
      disabled_at: null,
      // La PC que se enciende puede ser otra: lo que reporte el nuevo agente
      // manda, y hasta entonces es mejor no mostrar el nombre de la anterior.
      device_name: null,
      last_seen_at: null,
    },
    { onConflict: 'restaurant_id' },
  );
  if (error) return { error: error.message };
  return { token };
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
  // Con la zona horaria del restaurante: si el ticket de prueba sale con la
  // hora equivocada, el dueño lo ve ANTES de que el error llegue a un pedido.
  const format = await ticketFormatFor(restaurantId);
  const bytes = role === 'kitchen' ? buildTestKitchenEscPos(format) : buildTestReceiptEscPos(format);
  const res = await enqueuePrintJob({
    restaurantId,
    role,
    bytes,
    targetOverride: input.target ?? null,
  });

  if ('error' in res) return { error: res.error };
  return { jobId: res.id };
}
