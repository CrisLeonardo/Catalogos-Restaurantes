import { createServiceClient } from '@/lib/supabase/service';
import type { Customer, Order } from '@/types';

/* Lecturas del registro de clientes para el panel del dueño.
   Como el resto de src/lib/db, usa el service role: las páginas
   que llaman ya validaron la sesión y el restaurante del admin. */

export async function getCustomers(restaurantId: string): Promise<Customer[]> {
  const db = createServiceClient();
  const { data } = await db
    .from('customers')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('last_order_at', { ascending: false, nullsFirst: false })
    .limit(500);

  return (data ?? []) as Customer[];
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
