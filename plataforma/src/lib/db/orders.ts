import { createServiceClient } from '@/lib/supabase/service';
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
}

export async function getOrderStats(restaurantId: string): Promise<OrderStats> {
  const db = createServiceClient();

  // 14-day window (day -13 to today)
  const since = new Date();
  since.setDate(since.getDate() - 13);
  since.setHours(0, 0, 0, 0);

  const [ordersRes, itemsRes] = await Promise.all([
    db
      .from('orders')
      .select('created_at, total')
      .eq('restaurant_id', restaurantId)
      .neq('status', 'CANCEL')
      .gte('created_at', since.toISOString()),
    // Today's items via a join filter — fetch orders first, then items
    db
      .from('orders')
      .select('id')
      .eq('restaurant_id', restaurantId)
      .neq('status', 'CANCEL')
      .gte('created_at', todayStart()),
  ]);

  // Build 14-day bar series
  const rawOrders = ordersRes.data ?? [];
  const todayIds  = (itemsRes.data ?? []).map((o: { id: string }) => o.id);

  const series: DaySale[] = [];
  const today = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(today.getDate() - i);
    const dateStr  = d.toISOString().slice(0, 10);
    const dayTotal = rawOrders
      .filter((o) => o.created_at.startsWith(dateStr))
      .reduce((s, o) => s + Number(o.total), 0);
    const short = d.toLocaleDateString('es', { weekday: 'short' });
    const label = short.charAt(0).toUpperCase() + short.slice(1, 2);
    series.push({ label, total: dayTotal, isToday: i === 0 });
  }

  const totalLast14 = rawOrders.reduce((s, o) => s + Number(o.total), 0);

  // Top products today
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

  return { series, topToday, totalLast14 };
}

function todayStart(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
