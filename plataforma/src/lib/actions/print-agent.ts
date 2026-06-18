'use server';

// Server actions del panel para configurar el agente de impresión propio.
// Toda la lógica de tokens/encolado vive en @/lib/print-agent.

import { getAdminContext } from '@/lib/db/admin';
import { createServiceClient } from '@/lib/supabase/service';
import { generateToken, hashToken, enqueuePrintJob } from '@/lib/print-agent';
import { buildTestKitchenEscPos, buildTestReceiptEscPos } from '@/lib/escpos';

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
}

const EMPTY: PrintAgentConfig = {
  exists: false,
  name: null,
  lastSeenAt: null,
  reportedPrinters: [],
  kitchenTarget: null,
  receiptTarget: null,
  version: null,
};

/** Lee la configuración del agente del restaurante en sesión. */
export async function getPrintAgentConfig(): Promise<PrintAgentConfig | { error: string }> {
  const ctx = await getAdminContext();
  if (!ctx?.restaurant) return { error: 'No autorizado.' };

  const db = createServiceClient();
  const { data } = await db
    .from('print_agents')
    .select('name, last_seen_at, reported_printers, kitchen_target, receipt_target, agent_version')
    .eq('restaurant_id', ctx.restaurant.id)
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
  };
}

/** Genera (o rota) el token del agente. El token en claro se devuelve UNA vez. */
export async function regenerateAgentToken(): Promise<{ token?: string; error?: string }> {
  const ctx = await getAdminContext();
  if (!ctx?.restaurant) return { error: 'No autorizado.' };
  if (ctx.profile.role === 'RESTAURANT_STAFF') {
    return { error: 'Solo el dueño puede configurar el agente.' };
  }

  const token = generateToken();
  const db = createServiceClient();
  // upsert deja intactas las columnas no provistas (destinos e impresoras).
  const { error } = await db.from('print_agents').upsert(
    { restaurant_id: ctx.restaurant.id, name: 'Agente principal', token_hash: hashToken(token) },
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
  if (!ctx?.restaurant) return { error: 'No autorizado.' };
  if (ctx.profile.role === 'RESTAURANT_STAFF') {
    return { error: 'Solo el dueño puede configurar el agente.' };
  }

  const db = createServiceClient();
  const { error } = await db
    .from('print_agents')
    .update({
      kitchen_target: input.kitchen?.trim() || null,
      receipt_target: input.receipt?.trim() || null,
    })
    .eq('restaurant_id', ctx.restaurant.id);

  if (error) return { error: error.message };
  return {};
}

/** Encola un ticket de prueba (cocina o caja). target opcional fuerza destino. */
export async function sendTestPrint(input: {
  role: 'kitchen' | 'receipt';
  target?: string | null;
}): Promise<{ jobId?: string; error?: string }> {
  const ctx = await getAdminContext();
  if (!ctx?.restaurant) return { error: 'No autorizado.' };

  const role = input.role === 'receipt' ? 'receipt' : 'kitchen';
  const bytes = role === 'kitchen' ? buildTestKitchenEscPos() : buildTestReceiptEscPos();
  const res = await enqueuePrintJob({
    restaurantId: ctx.restaurant.id,
    role,
    bytes,
    targetOverride: input.target ?? null,
  });

  if ('error' in res) return { error: res.error };
  return { jobId: res.id };
}
