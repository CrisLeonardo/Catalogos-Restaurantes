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
  if (restaurantId) revalidatePath(`/super/restaurantes/${restaurantId}`, 'layout');
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
  const autoPrice = formData.get('auto_price') === 'on' || formData.get('auto_price') === 'true';

  // Días de gracia: vacío = usa el global (null). Entero 0..90.
  const graceRaw = String(formData.get('grace_days') ?? '').trim();
  const graceDays = graceRaw === '' ? null : Math.min(90, Math.max(0, Math.round(parseFloat(graceRaw) || 0)));

  // En modo automático la mensualidad la calcula el plan (RPC org-aware); en
  // modo manual respeta el monto tecleado (override).
  let monthlyFee = Math.max(0, num(formData, 'monthly_fee'));
  if (autoPrice) {
    const { data } = await db.rpc('leogin_compute_monthly_fee', { p_restaurant_id: restaurantId });
    if (data != null) monthlyFee = Number(data);
  }

  const { error } = await db.from('restaurant_billing').upsert({
    restaurant_id: restaurantId,
    currency,
    setup_fee: Math.max(0, num(formData, 'setup_fee')),
    monthly_fee: monthlyFee,
    billing_day: billingDay,
    auto_price: autoPrice,
    grace_days: graceDays,
    active: formData.get('active') === 'on' || formData.get('active') === 'true',
    admin_override_suspend: formData.get('admin_override_suspend') === 'on' || formData.get('admin_override_suspend') === 'true',
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

/** Corre el motor de cobro ahora mismo (mismo que el cron diario): genera las
 *  mensualidades del mes (precio auto refrescado) y procesa impago/reactivación.
 *  Respaldo manual por si pg_cron no está habilitado. */
export async function generateMonthlyInvoices(): Promise<BillingState> {
  const db = await verifySuperAdmin();
  if (!db) return { error: 'No autorizado.' };

  const period = currentPeriod();
  const { data: created, error } = await db.rpc('leogin_generate_monthly_invoices');
  if (error) return { error: error.message };
  const { data: changed } = await db.rpc('leogin_process_overdue');

  revalidateBilling();
  revalidatePath('/super/restaurantes');

  const n = Number(created ?? 0);
  const c = Number(changed ?? 0);
  const parts: string[] = [];
  parts.push(n > 0 ? `${n} cobro(s) generado(s) para ${period.slice(0, 7)}` : `Sin cobros nuevos para ${period.slice(0, 7)}`);
  if (c > 0) parts.push(`${c} restaurante(s) actualizaron su estado por impago/pago`);
  return { ok: true, msg: parts.join('. ') + '.' };
}

/** Recalcula la mensualidad de todos los restaurantes en modo automático
 *  (útil tras cambiar los precios globales o reasignar sucursales). */
export async function recomputeAutoPrices(): Promise<BillingState> {
  const db = await verifySuperAdmin();
  if (!db) return { error: 'No autorizado.' };
  const { data, error } = await db.rpc('leogin_apply_auto_price_all');
  if (error) return { error: error.message };
  revalidateBilling();
  return { ok: true, msg: `Precios recalculados en ${Number(data ?? 0)} restaurante(s).` };
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

/* ── Precios globales del plan + gracia (platform_settings) ─── */

export async function savePricingSettings(
  prevState: BillingState,
  formData: FormData,
): Promise<BillingState> {
  const db = await verifySuperAdmin();
  if (!db) return { error: 'No autorizado.' };

  const nonNeg = (key: string) => String(Math.max(0, num(formData, key)));
  const graceDays = String(Math.min(90, Math.max(0, Math.round(num(formData, 'grace_days') || 0))));
  const trialDays = String(Math.min(365, Math.max(0, Math.round(num(formData, 'trial_days') || 0))));

  // Máx canales descontables: acotado 0..2 (siempre se paga ≥1 canal).
  const channelMax = String(Math.min(2, Math.max(0, Math.round(num(formData, 'channel_discount_max') || 0))));

  const rows = [
    { key: 'plan_price_BASICO',        value: nonNeg('plan_price_BASICO') },
    { key: 'plan_price_ESTANDAR',      value: nonNeg('plan_price_ESTANDAR') },
    { key: 'plan_price_PREMIUM',       value: nonNeg('plan_price_PREMIUM') },
    { key: 'plan_price_PRO',           value: nonNeg('plan_price_PRO') },
    { key: 'channel_discount_per',     value: nonNeg('channel_discount_per') },
    { key: 'channel_discount_max',     value: channelMax },
    { key: 'module_price_reservaciones',  value: nonNeg('module_price_reservaciones') },
    { key: 'module_price_llamada_mesero', value: nonNeg('module_price_llamada_mesero') },
    { key: 'module_price_encuestas',      value: nonNeg('module_price_encuestas') },
    { key: 'module_price_cupones',        value: nonNeg('module_price_cupones') },
    { key: 'module_price_loyalty',        value: nonNeg('module_price_loyalty') },
    { key: 'module_price_recetas',        value: nonNeg('module_price_recetas') },
    { key: 'module_price_proveedores',    value: nonNeg('module_price_proveedores') },
    { key: 'module_price_fel',            value: nonNeg('module_price_fel') },
    { key: 'module_setup_fee_fel',        value: nonNeg('module_setup_fee_fel') },
    { key: 'setup_fee_BASICO',     value: nonNeg('setup_fee_BASICO') },
    { key: 'setup_fee_ESTANDAR',   value: nonNeg('setup_fee_ESTANDAR') },
    { key: 'setup_fee_PREMIUM',    value: nonNeg('setup_fee_PREMIUM') },
    { key: 'setup_fee_PRO',        value: nonNeg('setup_fee_PRO') },
    { key: 'group_panel_fee',              value: nonNeg('group_panel_fee') },
    { key: 'setup_fee_default',            value: nonNeg('setup_fee_default') },
    { key: 'billing_grace_days',           value: graceDays },
    { key: 'trial_days',                   value: trialDays },
    { key: 'billing_auto_suspend',  value: formData.get('billing_auto_suspend')  === 'on' || formData.get('billing_auto_suspend')  === 'true' ? 'true' : 'false' },
    { key: 'billing_auto_generate', value: formData.get('billing_auto_generate') === 'on' || formData.get('billing_auto_generate') === 'true' ? 'true' : 'false' },
  ];

  const { error } = await db.from('platform_settings').upsert(rows, { onConflict: 'key' });
  if (error) return { error: error.message };

  // Aplica los precios nuevos a quienes estén en modo automático.
  const { data: count } = await db.rpc('leogin_apply_auto_price_all');
  revalidateBilling();
  revalidatePath('/super/configuracion');
  // Las superficies PÚBLICAS muestran estos precios: hay que regenerarlas
  // ya, no esperar el ciclo ISR (la landing '/' es dinámica y no lo necesita).
  revalidatePath('/planes');
  revalidatePath('/registro');
  revalidatePath('/admin/modulos');
  return { ok: true, msg: `Precios guardados y publicados en la web. ${Number(count ?? 0)} restaurante(s) recalculado(s).` };
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

  // Si ya no quedan cobros vencidos, reactiva al restaurante suspendido por impago.
  let reactivated = false;
  if (UUID_RE.test(restaurantId)) {
    const { data } = await db.rpc('leogin_sync_restaurant_status', { p_restaurant_id: restaurantId });
    reactivated = data === 'reactivated';
  }
  revalidateBilling(restaurantId);
  revalidatePath('/super/restaurantes');
  return { ok: true, msg: reactivated ? 'Pago registrado. El restaurante se reactivó.' : 'Pago registrado.' };
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

/* ── Habilitar manualmente un restaurante suspendido por impago ── */

/** Reactiva el restaurante y activa el override para que el cron no lo
 *  vuelva a suspender automáticamente. El admin desactiva el override
 *  cuando el restaurante regularice su pago. */
export async function liftSuspension(
  prevState: BillingState,
  formData: FormData,
): Promise<BillingState> {
  const db = await verifySuperAdmin();
  if (!db) return { error: 'No autorizado.' };
  const restaurantId = String(formData.get('restaurantId') ?? '').trim();
  if (!UUID_RE.test(restaurantId)) return { error: 'Restaurante inválido.' };

  const { error: e1 } = await db
    .from('restaurants')
    .update({ status: 'active' })
    .eq('id', restaurantId);
  if (e1) return { error: e1.message };

  const { error: e2 } = await db
    .from('restaurant_billing')
    .update({ suspended_for_nonpayment: false, admin_override_suspend: true })
    .eq('restaurant_id', restaurantId);
  if (e2) return { error: e2.message };

  revalidateBilling(restaurantId);
  revalidatePath('/super/restaurantes');
  return {
    ok: true,
    msg: 'Restaurante habilitado. La suspensión automática está pausada; desactiva el override cuando regularice el pago.',
  };
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
