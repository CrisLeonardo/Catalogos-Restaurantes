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
