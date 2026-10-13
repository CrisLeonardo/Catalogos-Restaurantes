import { createServiceClient } from '@/lib/supabase/service';
import { diaDeNegocio } from '@/lib/caja/dia';
import { corteDelRestaurante } from '@/lib/db/dia-negocio';

/* ============================================================
   ANALÍTICA AVANZADA — Fase B (Admin Pro)
   ------------------------------------------------------------
   Operación y comportamiento (complementa a /admin/finanzas, que
   ve el dinero): horas pico, velocidad de productos, tasa de
   cancelación y tiempos de preparación/entrega.
   Capa de datos pura (service role); el llamador valida sesión.
   ============================================================ */

export type HeatCell = { day: number; hour: number; count: number };
export type Velocity = { name: string; qty: number };
export type CountSplit = { key: string; label: string; count: number };

export interface Analytics {
  from: string;
  to: string;
  totalOrders: number;     // incluye cancelados
  validOrders: number;     // sin cancelados
  cancelled: number;
  cancelRate: number;      // % sobre el total
  /** Mapa de calor 7×24 (día de semana 0=Dom × hora local). */
  heat: HeatCell[];
  heatMax: number;
  peakLabel: string | null;     // "Vie 13:00" la franja más activa
  busiestWeekday: string | null;
  topSellers: Velocity[];
  deadStock: Velocity[];        // productos con menos (o cero) ventas
  byChannel: CountSplit[];
  byPayment: CountSplit[];
  byZone: CountSplit[];
  avgPrepMin: number | null;    // NEW → READY
  avgDeliveryMin: number | null;// NEW → DELIVERED (solo domicilio)
  prepSamples: number;
  deliverySamples: number;
}

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const CHANNEL_LABEL: Record<string, string> = {
  PICKUP: 'Para llevar', DELIVERY: 'A domicilio', DINE_IN: 'En el local',
};

const EMPTY = (from: string, to: string): Analytics => ({
  from, to, totalOrders: 0, validOrders: 0, cancelled: 0, cancelRate: 0,
  heat: [], heatMax: 0, peakLabel: null, busiestWeekday: null,
  topSellers: [], deadStock: [], byChannel: [], byPayment: [], byZone: [],
  avgPrepMin: null, avgDeliveryMin: null, prepSamples: 0, deliverySamples: 0,
});

type Row = {
  created_at: string;
  order_type: string;
  payment_method: string | null;
  delivery_zone: string | null;
  status: string;
  ready_at: string | null;
  delivered_at: string | null;
  items: { name_snapshot: string; quantity: number }[] | null;
};

/** Hora local 0–23 del restaurante. */
function localHour(d: Date, tz: string): number {
  try {
    const s = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hour: '2-digit', hour12: false, hourCycle: 'h23',
    }).format(d);
    const n = parseInt(s, 10);
    return isNaN(n) ? 0 : n % 24;
  } catch { return d.getHours(); }
}

export async function getAnalytics(
  restaurantId: string,
  from: string,
  to: string,
  timezone: string = 'America/Guatemala',
): Promise<Analytics> {
  if (!/^[0-9a-f-]{36}$/i.test(restaurantId)) return EMPTY(from, to);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return EMPTY(from, to);

  const db = createServiceClient();
  const sinceUtc = new Date(`${from}T00:00:00Z`); sinceUtc.setUTCDate(sinceUtc.getUTCDate() - 1);
  const untilUtc = new Date(`${to}T00:00:00Z`); untilUtc.setUTCDate(untilUtc.getUTCDate() + 2);

  const [{ data: orderData }, { data: productData }] = await Promise.all([
    db.from('orders')
      .select('created_at, order_type, payment_method, delivery_zone, status, ready_at, delivered_at, items:order_items(name_snapshot, quantity)')
      .eq('restaurant_id', restaurantId)
      .gte('created_at', sinceUtc.toISOString())
      .lte('created_at', untilUtc.toISOString())
      .limit(20000),
    db.from('products').select('name').eq('restaurant_id', restaurantId).limit(2000),
  ]);

  const rows = (orderData ?? []) as Row[];

  // Filtrar al rango exacto de días de NEGOCIO (migración 143): el pedido
  // de la 1:30 es del día anterior, igual que en la caja y en el reporte.
  const corte = await corteDelRestaurante(restaurantId);
  const fromKey = from, toKey = to;
  const inRange = (d: Date) => { const k = diaDeNegocio(d, timezone, corte); return k >= fromKey && k <= toKey; };

  const heatMap = new Map<string, number>();   // "day-hour" → count
  const weekdayCount = new Array(7).fill(0);
  const sellMap = new Map<string, number>();
  const channel = new Map<string, number>();
  const payment = new Map<string, number>();
  const zone = new Map<string, number>();

  let totalOrders = 0, cancelled = 0;
  let prepSum = 0, prepN = 0, delSum = 0, delN = 0;

  for (const o of rows) {
    const created = new Date(o.created_at);
    if (!inRange(created)) continue;
    totalOrders += 1;

    const isCancel = o.status === 'CANCEL';
    if (isCancel) cancelled += 1;

    // Heatmap + día de semana (sobre TODOS los pedidos del rango).
    const key = diaDeNegocio(created, timezone, corte);
    const wd = new Date(`${key}T12:00:00Z`).getUTCDay();
    const hr = localHour(created, timezone);
    weekdayCount[wd] += 1;
    const hk = `${wd}-${hr}`;
    heatMap.set(hk, (heatMap.get(hk) ?? 0) + 1);

    if (!isCancel) {
      const ch = o.order_type;
      channel.set(ch, (channel.get(ch) ?? 0) + 1);
      const pm = (o.payment_method || 'CASH').toUpperCase();
      payment.set(pm, (payment.get(pm) ?? 0) + 1);
      if (o.delivery_zone) zone.set(o.delivery_zone, (zone.get(o.delivery_zone) ?? 0) + 1);

      for (const it of o.items ?? []) {
        sellMap.set(it.name_snapshot, (sellMap.get(it.name_snapshot) ?? 0) + Number(it.quantity));
      }

      // Tiempos (minutos) — solo donde hay marca de tiempo (pedidos nuevos).
      if (o.ready_at) {
        const m = (new Date(o.ready_at).getTime() - created.getTime()) / 60000;
        if (m >= 0 && m < 1440) { prepSum += m; prepN += 1; }
      }
      if (o.delivered_at && o.order_type === 'DELIVERY') {
        const m = (new Date(o.delivered_at).getTime() - created.getTime()) / 60000;
        if (m >= 0 && m < 1440) { delSum += m; delN += 1; }
      }
    }
  }

  const heat: HeatCell[] = [...heatMap.entries()].map(([k, count]) => {
    const [day, hour] = k.split('-').map(Number);
    return { day, hour, count };
  });
  const heatMax = heat.reduce((m, c) => Math.max(m, c.count), 0);

  // Franja pico.
  let peakLabel: string | null = null;
  if (heat.length) {
    const top = heat.reduce((a, b) => (b.count > a.count ? b : a));
    peakLabel = `${WEEKDAYS[top.day]} ${String(top.hour).padStart(2, '0')}:00`;
  }
  let busiestWeekday: string | null = null;
  if (totalOrders > 0) {
    let bi = 0; for (let i = 1; i < 7; i++) if (weekdayCount[i] > weekdayCount[bi]) bi = i;
    if (weekdayCount[bi] > 0) busiestWeekday = WEEKDAYS[bi];
  }

  // Velocidad de productos: top y "no se mueven" (incluye productos con 0 ventas).
  const allProducts = (productData ?? []).map((p) => p.name as string);
  const velocity: Velocity[] = allProducts.map((name) => ({ name, qty: sellMap.get(name) ?? 0 }));
  // productos vendidos pero ya borrados del catálogo: agréguialos también al top.
  for (const [name, qty] of sellMap) {
    if (!allProducts.includes(name)) velocity.push({ name, qty });
  }
  const topSellers = [...velocity].filter((v) => v.qty > 0).sort((a, b) => b.qty - a.qty).slice(0, 10);
  const deadStock = [...velocity].sort((a, b) => a.qty - b.qty).slice(0, 10);

  const mkSplit = (m: Map<string, number>, labeler: (k: string) => string): CountSplit[] =>
    [...m.entries()].map(([key, count]) => ({ key, label: labeler(key), count })).sort((a, b) => b.count - a.count);

  return {
    from, to,
    totalOrders,
    validOrders: totalOrders - cancelled,
    cancelled,
    cancelRate: totalOrders > 0 ? (cancelled / totalOrders) * 100 : 0,
    heat, heatMax, peakLabel, busiestWeekday,
    topSellers, deadStock,
    byChannel: mkSplit(channel, (k) => CHANNEL_LABEL[k] ?? k),
    byPayment: mkSplit(payment, (k) => (k === 'CASH' ? 'Efectivo' : k)),
    byZone: mkSplit(zone, (k) => k),
    avgPrepMin: prepN > 0 ? prepSum / prepN : null,
    avgDeliveryMin: delN > 0 ? delSum / delN : null,
    prepSamples: prepN,
    deliverySamples: delN,
  };
}
