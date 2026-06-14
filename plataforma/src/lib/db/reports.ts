import { createServiceClient } from '@/lib/supabase/service';
import { localDateKey } from '@/lib/hours';

/* ============================================================
   REPORTES FINANCIEROS — Fase A (Admin Pro)
   ------------------------------------------------------------
   Resumen de ventas, utilidad y margen en un rango de fechas.
   Capa de datos pura (service role); la página/acción que llama
   ya validó la sesión y el restaurante (mismo modelo que
   db/orders.ts · getOrderStats).
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
  from, to, orders: 0, revenue: 0, productRevenue: 0, deliveryRevenue: 0,
  cost: 0, profit: 0, marginPct: null, costedRevenue: 0, avgTicket: 0,
  series: [], byChannel: [], byPayment: [], byZone: [], topByRevenue: [], topByProfit: [],
});

type OrderRow = {
  created_at: string;
  order_type: string;
  payment_method: string | null;
  delivery_zone: string | null;
  subtotal: number;
  delivery_fee: number;
  total: number;
  items: {
    name_snapshot: string;
    price_snapshot: number;
    cost_snapshot: number | null;
    quantity: number;
    subtotal: number;
  }[] | null;
};

/** Lista de claves YYYY-MM-DD entre `from` y `to` (inclusive) en orden. */
function dateKeysBetween(from: string, to: string): string[] {
  const keys: string[] = [];
  const start = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  for (let d = start; d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    keys.push(d.toISOString().slice(0, 10));
  }
  return keys;
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

  // Margen de ±1 día en UTC para cubrir el desfase con la hora local; luego
  // filtramos por la clave de día local exacta.
  const sinceUtc = new Date(`${from}T00:00:00Z`);
  sinceUtc.setUTCDate(sinceUtc.getUTCDate() - 1);
  const untilUtc = new Date(`${to}T00:00:00Z`);
  untilUtc.setUTCDate(untilUtc.getUTCDate() + 2);

  const { data } = await db
    .from('orders')
    .select('created_at, order_type, payment_method, delivery_zone, subtotal, delivery_fee, total, items:order_items(name_snapshot, price_snapshot, cost_snapshot, quantity, subtotal)')
    .eq('restaurant_id', restaurantId)
    .neq('status', 'CANCEL')
    .gte('created_at', sinceUtc.toISOString())
    .lte('created_at', untilUtc.toISOString())
    .limit(20000);

  const rows = (data ?? []) as OrderRow[];
  const keys = dateKeysBetween(from, to);
  const inRange = new Set(keys);

  // Acumuladores
  const byDay = new Map<string, { revenue: number; orders: number }>();
  const byChannel = new Map<string, { orders: number; revenue: number }>();
  const byPayment = new Map<string, { orders: number; revenue: number }>();
  const byZone = new Map<string, { orders: number; revenue: number }>();
  const byProduct = new Map<string, ReportProduct>();

  let orders = 0, revenue = 0, productRevenue = 0, deliveryRevenue = 0;
  let cost = 0, costedRevenue = 0;

  for (const o of rows) {
    const key = localDateKey(new Date(o.created_at), timezone);
    if (!inRange.has(key)) continue;

    orders += 1;
    revenue += Number(o.total);
    productRevenue += Number(o.subtotal);
    deliveryRevenue += Number(o.delivery_fee);

    const day = byDay.get(key) ?? { revenue: 0, orders: 0 };
    day.revenue += Number(o.total);
    day.orders += 1;
    byDay.set(key, day);

    const ch = byChannel.get(o.order_type) ?? { orders: 0, revenue: 0 };
    ch.orders += 1; ch.revenue += Number(o.total);
    byChannel.set(o.order_type, ch);

    const pm = (o.payment_method || 'CASH').toUpperCase();
    const pay = byPayment.get(pm) ?? { orders: 0, revenue: 0 };
    pay.orders += 1; pay.revenue += Number(o.total);
    byPayment.set(pm, pay);

    if (o.delivery_zone) {
      const z = byZone.get(o.delivery_zone) ?? { orders: 0, revenue: 0 };
      z.orders += 1; z.revenue += Number(o.total);
      byZone.set(o.delivery_zone, z);
    }

    for (const it of o.items ?? []) {
      const lineRevenue = Number(it.subtotal);
      const qty = Number(it.quantity);
      const hasCost = it.cost_snapshot != null;
      const lineCost = hasCost ? Number(it.cost_snapshot) * qty : 0;

      const p = byProduct.get(it.name_snapshot) ?? {
        name: it.name_snapshot, qty: 0, revenue: 0, cost: 0, profit: 0, hasCost: false,
      };
      p.qty += qty;
      p.revenue += lineRevenue;
      p.cost += lineCost;
      p.hasCost = p.hasCost || hasCost;
      p.profit = p.revenue - p.cost;
      byProduct.set(it.name_snapshot, p);

      if (hasCost) {
        cost += lineCost;
        costedRevenue += lineRevenue;
      }
    }
  }

  const profit = costedRevenue - cost;
  const marginPct = costedRevenue > 0 ? (profit / costedRevenue) * 100 : null;

  const series: DayRevenue[] = keys.map((k) => {
    let label = k.slice(5); // MM-DD
    try {
      label = new Date(`${k}T12:00:00Z`).toLocaleDateString('es', {
        day: '2-digit', month: 'short', timeZone: 'UTC',
      });
    } catch {}
    const d = byDay.get(k);
    return { date: k, label, revenue: d?.revenue ?? 0, orders: d?.orders ?? 0 };
  });

  const products = [...byProduct.values()];

  return {
    from, to, orders, revenue, productRevenue, deliveryRevenue,
    cost, profit, marginPct, costedRevenue,
    avgTicket: orders > 0 ? revenue / orders : 0,
    series,
    byChannel: [...byChannel.entries()]
      .map(([key, v]) => ({ key, label: CHANNEL_LABEL[key] ?? key, ...v }))
      .sort((a, b) => b.revenue - a.revenue),
    byPayment: [...byPayment.entries()]
      .map(([key, v]) => ({ key, label: key === 'CASH' ? 'Efectivo' : key, ...v }))
      .sort((a, b) => b.revenue - a.revenue),
    byZone: [...byZone.entries()]
      .map(([key, v]) => ({ key, label: key, ...v }))
      .sort((a, b) => b.revenue - a.revenue),
    topByRevenue: [...products].sort((a, b) => b.revenue - a.revenue).slice(0, 12),
    topByProfit: products.filter((p) => p.hasCost).sort((a, b) => b.profit - a.profit).slice(0, 12),
  };
}
