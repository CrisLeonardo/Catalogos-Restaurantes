'use server';

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { revalidatePath } from 'next/cache';
import { createOrderSchema } from '@/lib/schemas';
import type { OrderStatus } from '@/types';

export interface CreateOrderResult {
  success?: boolean;
  orderId?: string;
  orderNumber?: string;
  error?: string;
}

export async function createOrder(
  rawInput: unknown,
): Promise<CreateOrderResult> {
  const parsed = createOrderSchema.safeParse(rawInput);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return { error: first?.message ?? 'Datos del pedido inválidos.' };
  }

  const { restaurantId, items, customer, deliveryFee } = parsed.data;
  const db = createServiceClient();

  const { data: restaurant } = await db
    .from('restaurants')
    .select('id, modules, status, whatsapp_number')
    .eq('id', restaurantId)
    .single();

  if (!restaurant) return { error: 'Restaurante no encontrado.' };
  if (restaurant.status !== 'active')
    return { error: 'El restaurante no está disponible.' };

  const modules = restaurant.modules as { orders?: boolean } | null;
  if (!modules?.orders)
    return { error: 'Este restaurante no acepta pedidos en línea.' };

  const { data: orderNumber } = await db.rpc('generate_order_number', {
    p_restaurant_id: restaurantId,
  });

  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const fee = customer.type === 'DELIVERY' ? (deliveryFee ?? 0) : 0;
  const total = subtotal + fee;

  const { data: order, error: orderError } = await db
    .from('orders')
    .insert({
      restaurant_id:  restaurantId,
      order_number:   orderNumber ?? 'ORD-???',
      customer_name:  customer.name,
      customer_phone: customer.phone,
      order_type:     customer.type,
      address:        customer.address ?? null,
      payment_method: 'CASH',
      status:         'NEW',
      subtotal,
      delivery_fee:   fee,
      total,
      notes:          customer.notes ?? null,
    })
    .select('id, order_number')
    .single();

  if (orderError || !order) {
    return { error: orderError?.message ?? 'Error al crear el pedido.' };
  }

  const { error: itemsError } = await db.from('order_items').insert(
    items.map((i) => ({
      order_id:       order.id,
      product_id:     i.productId,
      name_snapshot:  i.name,
      price_snapshot: i.price,
      quantity:       i.quantity,
      subtotal:       i.price * i.quantity,
    })),
  );

  if (itemsError) return { error: itemsError.message };

  return { success: true, orderId: order.id, orderNumber: order.order_number };
}

export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus,
): Promise<{ error?: string }> {
  if (!orderId) return { error: 'ID de pedido requerido.' };

  const validStatuses: OrderStatus[] = [
    'NEW', 'PREP', 'READY', 'TRANSIT', 'DELIVERED', 'CANCEL',
  ];
  if (!validStatuses.includes(status)) return { error: 'Estado inválido.' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'No autorizado.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, restaurant_id')
    .eq('id', user.id)
    .single();

  if (!profile) return { error: 'No autorizado.' };

  const validRoles = ['SUPER_ADMIN', 'RESTAURANT_OWNER', 'RESTAURANT_STAFF'];
  if (!validRoles.includes(profile.role)) return { error: 'No autorizado.' };

  const db = profile.role === 'SUPER_ADMIN' ? createServiceClient() : supabase;

  const { error } = await db
    .from('orders')
    .update({ status })
    .eq('id', orderId);

  if (error) return { error: error.message };

  revalidatePath('/admin/pedidos');
  return {};
}
