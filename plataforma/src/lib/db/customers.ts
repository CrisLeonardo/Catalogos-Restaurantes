import { createServiceClient } from '@/lib/supabase/service';
import type { Customer, Order } from '@/types';

/* Lecturas del registro de clientes para el panel del dueño.
   Como el resto de src/lib/db, usa el service role: las páginas
   que llaman ya validaron la sesión y el restaurante del admin. */

export async function getCustomers(restaurantId: string): Promise<Customer[]> {
  const db = createServiceClient();
  const [{ data: customers }, { data: delivered }] = await Promise.all([
    db
      .from('customers')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('last_order_at', { ascending: false, nullsFirst: false })
      .limit(500),
    // Solo pedidos entregados para los totales (cancelados no cuentan).
    db
      .from('orders')
      .select('customer_id, total')
      .eq('restaurant_id', restaurantId)
      .eq('status', 'DELIVERED')
      .not('customer_id', 'is', null),
  ]);

  const deliveredMap = new Map<string, { orders: number; spent: number }>();
  for (const o of delivered ?? []) {
    const cid = o.customer_id as string;
    const curr = deliveredMap.get(cid) ?? { orders: 0, spent: 0 };
    curr.orders++;
    curr.spent += Number(o.total);
    deliveredMap.set(cid, curr);
  }

  return (customers ?? []).map((c) => {
    const d = deliveredMap.get(c.id as string) ?? { orders: 0, spent: 0 };
    return { ...c, total_orders: d.orders, total_spent: d.spent };
  }) as Customer[];
}

export async function getCustomerOrders(
  restaurantId: string,
  customerId: string,
): Promise<Order[]> {
  const db = createServiceClient();
  const { data } = await db
    .from('orders')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(50);

  return (data ?? []) as Order[];
}
