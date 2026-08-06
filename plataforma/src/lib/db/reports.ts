import { createServiceClient } from '@/lib/supabase/service';

/* ============================================================
   REPORTES FINANCIEROS — Fase A (Admin Pro)
   ------------------------------------------------------------
   Resumen de ventas, utilidad y margen en un rango de fechas.
   Capa de datos pura (service role); la página/acción que llama
   ya validó la sesión y el restaurante (mismo modelo que
   db/orders.ts · getOrderStats).

   La agregación (día local/canal/pago/zona/producto) corre en SQL vía
   la función leogin_sales_report (migración 098) — antes traía hasta
   20,000 pedidos con sus ítems y los agregaba en Maps de JS en cada
   request. Esta capa solo llama al RPC y da forma al resultado.
   ============================================================ */

export type DayRevenue = { date: string; label: string; revenue: number; orders: number };
export type ChannelKey = 'PICKUP' | 'DELIVERY' | 'DINE_IN';
export type Split = { key: string; label: string; orders: number; revenue: number };
export type ReportProduct = {
  name: string;
  qty: number;
  revenue: number;
  cost: number;
  profit: number;
  hasCost: boolean;
};

export interface SalesReport {
  from: string;
  to: string;
  orders: number;
  /** Ingreso bruto = suma de totales (incluye envío). */
  revenue: number;
  /** Ingreso de productos = suma de subtotales (sin envío). */
  productRevenue: number;
  deliveryRevenue: number;
  /** Propinas del rango (ya incluidas en `revenue`, aquí solo desglosadas). */
  tips: number;
  /** Costo de los productos vendidos (solo ítems con costo capturado). */
  cost: number;
  /** Utilidad = ingreso de productos con costo − costo. */
  profit: number;
  /** Margen % sobre el ingreso de productos con costo. */
  marginPct: number | null;
  /** Ingreso de productos que SÍ tienen costo (base del margen). */
  costedRevenue: number;
  avgTicket: number;
  series: DayRevenue[];
  byChannel: Split[];
  byPayment: Split[];
  byZone: Split[];
  topByRevenue: ReportProduct[];
  topByProfit: ReportProduct[];
}

const CHANNEL_LABEL: Record<string, string> = {
  PICKUP: 'Para llevar',
  DELIVERY: 'A domicilio',
  DINE_IN: 'En el local',
};

const EMPTY = (from: string, to: string): SalesReport => ({
  from, to, orders: 0, revenue: 0, productRevenue: 0, deliveryRevenue: 0, tips: 0,
  cost: 0, profit: 0, marginPct: null, costedRevenue: 0, avgTicket: 0,
  series: [], byChannel: [], byPayment: [], byZone: [], topByRevenue: [], topByProfit: [],
});

/** jsonb crudo que devuelve leogin_sales_report (mig. 098). */
export type RawSplit = { key: string; orders: number; revenue: number };
export type RawDay = { date: string; orders: number; revenue: number };
export type RawProduct = { name: string; qty: number; revenue: number; cost: number; profit: number; hasCost: boolean };
export interface RawSalesReport {
  orders: number;
  revenue: number;
  productRevenue: number;
  deliveryRevenue: number;
  tips: number;
  cost: number;
  costedRevenue: number;
  series: RawDay[];
  byChannel: RawSplit[];
  byPayment: RawSplit[];
  byZone: RawSplit[];
  topByRevenue: RawProduct[];
  topByProfit: RawProduct[];
}

/** "YYYY-MM-DD" → "dd mmm" en español (fallback "MM-DD" si el locale falla). */
function dayLabel(dateKey: string): string {
  try {
    return new Date(`${dateKey}T12:00:00Z`).toLocaleDateString('es', {
      day: '2-digit', month: 'short', timeZone: 'UTC',
    });
  } catch {
    return dateKey.slice(5);
  }
}

function mapSplit(rows: RawSplit[] | null | undefined, label: (key: string) => string): Split[] {
  return (rows ?? []).map((r) => ({
    key: r.key, label: label(r.key), orders: Number(r.orders), revenue: Number(r.revenue),
  }));
}

function mapProducts(rows: RawProduct[] | null | undefined): ReportProduct[] {
  return (rows ?? []).map((r) => ({
    name: r.name, qty: Number(r.qty), revenue: Number(r.revenue), cost: Number(r.cost),
    profit: Number(r.profit), hasCost: Boolean(r.hasCost),
  }));
}

/** IANA válido o no: mismo criterio que updateRestaurantOps al guardar. Evita que un
 *  timezone corrupto/viejo tumbe el RPC (Postgres lanza error en AT TIME ZONE inválido). */
function safeTimezone(tz: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'America/Guatemala';
  }
}

/**
 * Da forma al jsonb crudo de leogin_sales_report: números (jsonb no distingue
 * int/numeric), formatea etiquetas y deriva profit/marginPct/avgTicket.
 * Función pura — separada de getSalesReport para poder probarla sin mockear
 * Supabase (ver reports.test.ts).
 */
export function buildSalesReport(from: string, to: string, d: RawSalesReport): SalesReport {
  const orders = Number(d.orders ?? 0);
  const revenue = Number(d.revenue ?? 0);
  const cost = Number(d.cost ?? 0);
  const costedRevenue = Number(d.costedRevenue ?? 0);
  const profit = costedRevenue - cost;

  return {
    from, to, orders, revenue,
    productRevenue: Number(d.productRevenue ?? 0),
    deliveryRevenue: Number(d.deliveryRevenue ?? 0),
    tips: Number(d.tips ?? 0),
    cost, profit, costedRevenue,
    marginPct: costedRevenue > 0 ? (profit / costedRevenue) * 100 : null,
    avgTicket: orders > 0 ? revenue / orders : 0,
    series: (d.series ?? []).map((r) => ({
      date: r.date, label: dayLabel(r.date), revenue: Number(r.revenue), orders: Number(r.orders),
    })),
    byChannel: mapSplit(d.byChannel, (key) => CHANNEL_LABEL[key] ?? key),
    byPayment: mapSplit(d.byPayment, (key) => (key === 'CASH' ? 'Efectivo' : key)),
    byZone: mapSplit(d.byZone, (key) => key),
    topByRevenue: mapProducts(d.topByRevenue),
    topByProfit: mapProducts(d.topByProfit),
  };
}

/**
 * Reporte de ventas entre dos fechas locales (YYYY-MM-DD) del restaurante.
 * Excluye pedidos cancelados. Los cortes de día usan la zona horaria del local.
 */
export async function getSalesReport(
  restaurantId: string,
  from: string,
  to: string,
  timezone: string = 'America/Guatemala',
): Promise<SalesReport> {
  if (!/^[0-9a-f-]{36}$/i.test(restaurantId)) return EMPTY(from, to);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return EMPTY(from, to);
  }

  const db = createServiceClient();
  const { data, error } = await db.rpc('leogin_sales_report', {
    p_restaurant_id: restaurantId,
    p_from: from,
    p_to: to,
    p_timezone: safeTimezone(timezone),
  });

  if (error || !data) return EMPTY(from, to);

  return buildSalesReport(from, to, data as RawSalesReport);
}
