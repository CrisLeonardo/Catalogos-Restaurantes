import { cache } from 'react';
import { createServiceClient } from '@/lib/supabase/service';
import { PLANS, ADDON_MODULES, type PlanCode, type PlanPricing } from '@/lib/plans';
import type { ActivatableModuleKey } from '@/lib/modules';

/* ============================================================
   FACTURACIÓN — Cobro de Leogin a sus restaurantes (mig. 028)
   ------------------------------------------------------------
   Capa de datos pura (service role). Los llamadores validan la
   sesión: las páginas /super/* ya están protegidas por su layout
   (SUPER_ADMIN); el panel del dueño accede vía server actions que
   autorizan al restaurante.
   ============================================================ */

export type InvoiceConcept = 'MONTHLY' | 'SETUP' | 'PRORATE' | 'OTHER';
export type InvoiceStatus = 'PENDING' | 'PAID' | 'CANCELLED';

export interface BillingConfig {
  restaurant_id: string;
  currency: string;
  setup_fee: number;
  monthly_fee: number;
  billing_day: number;
  active: boolean;
  started_at: string | null;
  notes: string | null;
  /** true = la mensualidad se calcula del plan; false = monto manual (override). */
  auto_price: boolean;
  /** Override de días de gracia; null = usa el global. */
  grace_days: number | null;
  /** El sistema lo suspendió por impago (no una suspensión manual). */
  suspended_for_nonpayment: boolean;
  /** El admin pausó la suspensión automática; el cron no suspenderá aunque haya mora. */
  admin_override_suspend: boolean;
  /** Fin de la prueba gratis (null = sin prueba). En prueba: active=false y esta fecha futura. */
  trial_ends_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Parámetros globales de precio + gracia (platform_settings, mig. 035 + 072). */
export interface PricingSettings {
  basico: number;
  estandar: number;
  premium: number;
  pro: number;
  /** "Plan a tu medida": Q de descuento por cada método de pedido desactivado
   *  (comer en local / para llevar / a domicilio — mig. 078). */
  channelDiscountPer: number;
  /** Máximo de métodos descontables (piso: siempre se paga al menos 1 de los 3). */
  channelDiscountMax: number;
  /** Cobro único de configuración asistida por plan (referencia; se factura manual). */
  setupFeeBasico: number;
  setupFeeEstandar: number;
  setupFeePremium: number;
  setupFeePro: number;
  setupFeeDefault: number;
  /** Precio mensual de cada módulo a la carta (Q). */
  modulePrices: Record<ActivatableModuleKey, number>;
  /** Cobro único de activación de FEL (conexión con certificador). */
  moduleSetupFeeFel: number;
  groupPanelFee: number;
  graceDays: number;
  autoSuspend: boolean;
  autoGenerate: boolean;
  trialDays: number;
}

/** Metadatos de plan para UI (color de badge, etc.) — precio/label vienen de plans.ts. */
export const PLAN_META: Record<string, {
  label: string;
  price: number;
  hasOrders: boolean;
  color: string;
}> = Object.fromEntries(
  (Object.keys(PLANS) as PlanCode[]).map((code) => [
    code,
    {
      label: PLANS[code].name,
      price: PLANS[code].priceMonthly,
      hasOrders: PLANS[code].hasOrders,
      color: code === 'BASICO' ? 'gray' : code === 'ESTANDAR' ? 'emerald' : code === 'PREMIUM' ? 'blue' : 'purple',
    },
  ]),
);

export function planLabel(plan: string | null | undefined): string {
  return PLAN_META[plan ?? '']?.label ?? (plan ?? '—');
}

export function planHasOrders(plan: string | null | undefined): boolean {
  return PLAN_META[plan ?? '']?.hasOrders ?? false;
}

export interface Invoice {
  id: string;
  restaurant_id: string;
  concept: InvoiceConcept;
  description: string | null;
  period: string | null;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  due_date: string | null;
  paid_at: string | null;
  paid_amount: number | null;
  payment_method: string | null;
  notes: string | null;
  created_at: string;
}

/** Primer día del mes actual en formato YYYY-MM-DD (UTC, suficiente para el periodo de cobro). */
export function currentPeriod(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

const CONCEPTS: InvoiceConcept[] = ['MONTHLY', 'SETUP', 'PRORATE', 'OTHER'];
const STATUSES: InvoiceStatus[] = ['PENDING', 'PAID', 'CANCELLED'];

function normInvoice(row: Record<string, unknown>): Invoice {
  return {
    id: row.id as string,
    restaurant_id: row.restaurant_id as string,
    concept: (CONCEPTS.includes(row.concept as InvoiceConcept) ? row.concept : 'OTHER') as InvoiceConcept,
    description: (row.description as string | null) ?? null,
    period: (row.period as string | null) ?? null,
    amount: Number(row.amount ?? 0),
    currency: (row.currency as string) ?? 'GTQ',
    status: (STATUSES.includes(row.status as InvoiceStatus) ? row.status : 'PENDING') as InvoiceStatus,
    due_date: (row.due_date as string | null) ?? null,
    paid_at: (row.paid_at as string | null) ?? null,
    paid_amount: row.paid_amount != null ? Number(row.paid_amount) : null,
    payment_method: (row.payment_method as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    created_at: row.created_at as string,
  };
}

export const getBillingConfig = cache(
  async (restaurantId: string): Promise<BillingConfig | null> => {
    const db = createServiceClient();
    const { data } = await db
      .from('restaurant_billing')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .maybeSingle();
    if (!data) return null;
    return normConfig(data);
  },
);

function normConfig(data: Record<string, unknown>): BillingConfig {
  return {
    restaurant_id: data.restaurant_id as string,
    currency: (data.currency as string) ?? 'GTQ',
    setup_fee: Number(data.setup_fee ?? 0),
    monthly_fee: Number(data.monthly_fee ?? 0),
    billing_day: Number(data.billing_day ?? 1),
    active: data.active !== false,
    started_at: (data.started_at as string | null) ?? null,
    notes: (data.notes as string | null) ?? null,
    auto_price: data.auto_price !== false,
    grace_days: data.grace_days != null ? Number(data.grace_days) : null,
    suspended_for_nonpayment: data.suspended_for_nonpayment === true,
    admin_override_suspend: data.admin_override_suspend === true,
    trial_ends_at: (data.trial_ends_at as string | null) ?? null,
    created_at: data.created_at as string,
    updated_at: data.updated_at as string,
  };
}

/** ¿El restaurante está en prueba gratis ahora mismo? */
export function isOnTrial(cfg: { active: boolean; trial_ends_at: string | null } | null): boolean {
  if (!cfg || cfg.active || !cfg.trial_ends_at) return false;
  return new Date(cfg.trial_ends_at).getTime() > Date.now();
}

/** Días que faltan para que termine la prueba (0 si ya venció o no hay). */
export function trialDaysLeft(cfg: { trial_ends_at: string | null } | null): number {
  if (!cfg?.trial_ends_at) return 0;
  const ms = new Date(cfg.trial_ends_at).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

/** Parámetros globales de precio + gracia. */
export const getPricingSettings = cache(async (): Promise<PricingSettings> => {
  const db = createServiceClient();
  const { data } = await db.from('platform_settings').select('key, value');
  const map = new Map((data ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
  const n = (k: string, d: number) => { const v = parseFloat(map.get(k) ?? ''); return isNaN(v) ? d : v; };
  const b = (k: string, d: boolean) => { const v = map.get(k); return v == null || v === '' ? d : v === 'true'; };
  return {
    basico:             n('plan_price_BASICO',   PLANS.BASICO.priceMonthly),
    estandar:           n('plan_price_ESTANDAR', PLANS.ESTANDAR.priceMonthly),
    premium:            n('plan_price_PREMIUM',  PLANS.PREMIUM.priceMonthly),
    pro:                n('plan_price_PRO',      PLANS.PRO.priceMonthly),
    channelDiscountPer: n('channel_discount_per', 50),
    channelDiscountMax: n('channel_discount_max',  2),
    setupFeeBasico:     n('setup_fee_BASICO',   PLANS.BASICO.setupFee),
    setupFeeEstandar:   n('setup_fee_ESTANDAR', PLANS.ESTANDAR.setupFee),
    setupFeePremium:    n('setup_fee_PREMIUM',  PLANS.PREMIUM.setupFee),
    setupFeePro:        n('setup_fee_PRO',      PLANS.PRO.setupFee),
    setupFeeDefault:    n('setup_fee_default',  300),
    modulePrices: Object.fromEntries(
      (Object.keys(ADDON_MODULES) as ActivatableModuleKey[]).map((key) => [
        key,
        n(`module_price_${key}`, ADDON_MODULES[key].price),
      ]),
    ) as Record<ActivatableModuleKey, number>,
    moduleSetupFeeFel: n('module_setup_fee_fel', ADDON_MODULES.fel.setupFee ?? 500),
    groupPanelFee:      n('group_panel_fee',    299),
    graceDays:          n('billing_grace_days',  10),
    autoSuspend:        b('billing_auto_suspend', true),
    autoGenerate:       b('billing_auto_generate', true),
    trialDays:          n('trial_days',            30),
  };
});

/** Precios vigentes en la forma que consumen las superficies públicas
 *  (landing, /planes, /registro, suscripción, upsells del panel).
 *  Única puerta para MOSTRAR precios: refleja los overrides que el
 *  super admin guarda en /super/configuracion. */
export const getEffectivePlanPricing = cache(async (): Promise<PlanPricing> => {
  const s = await getPricingSettings();
  return {
    prices: {
      BASICO: s.basico,
      ESTANDAR: s.estandar,
      PREMIUM: s.premium,
      PRO: s.pro,
    },
    modulePrices: s.modulePrices,
    moduleSetupFeeFel: s.moduleSetupFeeFel,
    groupPanelFee: s.groupPanelFee,
    channelDiscountPer: s.channelDiscountPer,
    channelDiscountMax: s.channelDiscountMax,
    trialDays: s.trialDays,
  };
});

/** Precio mensual sugerido por el plan + sucursales (vía RPC org-aware). */
export async function computeSuggestedFee(restaurantId: string): Promise<number> {
  const db = createServiceClient();
  const { data, error } = await db.rpc('leogin_compute_monthly_fee', { p_restaurant_id: restaurantId });
  if (error || data == null) return 0;
  return Number(data);
}

/**
 * Lo que se facturará el mes que viene si el restaurante deja su configuración
 * como está ahora.
 *
 * No es una estimación: se le pregunta al MISMO motor que factura
 * (leogin_compute_monthly_fee) por el periodo siguiente. Su ventana de
 * evaluación es el mes en curso, y el último tramo del historial se extiende
 * hasta el final del mes — o sea, "si lo dejas así". Cualquier cálculo hecho
 * aparte en la app acabaría desviándose de la factura real; esto no puede.
 */
export async function computeNextPeriodFee(restaurantId: string): Promise<number | null> {
  const db = createServiceClient();
  const now = new Date();
  const nextPeriodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
    .toISOString()
    .slice(0, 10);
  const { data, error } = await db.rpc('leogin_compute_monthly_fee', {
    p_restaurant_id: restaurantId,
    p_period_start: nextPeriodStart,
  });
  if (error || data == null) return null;
  return Number(data);
}

/** Desglose "Plan a tu medida" para mostrar al dueño / super admin. */
export interface FeeBreakdown {
  plan: string | null;
  base: number;
  /** Métodos de pedido activos AHORA MISMO (estado en vivo del checkout). */
  channelsActiveLive: number;
  /** Métodos que cuentan como activos para EL COBRO (mig. 073/078: uno
   *  recién apagado sigue facturándose completo hasta el ciclo siguiente
   *  — ver leogin_billed_active_channels). Puede diferir de channelsActiveLive. */
  channelsActiveBilled: number;
  channelsTotal: number;
  discountApplies: boolean;
  discountPer: number;
  channelsOff: number;
  /** Qué métodos se facturan como apagados ('dine_in' | 'pickup' | 'delivery'). */
  channelsOffKeys: string[];
  discount: number;
  /** % de descuento por volumen de sucursales del grupo (0 si no aplica). */
  branchDiscountPct: number;
  /** Costo mensual de módulos a la carta facturados este periodo. */
  addonTotal: number;
  /** Detalle por módulo facturado (para el desglose del dueño). */
  addonItems: { key: string; price: number }[];
  final: number;
}

export async function getFeeBreakdown(restaurantId: string): Promise<FeeBreakdown | null> {
  const db = createServiceClient();
  const { data, error } = await db.rpc('leogin_fee_breakdown', { p_restaurant_id: restaurantId });
  if (error || !data) return null;
  const d = data as Record<string, unknown>;
  if (!d.plan) return null;
  return {
    plan:                  (d.plan as string) ?? null,
    base:                  Number(d.base ?? 0),
    channelsActiveLive:    Number(d.channels_active_live ?? 3),
    channelsActiveBilled:  Number(d.channels_active_billed ?? 3),
    channelsTotal:         Number(d.channels_total ?? 3),
    discountApplies:       Boolean(d.discount_applies),
    discountPer:           Number(d.discount_per ?? 0),
    channelsOff:           Number(d.channels_off ?? 0),
    channelsOffKeys:       Array.isArray(d.channels_off_keys) ? (d.channels_off_keys as string[]) : [],
    discount:              Number(d.discount ?? 0),
    branchDiscountPct:     Number(d.branch_discount_pct ?? 0),
    addonTotal:            Number(d.addon_total ?? 0),
    addonItems:            Array.isArray(d.addon_items)
      ? (d.addon_items as { key: string; price: number }[]).map((it) => ({ key: String(it.key), price: Number(it.price) || 0 }))
      : [],
    final:                 Number(d.final ?? 0),
  };
}

export const getInvoices = cache(
  async (restaurantId: string, limit = 100): Promise<Invoice[]> => {
    const db = createServiceClient();
    const { data } = await db
      .from('invoices')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 500));
    return (data ?? []).map((r) => normInvoice(r as Record<string, unknown>));
  },
);

/** ¿La factura está vencida? (pendiente y su fecha límite ya pasó). */
export function isOverdue(inv: Invoice, today = new Date()): boolean {
  if (inv.status !== 'PENDING' || !inv.due_date) return false;
  return inv.due_date < today.toISOString().slice(0, 10);
}

/* ── Finanzas (Super Admin) ────────────────────────────────── */

export interface MonthlyIncomePoint {
  /** YYYY-MM */
  month: string;
  total: number;
  count: number;
}

export interface PaymentRecord {
  invoiceId: string;
  restaurantId: string;
  restaurantName: string;
  concept: InvoiceConcept;
  description: string | null;
  period: string | null;
  /** Monto realmente cobrado (paid_amount, o amount si no se registró). */
  amount: number;
  currency: string;
  paidAt: string;
  method: string | null;
}

export interface ReceivableInvoice {
  id: string;
  description: string | null;
  concept: InvoiceConcept;
  amount: number;
  dueDate: string | null;
  overdue: boolean;
}

export interface ReceivableRow {
  restaurantId: string;
  name: string;
  slug: string;
  status: string;
  whatsapp: string | null;
  email: string | null;
  currency: string;
  pendingTotal: number;
  overdueTotal: number;
  invoices: ReceivableInvoice[];
  lastPaidAt: string | null;
}

export interface FinanceOverview {
  /** Ingresos cobrados por mes, últimos 12 meses (incluye el actual). */
  incomeByMonth: MonthlyIncomePoint[];
  collectedThisMonth: number;
  collectedLastMonth: number;
  /** Cobrado en los últimos 12 meses. */
  collectedYear: number;
  mrr: number;
  pendingTotal: number;
  overdueTotal: number;
  /** Restaurantes con cobro activo facturando. */
  activeBilling: number;
  /** Pagos registrados, más recientes primero. */
  payments: PaymentRecord[];
  /** Cuentas por cobrar por restaurante (vencidos primero). */
  receivables: ReceivableRow[];
  /** Quién te ha pagado más en 12 meses. */
  topClients: { restaurantId: string; name: string; paidYear: number }[];
  currency: string;
}

/**
 * Panorama financiero completo de la plataforma: ingresos históricos,
 * cuentas por cobrar (con contacto para recordatorios) y pagos
 * registrados. 3 queries. Para /super/finanzas.
 */
export const getFinanceOverview = cache(async (): Promise<FinanceOverview> => {
  const db = createServiceClient();

  const [{ data: restaurants }, { data: configs }, { data: invoices }] = await Promise.all([
    db.from('restaurants').select('id, name, slug, status, whatsapp_number, contact_email'),
    db.from('restaurant_billing').select('*'),
    db.from('invoices').select('*').limit(20000),
  ]);

  const restMap = new Map<string, { name: string; slug: string; status: string; whatsapp: string | null; email: string | null }>();
  for (const r of restaurants ?? []) {
    restMap.set(r.id as string, {
      name: (r.name as string) ?? '—',
      slug: (r.slug as string) ?? '',
      status: (r.status as string) ?? 'active',
      whatsapp: (r.whatsapp_number as string | null) ?? null,
      email: (r.contact_email as string | null) ?? null,
    });
  }

  const configMap = new Map<string, BillingConfig>();
  for (const c of configs ?? []) configMap.set(c.restaurant_id as string, normConfig(c as Record<string, unknown>));

  const all = (invoices ?? []).map((r) => normInvoice(r as Record<string, unknown>));
  const today = new Date();

  // ── Serie de ingresos por mes (12 meses) ──
  const monthKeys: string[] = [];
  {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    d.setUTCMonth(d.getUTCMonth() - 11);
    for (let i = 0; i < 12; i++) {
      monthKeys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
      d.setUTCMonth(d.getUTCMonth() + 1);
    }
  }
  const monthMap = new Map<string, MonthlyIncomePoint>(monthKeys.map((m) => [m, { month: m, total: 0, count: 0 }]));

  const payments: PaymentRecord[] = [];
  let collectedYear = 0;
  const paidByClient = new Map<string, number>();

  for (const inv of all) {
    if (inv.status !== 'PAID' || !inv.paid_at) continue;
    const amount = inv.paid_amount ?? inv.amount;
    const monthKey = inv.paid_at.slice(0, 7);
    const pt = monthMap.get(monthKey);
    if (pt) { pt.total += amount; pt.count += 1; collectedYear += amount; }
    paidByClient.set(inv.restaurant_id, (paidByClient.get(inv.restaurant_id) ?? 0) + (pt ? amount : 0));
    payments.push({
      invoiceId: inv.id,
      restaurantId: inv.restaurant_id,
      restaurantName: restMap.get(inv.restaurant_id)?.name ?? '—',
      concept: inv.concept,
      description: inv.description,
      period: inv.period,
      amount,
      currency: inv.currency,
      paidAt: inv.paid_at,
      method: inv.payment_method,
    });
  }
  payments.sort((a, b) => (a.paidAt < b.paidAt ? 1 : -1));

  const thisMonthKey = monthKeys[11];
  const lastMonthKey = monthKeys[10];
  const collectedThisMonth = monthMap.get(thisMonthKey)?.total ?? 0;
  const collectedLastMonth = monthMap.get(lastMonthKey)?.total ?? 0;

  // ── Cuentas por cobrar ──
  const pendingByRest = new Map<string, ReceivableInvoice[]>();
  for (const inv of all) {
    if (inv.status !== 'PENDING') continue;
    const arr = pendingByRest.get(inv.restaurant_id) ?? [];
    arr.push({
      id: inv.id,
      description: inv.description,
      concept: inv.concept,
      amount: inv.amount,
      dueDate: inv.due_date,
      overdue: isOverdue(inv, today),
    });
    pendingByRest.set(inv.restaurant_id, arr);
  }

  const lastPaidByRest = new Map<string, string>();
  for (const p of payments) {
    if (!lastPaidByRest.has(p.restaurantId)) lastPaidByRest.set(p.restaurantId, p.paidAt);
  }

  const receivables: ReceivableRow[] = [];
  let pendingTotal = 0;
  let overdueTotal = 0;
  for (const [rid, invs] of pendingByRest) {
    const meta = restMap.get(rid);
    if (!meta) continue;
    const cfg = configMap.get(rid);
    const pend = invs.reduce((s, i) => s + i.amount, 0);
    const over = invs.filter((i) => i.overdue).reduce((s, i) => s + i.amount, 0);
    pendingTotal += pend;
    overdueTotal += over;
    invs.sort((a, b) => (a.dueDate ?? '9999') < (b.dueDate ?? '9999') ? -1 : 1);
    receivables.push({
      restaurantId: rid,
      name: meta.name,
      slug: meta.slug,
      status: meta.status,
      whatsapp: meta.whatsapp,
      email: meta.email,
      currency: cfg?.currency ?? 'GTQ',
      pendingTotal: pend,
      overdueTotal: over,
      invoices: invs,
      lastPaidAt: lastPaidByRest.get(rid) ?? null,
    });
  }
  // Vencidos primero, luego por monto pendiente.
  receivables.sort((a, b) => (b.overdueTotal - a.overdueTotal) || (b.pendingTotal - a.pendingTotal));

  const mrr = [...configMap.values()].filter((c) => c.active).reduce((s, c) => s + c.monthly_fee, 0);
  const activeBilling = [...configMap.values()].filter((c) => c.active && c.monthly_fee > 0).length;

  const topClients = [...paidByClient.entries()]
    .map(([restaurantId, paidYear]) => ({ restaurantId, name: restMap.get(restaurantId)?.name ?? '—', paidYear }))
    .filter((t) => t.paidYear > 0)
    .sort((a, b) => b.paidYear - a.paidYear)
    .slice(0, 8);

  return {
    incomeByMonth: monthKeys.map((m) => monthMap.get(m)!),
    collectedThisMonth,
    collectedLastMonth,
    collectedYear,
    mrr,
    pendingTotal,
    overdueTotal,
    activeBilling,
    payments,
    receivables,
    topClients,
    currency: 'GTQ',
  };
});

/* ── Dashboard global de cobros (Super Admin) ──────────────── */

export interface BillingRow {
  restaurantId: string;
  name: string;
  slug: string;
  status: string;                 // active | suspended
  plan: string;
  /** Config de cobro (null si aún no se ha configurado). */
  config: BillingConfig | null;
  /** Total pendiente de pago (suma de facturas PENDING). */
  pendingTotal: number;
  /** ¿Tiene la mensualidad del periodo actual generada? */
  hasCurrentMonthly: boolean;
  /** Estado de la mensualidad del periodo actual (si existe). */
  currentMonthlyStatus: InvoiceStatus | null;
  /** ¿Tiene alguna factura vencida? */
  hasOverdue: boolean;
  /** Último pago registrado. */
  lastPaidAt: string | null;
  /** Tráfico/afluencia para decidir precio. */
  visits30: number;
  unique30: number;
  orders30: number;
  /** Venta que el restaurante facturó en 30 días (su negocio, no lo que te paga). */
  salesRevenue30: number;
}

export interface BillingStats {
  /** Ingreso recurrente mensual (suma de mensualidades activas). */
  mrr: number;
  /** Cobrado este mes (facturas PAID con paid_at en el mes actual). */
  collectedThisMonth: number;
  /** Pendiente total (todas las facturas PENDING). */
  pendingTotal: number;
  /** Nº de restaurantes con facturas vencidas. */
  overdueCount: number;
  /** Nº de restaurantes con cobro configurado y activo. */
  activeBilling: number;
  currency: string;
}

export interface BillingDashboard {
  rows: BillingRow[];
  stats: BillingStats;
  period: string;
}

/**
 * Tablero completo de cobros: cruza restaurantes + config + facturas
 * + tráfico/ventas (30 días) en pocas queries. Para /super/finanzas/cobranza.
 */
export const getBillingDashboard = cache(async (): Promise<BillingDashboard> => {
  const db = createServiceClient();
  const period = currentPeriod();
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const sinceIso = since.toISOString();
  const monthStart = `${period.slice(0, 7)}-01T00:00:00Z`;

  const [
    { data: restaurants },
    { data: configs },
    { data: invoices },
    { data: visits },
    { data: orders },
  ] = await Promise.all([
    db.from('restaurants').select('id, name, slug, status, plan_actual').order('name'),
    db.from('restaurant_billing').select('*'),
    db.from('invoices').select('*').limit(20000),
    db.from('page_visits').select('restaurant_id, visitor_id').gte('created_at', sinceIso).limit(100000),
    db.from('orders').select('restaurant_id, total').neq('status', 'CANCEL').gte('created_at', sinceIso).limit(100000),
  ]);

  const configMap = new Map<string, BillingConfig>();
  for (const c of configs ?? []) {
    configMap.set(c.restaurant_id as string, normConfig(c as Record<string, unknown>));
  }

  // Agrupar facturas por restaurante.
  const invByRest = new Map<string, Invoice[]>();
  for (const raw of invoices ?? []) {
    const inv = normInvoice(raw as Record<string, unknown>);
    const arr = invByRest.get(inv.restaurant_id) ?? [];
    arr.push(inv);
    invByRest.set(inv.restaurant_id, arr);
  }

  // Tráfico.
  const visitMap = new Map<string, number>();
  const uniqueMap = new Map<string, Set<string>>();
  for (const v of visits ?? []) {
    const id = v.restaurant_id as string;
    visitMap.set(id, (visitMap.get(id) ?? 0) + 1);
    let set = uniqueMap.get(id);
    if (!set) { set = new Set(); uniqueMap.set(id, set); }
    set.add(v.visitor_id as string);
  }
  const orderCountMap = new Map<string, number>();
  const salesMap = new Map<string, number>();
  for (const o of orders ?? []) {
    const id = o.restaurant_id as string;
    orderCountMap.set(id, (orderCountMap.get(id) ?? 0) + 1);
    salesMap.set(id, (salesMap.get(id) ?? 0) + Number(o.total ?? 0));
  }

  const today = new Date();
  const rows: BillingRow[] = (restaurants ?? []).map((r) => {
    const id = r.id as string;
    const invs = invByRest.get(id) ?? [];
    const pending = invs.filter((i) => i.status === 'PENDING');
    const paid = invs.filter((i) => i.status === 'PAID');
    const currentMonthly = invs.find((i) => i.concept === 'MONTHLY' && i.period === period) ?? null;
    const lastPaid = paid
      .map((i) => i.paid_at)
      .filter((d): d is string => !!d)
      .sort()
      .pop() ?? null;
    return {
      restaurantId: id,
      name: r.name as string,
      slug: r.slug as string,
      status: r.status as string,
      plan: r.plan_actual as string,
      config: configMap.get(id) ?? null,
      pendingTotal: pending.reduce((s, i) => s + i.amount, 0),
      hasCurrentMonthly: !!currentMonthly,
      currentMonthlyStatus: currentMonthly?.status ?? null,
      hasOverdue: pending.some((i) => isOverdue(i, today)),
      lastPaidAt: lastPaid,
      visits30: visitMap.get(id) ?? 0,
      unique30: uniqueMap.get(id)?.size ?? 0,
      orders30: orderCountMap.get(id) ?? 0,
      salesRevenue30: salesMap.get(id) ?? 0,
    };
  });

  // Estadísticas globales.
  const allInvoices = [...invByRest.values()].flat();
  const mrr = [...configMap.values()]
    .filter((c) => c.active)
    .reduce((s, c) => s + c.monthly_fee, 0);
  const collectedThisMonth = allInvoices
    .filter((i) => i.status === 'PAID' && i.paid_at && i.paid_at >= monthStart)
    .reduce((s, i) => s + (i.paid_amount ?? i.amount), 0);
  const pendingTotal = allInvoices
    .filter((i) => i.status === 'PENDING')
    .reduce((s, i) => s + i.amount, 0);
  const overdueCount = rows.filter((r) => r.hasOverdue).length;
  const activeBilling = [...configMap.values()].filter((c) => c.active && c.monthly_fee > 0).length;

  return {
    rows,
    stats: {
      mrr,
      collectedThisMonth,
      pendingTotal,
      overdueCount,
      activeBilling,
      currency: 'GTQ',
    },
    period,
  };
});
