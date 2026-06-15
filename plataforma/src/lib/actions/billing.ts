'use server';

/* ============================================================
   FACTURACIÓN — Server actions (mig. 028)
   ------------------------------------------------------------
   · Mutaciones (config, generar cobros, marcar pagado): solo
     SUPER_ADMIN.
   · Lectura del propio cobro (getMyBilling): el dueño/staff de
     su restaurante.
   Todo pasa por service role tras validar el rol.
   ============================================================ */

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { revalidatePath } from 'next/cache';
import {
  getBillingConfig,
  getInvoices,
  currentPeriod,
  type BillingConfig,
  type Invoice,
} from '@/lib/db/billing';

const UUID_RE = /^[0-9a-f-]{36}$/i;

export type BillingState = { error: string } | { ok: true; msg?: string } | null;

async function verifySuperAdmin(): Promise<ReturnType<typeof createServiceClient> | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'SUPER_ADMIN') return null;
  return createServiceClient();
}

function num(formData: FormData, key: string): number {
  const n = parseFloat(String(formData.get(key) ?? ''));
  return isNaN(n) ? 0 : n;
}

function revalidateBilling(restaurantId?: string) {
  revalidatePath('/super/cobros');
  revalidatePath('/super/metricas');
  revalidatePath('/admin/suscripcion');
  if (restaurantId) revalidatePath(`/super/restaurantes/${restaurantId}`);
}

/* ── Config de cobro (upsert) ───────────────────────────────── */

export async function saveBillingConfig(
  prevState: BillingState,
  formData: FormData,
): Promise<BillingState> {
  const db = await verifySuperAdmin();
  if (!db) return { error: 'No autorizado.' };

  const restaurantId = String(formData.get('restaurantId') ?? '').trim();
  if (!UUID_RE.test(restaurantId)) return { error: 'Restaurante inválido.' };

  const currency = (String(formData.get('currency') ?? 'GTQ').trim() || 'GTQ').slice(0, 8);
  const billingDay = Math.min(28, Math.max(1, Math.round(num(formData, 'billing_day') || 1)));
  const startedAt = String(formData.get('started_at') ?? '').trim() || null;

  const { error } = await db.from('restaurant_billing').upsert({
    restaurant_id: restaurantId,
    currency,
    setup_fee: Math.max(0, num(formData, 'setup_fee')),
    monthly_fee: Math.max(0, num(formData, 'monthly_fee')),
    billing_day: billingDay,
    active: formData.get('active') === 'on' || formData.get('active') === 'true',
    started_at: startedAt,
    notes: String(formData.get('notes') ?? '').trim() || null,
    updated_at: new Date().toISOString(),
  });

  if (error) return { error: error.message };
  revalidateBilling(restaurantId);
  return { ok: true, msg: 'Configuración de cobro guardada.' };
}

/* ── Generar la mensualidad de un restaurante ───────────────── */

function dueDateFor(period: string, billingDay: number): string {
  const [y, m] = period.split('-').map(Number);
  const day = Math.min(28, Math.max(1, billingDay || 1));
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

async function ensureMonthly(
  db: ReturnType<typeof createServiceClient>,
  cfg: BillingConfig,
  period: string,
): Promise<boolean> {
  if (!cfg.active || cfg.monthly_fee <= 0) return false;
  // Idempotente: el índice único (restaurant_id, period) where MONTHLY evita duplicados.
  const { data: existing } = await db
    .from('invoices')
    .select('id')
    .eq('restaurant_id', cfg.restaurant_id)
    .eq('concept', 'MONTHLY')
    .eq('period', period)
    .maybeSingle();
  if (existing) return false;

  const { error } = await db.from('invoices').insert({
    restaurant_id: cfg.restaurant_id,
    concept: 'MONTHLY',
    description: `Mensualidad ${period.slice(0, 7)}`,
    period,
    amount: cfg.monthly_fee,
    currency: cfg.currency,
    status: 'PENDING',
    due_date: dueDateFor(period, cfg.billing_day),
  });
  return !error;
}

/** Genera las mensualidades del periodo actual para TODOS los activos (idempotente). */
export async function generateMonthlyInvoices(): Promise<BillingState> {
  const db = await verifySuperAdmin();
  if (!db) return { error: 'No autorizado.' };

  const period = currentPeriod();
  const { data: configs } = await db
    .from('restaurant_billing')
    .select('*')
    .eq('active', true);

  let created = 0;
  for (const c of configs ?? []) {
    const cfg: BillingConfig = {
      restaurant_id: c.restaurant_id,
      currency: c.currency ?? 'GTQ',
      setup_fee: Number(c.setup_fee ?? 0),
      monthly_fee: Number(c.monthly_fee ?? 0),
      billing_day: Number(c.billing_day ?? 1),
      active: c.active !== false,
      started_at: c.started_at ?? null,
      notes: c.notes ?? null,
      created_at: c.created_at,
      updated_at: c.updated_at,
    };
    if (await ensureMonthly(db, cfg, period)) created += 1;
  }

  revalidateBilling();
  return { ok: true, msg: created > 0 ? `${created} cobro(s) generado(s) para ${period.slice(0, 7)}.` : 'Todos los cobros del mes ya estaban generados.' };
}

/** Genera la mensualidad SOLO de un restaurante (desde su ficha). */
export async function generateMonthlyForRestaurant(
  prevState: BillingState,
  formData: FormData,
): Promise<BillingState> {
  const db = await verifySuperAdmin();
  if (!db) return { error: 'No autorizado.' };
  const restaurantId = String(formData.get('restaurantId') ?? '').trim();
  if (!UUID_RE.test(restaurantId)) return { error: 'Restaurante inválido.' };

  const cfg = await getBillingConfig(restaurantId);
  if (!cfg) return { error: 'Configura primero la mensualidad.' };
  if (cfg.monthly_fee <= 0) return { error: 'La mensualidad es 0; ajústala antes de generar el cobro.' };

  const period = currentPeriod();
  const ok = await ensureMonthly(db, cfg, period);
  revalidateBilling(restaurantId);
  return { ok: true, msg: ok ? `Cobro de ${period.slice(0, 7)} generado.` : 'La mensualidad de este mes ya estaba generada.' };
}

/* ── Cobro prorrateado por lo que resta del mes ─────────────── */

export async function generateProrate(
  prevState: BillingState,
  formData: FormData,
): Promise<BillingState> {
  const db = await verifySuperAdmin();
  if (!db) return { error: 'No autorizado.' };
  const restaurantId = String(formData.get('restaurantId') ?? '').trim();
  if (!UUID_RE.test(restaurantId)) return { error: 'Restaurante inválido.' };

  const cfg = await getBillingConfig(restaurantId);
  if (!cfg || cfg.monthly_fee <= 0) return { error: 'Configura primero la mensualidad.' };

  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-based
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const today = now.getUTCDate();
  const daysRemaining = daysInMonth - today + 1; // incluye hoy
  const amount = Math.round((cfg.monthly_fee * daysRemaining / daysInMonth) * 100) / 100;
  const period = currentPeriod();

  const { error } = await db.from('invoices').insert({
    restaurant_id: restaurantId,
    concept: 'PRORATE',
    description: `Prorrateo ${period.slice(0, 7)} (${daysRemaining}/${daysInMonth} días)`,
    period,
    amount,
    currency: cfg.currency,
    status: 'PENDING',
    due_date: now.toISOString().slice(0, 10),
  });
  if (error) return { error: error.message };
  revalidateBilling(restaurantId);
  return { ok: true, msg: `Cobro prorrateado por ${cfg.currency} ${amount.toFixed(2)} (${daysRemaining} de ${daysInMonth} días).` };
}

/* ── Cobro de implementación (setup) ────────────────────────── */

export async function generateSetupInvoice(
  prevState: BillingState,
  formData: FormData,
): Promise<BillingState> {
  const db = await verifySuperAdmin();
  if (!db) return { error: 'No autorizado.' };
  const restaurantId = String(formData.get('restaurantId') ?? '').trim();
  if (!UUID_RE.test(restaurantId)) return { error: 'Restaurante inválido.' };

  const cfg = await getBillingConfig(restaurantId);
  const amount = cfg?.setup_fee ?? num(formData, 'amount');
  if (amount <= 0) return { error: 'El costo de implementación es 0.' };

  const { error } = await db.from('invoices').insert({
    restaurant_id: restaurantId,
    concept: 'SETUP',
    description: 'Implementación del servicio',
    amount,
    currency: cfg?.currency ?? 'GTQ',
    status: 'PENDING',
    due_date: new Date().toISOString().slice(0, 10),
  });
  if (error) return { error: error.message };
  revalidateBilling(restaurantId);
  return { ok: true, msg: 'Cobro de implementación generado.' };
}

/* ── Cobro manual (otro concepto) ───────────────────────────── */

export async function createManualInvoice(
  prevState: BillingState,
  formData: FormData,
): Promise<BillingState> {
  const db = await verifySuperAdmin();
  if (!db) return { error: 'No autorizado.' };
  const restaurantId = String(formData.get('restaurantId') ?? '').trim();
  if (!UUID_RE.test(restaurantId)) return { error: 'Restaurante inválido.' };

  const amount = num(formData, 'amount');
  if (amount <= 0) return { error: 'El monto debe ser mayor a 0.' };
  const cfg = await getBillingConfig(restaurantId);
  const dueDate = String(formData.get('due_date') ?? '').trim() || new Date().toISOString().slice(0, 10);

  const { error } = await db.from('invoices').insert({
    restaurant_id: restaurantId,
    concept: 'OTHER',
    description: String(formData.get('description') ?? '').trim() || 'Cobro',
    amount,
    currency: cfg?.currency ?? 'GTQ',
    status: 'PENDING',
    due_date: dueDate,
  });
  if (error) return { error: error.message };
  revalidateBilling(restaurantId);
  return { ok: true, msg: 'Cobro creado.' };
}

/* ── Marcar pagado / pendiente / cancelar / borrar ──────────── */

export async function markInvoicePaid(
  prevState: BillingState,
  formData: FormData,
): Promise<BillingState> {
  const db = await verifySuperAdmin();
  if (!db) return { error: 'No autorizado.' };
  const invoiceId = String(formData.get('invoiceId') ?? '').trim();
  const restaurantId = String(formData.get('restaurantId') ?? '').trim();
  if (!UUID_RE.test(invoiceId)) return { error: 'Factura inválida.' };

  const { data: inv } = await db.from('invoices').select('amount').eq('id', invoiceId).single();
  const paidAmount = num(formData, 'paid_amount') || Number(inv?.amount ?? 0);

  const { error } = await db.from('invoices').update({
    status: 'PAID',
    paid_at: new Date().toISOString(),
    paid_amount: paidAmount,
    payment_method: String(formData.get('payment_method') ?? '').trim() || 'Efectivo',
  }).eq('id', invoiceId);
  if (error) return { error: error.message };
  revalidateBilling(restaurantId);
  return { ok: true, msg: 'Pago registrado.' };
}

export async function markInvoiceUnpaid(
  prevState: BillingState,
  formData: FormData,
): Promise<BillingState> {
  const db = await verifySuperAdmin();
  if (!db) return { error: 'No autorizado.' };
  const invoiceId = String(formData.get('invoiceId') ?? '').trim();
  const restaurantId = String(formData.get('restaurantId') ?? '').trim();
  if (!UUID_RE.test(invoiceId)) return { error: 'Factura inválida.' };

  const { error } = await db.from('invoices').update({
    status: 'PENDING', paid_at: null, paid_amount: null, payment_method: null,
  }).eq('id', invoiceId);
  if (error) return { error: error.message };
  revalidateBilling(restaurantId);
  return { ok: true, msg: 'Marcado como pendiente.' };
}

export async function deleteInvoice(
  prevState: BillingState,
  formData: FormData,
): Promise<BillingState> {
  const db = await verifySuperAdmin();
  if (!db) return { error: 'No autorizado.' };
  const invoiceId = String(formData.get('invoiceId') ?? '').trim();
  const restaurantId = String(formData.get('restaurantId') ?? '').trim();
  if (!UUID_RE.test(invoiceId)) return { error: 'Factura inválida.' };
  const { error } = await db.from('invoices').delete().eq('id', invoiceId);
  if (error) return { error: error.message };
  revalidateBilling(restaurantId);
  return { ok: true, msg: 'Cobro eliminado.' };
}

/* ── Lectura del propio cobro (panel del dueño) ─────────────── */

export interface MyBilling {
  config: BillingConfig | null;
  invoices: Invoice[];
  pendingTotal: number;
  currency: string;
}

/** El dueño/staff ve la config + facturas de SU restaurante. */
export async function getMyBilling(restaurantId: string): Promise<MyBilling> {
  const empty: MyBilling = { config: null, invoices: [], pendingTotal: 0, currency: 'GTQ' };
  if (!UUID_RE.test(restaurantId)) return empty;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return empty;
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, restaurant_id')
    .eq('id', user.id)
    .single();

  const allowed =
    profile?.role === 'SUPER_ADMIN' ||
    (['RESTAURANT_OWNER', 'RESTAURANT_STAFF'].includes(profile?.role ?? '') &&
      profile?.restaurant_id === restaurantId);
  if (!allowed) return empty;

  const [config, invoices] = await Promise.all([
    getBillingConfig(restaurantId),
    getInvoices(restaurantId, 100),
  ]);
  const pendingTotal = invoices
    .filter((i) => i.status === 'PENDING')
    .reduce((s, i) => s + i.amount, 0);
  return { config, invoices, pendingTotal, currency: config?.currency ?? 'GTQ' };
}
