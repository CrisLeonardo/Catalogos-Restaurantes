/* ============================================================
   POST /api/agent/offline-orders
   El hub local manda acá los pedidos que tomó sin conexión (ya
   impresos localmente) para sincronizarlos con la nube. Autenticación:
   Authorization: Bearer <token-del-agente> (igual que /poll y /ack).

   Body: { orders: unknown[] } — cada uno con la misma forma que
   createOrderSchema (lo que checkout-form.tsx ya arma para createOrder;
   el hub reusa ese mismo payload). rewardLines/couponCode se ignoran
   aquí: el hub no soporta cupones ni lealtad sin conexión.

   Cada pedido se re-valida contra la BD REAL (nunca se confía en el
   snapshot del hub, que puede estar desactualizado) y se crea vía
   place_order, idempotente por client_id (migración 061) — reintentar
   el envío de un pedido ya sincronizado no lo duplica.

   IMPORTANTE: NO se encola comanda de cocina aquí (enqueueKitchenForOrder)
   — el hub YA imprimió la comanda al instante cuando aceptó el pedido;
   hacerlo de nuevo sería una impresión duplicada.

   Respuesta: { results: [{ clientId, ok, orderId?, orderNumber?, error? }] }
   ============================================================ */

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { authenticateAgent, type AgentIdentity } from '@/lib/print-agent';
import { createOrderSchema } from '@/lib/schemas';
import { resolveItemOptions } from '@/lib/order-options';
import { isUnavailable } from '@/lib/product-availability';
import { resolveTheme, computeTip, type ThemeRow } from '@/lib/theme/resolve';
import { sendPushToRestaurant } from '@/lib/push';
import type { ProductOptionGroup, OrderItemOption } from '@/types';

export const runtime = 'nodejs';

type Db = ReturnType<typeof createServiceClient>;

interface SyncResult {
  clientId: string | null;
  ok: boolean;
  orderId?: string;
  orderNumber?: string;
  error?: string;
}

async function syncOne(db: Db, agent: AgentIdentity, rawOrder: unknown): Promise<SyncResult> {
  const parsed = createOrderSchema.safeParse(rawOrder);
  if (!parsed.success) {
    // Aún inválido, devolver el clientId crudo si viene: sin él, el agente no
    // puede marcar el pedido como fallido y lo reintentaría cada 60s para
    // siempre (mensaje envenenado en la cola del hub).
    const rawClientId = (rawOrder as { clientId?: unknown } | null)?.clientId;
    return {
      clientId: typeof rawClientId === 'string' ? rawClientId : null,
      ok: false,
      error: parsed.error.errors[0]?.message ?? 'Datos inválidos.',
    };
  }
  const { restaurantId, items, customer, paymentMethod, cashAmount, tipAccepted, clientId, waiterId } = parsed.data;

  if (restaurantId !== agent.restaurantId) {
    return { clientId: clientId ?? null, ok: false, error: 'El pedido no pertenece a este restaurante.' };
  }
  if (!clientId) {
    return { clientId: null, ok: false, error: 'Falta clientId — no se puede sincronizar de forma segura.' };
  }

  // Idempotente: si este client_id ya sincronizó, no repetir nada (ni
  // siquiera la lectura de productos) — solo confirmar que ya existe.
  const { data: existing } = await db
    .from('orders')
    .select('id, order_number')
    .eq('client_id', clientId)
    .maybeSingle();
  if (existing) {
    return { clientId, ok: true, orderId: existing.id as string, orderNumber: existing.order_number as string };
  }

  const { data: restaurant } = await db
    .from('restaurants')
    .select('id, modules, status')
    .eq('id', restaurantId)
    .single();
  if (!restaurant) return { clientId, ok: false, error: 'Restaurante no encontrado.' };
  if (restaurant.status !== 'active') return { clientId, ok: false, error: 'El restaurante no está activo.' };
  const modules = restaurant.modules as { orders?: boolean } | null;
  if (!modules?.orders) return { clientId, ok: false, error: 'Este restaurante no acepta pedidos.' };

  // Precios/disponibilidad autoritativos: SIEMPRE se leen de la BD real,
  // nunca del snapshot que el hub tenía cacheado al tomar el pedido.
  const productIds = [...new Set(items.map((i) => i.productId))];
  const { data: dbProducts, error: productsError } = await db
    .from('products')
    .select('id, name, price, cost, is_available, unavailable_at, track_stock, stock, options')
    .eq('restaurant_id', restaurantId)
    .in('id', productIds);
  if (productsError) return { clientId, ok: false, error: productsError.message };
  // Misma regla que el menú y que createOrder (lib/product-availability.ts).
  const ahora = Date.now();

  const productById = new Map((dbProducts ?? []).map((p) => [p.id as string, p]));
  const verifiedItems: {
    productId: string; name: string; price: number; cost: number | null;
    quantity: number; options: OrderItemOption[]; note?: string;
  }[] = [];

  for (const item of items) {
    const product = productById.get(item.productId);
    if (!product || isUnavailable(product, ahora)) {
      return { clientId, ok: false, error: `"${item.name}" ya no está disponible.` };
    }
    const resolvedOpts = resolveItemOptions(
      product.options as ProductOptionGroup[] | null,
      item.options,
      product.name as string,
    );
    if ('error' in resolvedOpts) return { clientId, ok: false, error: resolvedOpts.error };

    verifiedItems.push({
      productId: product.id as string,
      name: product.name as string,
      price: Number(product.price) + resolvedOpts.delta,
      cost: product.cost != null ? Number(product.cost) : null,
      quantity: item.quantity,
      options: resolvedOpts.snapshot,
      note: item.note,
    });
  }

  const { data: themeRow } = await db
    .from('restaurant_themes')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .single();
  const themeConfig = resolveTheme((themeRow as ThemeRow) ?? null).config;

  const subtotal = verifiedItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const fee = customer.type === 'DELIVERY' ? Math.max(0, Number(themeConfig.deliveryFee) || 0) : 0;
  const tip = computeTip(themeConfig, customer.type, tipAccepted, subtotal);
  const total = Math.max(0, subtotal + fee + tip);

  const address =
    customer.type === 'DINE_IN'
      ? (customer.tableNumber !== undefined ? `Mesa ${customer.tableNumber}` : null)
      : (customer.address ?? null);
  const notes =
    customer.type === 'DINE_IN' && customer.coursePreference
      ? `[Servicio: ${customer.coursePreference}]${customer.notes ? ` · ${customer.notes}` : ''}`
      : (customer.notes ?? null);

  const { data: placed, error: orderError } = await db.rpc('place_order', {
    p_restaurant_id:  restaurantId,
    p_customer_name:  customer.name,
    p_customer_phone: customer.phone || '00000000',
    p_order_type:     customer.type,
    p_address:        address,
    p_delivery_zone:  customer.type === 'DELIVERY' && customer.zone ? customer.zone : null,
    p_delivery_lat:   customer.type === 'DELIVERY' && customer.deliveryLat !== undefined ? customer.deliveryLat : null,
    p_delivery_lng:   customer.type === 'DELIVERY' && customer.deliveryLng !== undefined ? customer.deliveryLng : null,
    p_customer_id:    null,
    p_subtotal:       subtotal,
    p_delivery_fee:   fee,
    p_total:          total,
    p_notes:          notes,
    p_payment_method: customer.type === 'DINE_IN' ? 'CASH' : (paymentMethod ?? 'CASH'),
    p_cash_amount:    customer.type === 'DELIVERY' && (paymentMethod ?? 'CASH') === 'CASH' && cashAmount != null ? cashAmount : null,
    p_tip:            tip,
    p_client_id:      clientId,
    p_waiter_id:      waiterId ?? null,
    p_items: verifiedItems.map((i) => ({
      product_id:       i.productId,
      name_snapshot:    i.name,
      price_snapshot:   i.price,
      cost_snapshot:    i.cost,
      quantity:         i.quantity,
      subtotal:         i.price * i.quantity,
      options_snapshot: i.options.length > 0 ? i.options : null,
      note:             i.note || null,
    })),
  });

  const order = placed as { id: string; order_number: string } | null;
  if (orderError || !order) {
    return { clientId, ok: false, error: orderError?.message ?? 'Error al crear el pedido.' };
  }

  // Marca de reconciliación: este pedido se tomó sin conexión. NO se
  // encola comanda de cocina — el hub ya la imprimió al aceptarlo.
  //
  // Y por eso mismo entra ya como PREP, no como NEW: si quedara "sin
  // confirmar", el panel ofrecería un botón "Confirmar" que mandaría la
  // comanda por SEGUNDA vez (el candado anti-duplicado no puede saberlo: esa
  // primera impresión la hizo el hub, nunca pasó por la cola de la nube).
  await db
    .from('orders')
    .update({
      synced_from_hub: true,
      status: 'PREP',
      accepted_at: new Date().toISOString(),
    })
    .eq('id', order.id);

  sendPushToRestaurant(restaurantId, {
    title: '📶 Pedido sincronizado',
    body: `${order.order_number} · ${customer.name} · tomado sin conexión`,
    tag: order.id,
    url: '/admin/pedidos',
  }).catch(() => {});

  return { clientId, ok: true, orderId: order.id, orderNumber: order.order_number };
}

export async function POST(req: Request) {
  const agent = await authenticateAgent(req);
  if (!agent) return new NextResponse('Token de agente inválido.', { status: 401 });

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const orders = Array.isArray(body.orders) ? body.orders : [];
  if (orders.length === 0) return NextResponse.json({ results: [] });

  const db = createServiceClient();
  const results: SyncResult[] = [];
  for (const rawOrder of orders) {
    results.push(await syncOne(db, agent, rawOrder));
  }

  return NextResponse.json({ results });
}
