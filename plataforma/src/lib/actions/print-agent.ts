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
  /** Dispositivo desde el que se encendió (mig. 110). null = no se sabe. */
  activatedDeviceId: string | null;
  /** Nombre legible de ese dispositivo mientras el agente no reporte el suyo. */
  activatedDeviceLabel: string | null;
  activatedAt: string | null;
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
  activatedDeviceId: null,
  activatedDeviceLabel: null,
  activatedAt: null,
};

/** Lee la configuración del agente del restaurante en sesión. */
export async function getPrintAgentConfig(): Promise<PrintAgentConfig | { error: string }> {
  const ctx = await getAdminContext();
  if (!ctx) return { error: 'No autorizado.' };
  const restaurantId = await resolveRestaurantId(ctx);
  if (!restaurantId) return { error: 'No autorizado.' };

  const db = createServiceClient();
  // `select('*')` y no la lista de columnas: así las columnas de la migración
  // 110 (activated_device_*) llegan si están y simplemente no llegan si la
  // migración todavía no se aplicó, en vez de tumbar la consulta entera.
  const { data } = await db
    .from('print_agents')
    .select('*')
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
    activatedDeviceId: (data.activated_device_id as string) ?? null,
    activatedDeviceLabel: (data.activated_device_label as string) ?? null,
    activatedAt: (data.activated_at as string) ?? null,
  };
}

/** Quién enciende la PC principal: id anónimo del navegador + etiqueta legible
    (ver lib/device-id.ts). Opcional: sin esto todo sigue funcionando, solo que
    el panel no puede distinguir "esta computadora" de "otra". */
export interface ActivatingDevice {
  id: string;
  label: string;
}

/**
 * El interruptor de "esta PC es la principal del local".
 *
 * Apagar NO borra nada: revoca el token (el agente deja de autenticar y se
 * detiene solo, esté donde esté esa PC) pero conserva las impresoras
 * asignadas, para que volver a encender no obligue a reconfigurar. Encender
 * devuelve un token nuevo: quien lo llama lo usa para instalar el servicio en
 * la PC donde esté parado.
 *
 * Encender desde OTRO aparato reemplaza a la anterior, no convive con ella:
 * la fila de print_agents es única por restaurante y el token nuevo deja
 * inservible al anterior. Por eso también se sella qué dispositivo lo hizo
 * (mig. 110) — sin ese sello el panel no puede decir cuál de las dos es.
 */
export async function setLocalServerActive(
  enabled: boolean,
  device?: ActivatingDevice,
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
  const row = {
    restaurant_id: restaurantId,
    name: 'Agente principal',
    token_hash: hashToken(token),
    is_active: true,
    disabled_at: null,
    // La PC que se enciende puede ser otra: lo que reporte el nuevo agente
    // manda, y hasta entonces es mejor no mostrar el nombre de la anterior.
    device_name: null,
    last_seen_at: null,
  };
  const stamp = {
    activated_device_id: device?.id ?? null,
    activated_device_label: device?.label ?? null,
    activated_at: new Date().toISOString(),
  };

  const { error } = await db.from('print_agents').upsert({ ...row, ...stamp }, { onConflict: 'restaurant_id' });
  if (error) {
    // Sin la migración 110 estas tres columnas no existen. Encender es lo
    // importante; el sello del dispositivo es información de pantalla y puede
    // faltar (el panel lo trata como "no se sabe cuál es").
    const retry = await db.from('print_agents').upsert(row, { onConflict: 'restaurant_id' });
    if (retry.error) return { error: retry.error.message };
  }
  return { token };
}

/**
 * "Sí, la PC principal es esta computadora" — para las instalaciones
 * anteriores a la migración 110, que no guardaron desde dónde se encendieron.
 *
 * No cambia ningún permiso ni toca el token: solo pone el nombre a lo que ya
 * estaba encendido, para que el panel deje de decir "no sabemos cuál es". Por
 * eso mismo NO sirve para robar la PC principal de otro aparato: solo se deja
 * sellar cuando el sello está vacío.
 */
export async function claimMainPcDevice(
  device: ActivatingDevice,
): Promise<{ error?: string }> {
  const ctx = await getAdminContext();
  if (!ctx) return { error: 'No autorizado.' };
  if (ctx.profile.role === 'RESTAURANT_STAFF') {
    return { error: 'Solo el dueño puede cambiar la PC principal del local.' };
  }
  const restaurantId = await resolveRestaurantId(ctx);
  if (!restaurantId) return { error: 'No autorizado.' };
  if (!device?.id) return { error: 'Falta el identificador del dispositivo.' };

  const db = createServiceClient();
  const { data, error } = await db
    .from('print_agents')
    .update({ activated_device_id: device.id, activated_device_label: device.label })
    .eq('restaurant_id', restaurantId)
    .is('activated_device_id', null)
    .select('id');

  if (error) return { error: 'Esta opción requiere aplicar la migración 110 en la base de datos.' };
  if (!data || data.length === 0) {
    return { error: 'Ya hay otro dispositivo registrado como la PC principal. Para cambiarla, enciéndela desde la computadora del local.' };
  }
  return {};
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
