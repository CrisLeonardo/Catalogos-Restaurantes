import { createServiceClient } from '@/lib/supabase/service';
import { localDateKey } from '@/lib/hours';
import type { Order, OrderItem } from '@/types';

export type OrderWithItems = Order & { items: OrderItem[] };

export async function getRestaurantOrders(
  restaurantId: string,
): Promise<OrderWithItems[]> {
  const db = createServiceClient();
  const { data } = await db
    .from('orders')
    .select('*, items:order_items(*)')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })
    .limit(100);

  return (data ?? []) as OrderWithItems[];
}

export type DaySale    = { label: string; total: number; isToday: boolean };
export type TopProduct = { name: string; qty: number };

export interface OrderStats {
  series:   DaySale[];
  topToday: TopProduct[];
  totalLast14: number;
  /** KPIs de HOY según la zona horaria del restaurante (no "últimos 100"). */
  todaySales: number;
  todayOrders: number;
  todayTicket: number;
}

/**
 * Estadísticas de ventas. TODOS los cortes de día usan la zona horaria del
 * restaurante: un pedido de las 7 p.m. en Guatemala cuenta para ese día,
 * aunque en UTC ya sea el siguiente.
 */
export async function getOrderStats(
  restaurantId: string,
  timezone: string = 'America/Guatemala',
): Promise<OrderStats> {
  const db = createServiceClient();

  // Ventana de 14 días: margen de 1 día extra para cubrir el desfase UTC↔local.
  const since = new Date();
  since.setDate(since.getDate() - 14);
  since.setHours(0, 0, 0, 0);

  const { data } = await db
    .from('orders')
    .select('id, created_at, total')
    .eq('restaurant_id', restaurantId)
    .neq('status', 'CANCEL')
    .gte('created_at', since.toISOString());

  const rawOrders = data ?? [];
  const now = new Date();
  const todayKey = localDateKey(now, timezone);

  // Total por día local (clave YYYY-MM-DD en la zona del restaurante).
  const byDay = new Map<string, number>();
  const todayIds: string[] = [];
  let todaySales = 0;
  for (const o of rawOrders) {
    const key = localDateKey(new Date(o.created_at as string), timezone);
    byDay.set(key, (byDay.get(key) ?? 0) + Number(o.total));
    if (key === todayKey) {
      todayIds.push(o.id as string);
      todaySales += Number(o.total);
    }
  }

  // Serie de 14 días terminando hoy (en hora local del restaurante).
  const series: DaySale[] = [];
  let totalLast14 = 0;
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = localDateKey(d, timezone);
    const dayTotal = byDay.get(key) ?? 0;
    totalLast14 += dayTotal;
    let label: string;
    try {
      const short = d.toLocaleDateString('es', { weekday: 'short', timeZone: timezone });
      label = short.charAt(0).toUpperCase() + short.slice(1, 2);
    } catch {
      label = '·';
    }
    series.push({ label, total: dayTotal, isToday: i === 0 });
  }

  // Top de productos de hoy.
  let topToday: TopProduct[] = [];
  if (todayIds.length > 0) {
    const { data: items } = await db
      .from('order_items')
      .select('name_snapshot, quantity')
      .in('order_id', todayIds);

    const map: Record<string, number> = {};
    (items ?? []).forEach((it: { name_snapshot: string; quantity: number }) => {
      map[it.name_snapshot] = (map[it.name_snapshot] ?? 0) + it.quantity;
    });
    topToday = Object.entries(map)
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
  }

  const todayOrders = todayIds.length;
  return {
    series,
    topToday,
    totalLast14,
    todaySales,
    todayOrders,
    todayTicket: todayOrders > 0 ? todaySales / todayOrders : 0,
  };
}
