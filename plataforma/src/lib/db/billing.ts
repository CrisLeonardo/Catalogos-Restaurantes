import { cache } from 'react';
import { createServiceClient } from '@/lib/supabase/service';

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

/** Parámetros globales de precio + gracia (platform_settings, mig. 035). */
export interface PricingSettings {
  basico: number;
  popular: number;
  premium: number;
  extraBranchFee: number;
  premiumIncludedBranches: number;
  setupFeeDefault: number;
  graceDays: number;
  autoSuspend: boolean;
  autoGenerate: boolean;
  trialDays: number;
}

const PLAN_LABEL: Record<string, string> = {
  BASICO: 'Básico', POPULAR: 'Popular', PREMIUM: 'Premium',
};
export function planLabel(plan: string | null | undefined): string {
  return PLAN_LABEL[plan ?? ''] ?? (plan ?? '—');
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
  const n = (k: string, d: number) => {
    const v = parseFloat(map.get(k) ?? '');
    return isNaN(v) ? d : v;
  };
  const b = (k: string, d: boolean) => {
    const v = map.get(k);
    return v == null || v === '' ? d : v === 'true';
  };
  return {
    basico: n('plan_price_BASICO', 200),
    popular: n('plan_price_POPULAR', 600),
    premium: n('plan_price_PREMIUM', 1200),
    extraBranchFee: n('extra_branch_fee', 600),
    premiumIncludedBranches: n('premium_included_branches', 2),
    setupFeeDefault: n('setup_fee_default', 500),
    graceDays: n('billing_grace_days', 10),
    autoSuspend: b('billing_auto_suspend', true),
    autoGenerate: b('billing_auto_generate', true),
    trialDays: n('trial_days', 14),
  };
});

/** Precio mensual sugerido por el plan + sucursales (vía RPC org-aware). */
export async function computeSuggestedFee(restaurantId: string): Promise<number> {
  const db = createServiceClient();
  const { data, error } = await db.rpc('leogin_compute_monthly_fee', { p_restaurant_id: restaurantId });
  if (error || data == null) return 0;
  return Number(data);
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
 * + tráfico/ventas (30 días) en pocas queries. Para /super/cobros.
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
